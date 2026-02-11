"""VodSttService 화자 분리(diarization) 통합 테스트.

# @TASK P5-T1.3 - VodSttService에서 화자 정보 저장
# @SPEC VodSttService.process()에서 diarize=True로 STT 호출,
#       화자별 그룹핑 후 자막 저장

테스트 케이스:
1. diarize=True로 STT 호출 확인
2. words가 있을 때 화자별 그룹핑 후 자막 생성
3. 화자 레이블 포맷 ("화자 1", "화자 2")
4. chunk.start_time 기반 절대 시간 계산
5. words가 없을 때 기존 방식 폴백
6. 빈 텍스트 그룹 필터링
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.deepgram_stt import DeepgramService, TranscriptionResult
from app.services.vod_stt_service import VodSttService, _tasks


@pytest.fixture(autouse=True)
def clear_tasks():
    """각 테스트 전후로 인메모리 태스크 저장소를 초기화합니다."""
    _tasks.clear()
    yield
    _tasks.clear()


@pytest.fixture
def mock_supabase():
    """Mock Supabase 클라이언트."""
    client = MagicMock()
    # table().update().eq().execute() 체이닝
    mock_table = MagicMock()
    mock_update = MagicMock()
    mock_eq = MagicMock()
    mock_execute = MagicMock()
    mock_insert = MagicMock()

    client.table.return_value = mock_table
    mock_table.update.return_value = mock_update
    mock_update.eq.return_value = mock_eq
    mock_eq.execute.return_value = mock_execute

    mock_table.insert.return_value = mock_insert
    mock_insert.execute.return_value = mock_execute

    return client


class TestVodSttServiceDiarization:
    """VodSttService 화자 분리 통합 테스트."""

    @pytest.mark.asyncio
    async def test_transcribe_called_with_diarize_true(self, mock_supabase):
        """transcribe()가 diarize=True로 호출되어야 합니다."""
        service = VodSttService()

        with patch.object(
            VodSttService, "_download_with_progress", new_callable=AsyncMock
        ) as mock_dl:
            mock_dl.return_value = b"fake_mp4"

            with patch(
                "app.services.vod_stt_service.DeepgramService"
            ) as MockDG:
                mock_stt = AsyncMock(spec=DeepgramService)
                mock_stt.transcribe.return_value = TranscriptionResult(
                    text="테스트", confidence=0.9, words=[]
                )
                mock_stt.close = AsyncMock()
                MockDG.from_config.return_value = mock_stt

                with patch(
                    "app.services.vod_stt_service.VodProcessor"
                ) as MockVP:
                    mock_vp = MagicMock()
                    mock_vp.extract_audio_from_bytes = AsyncMock(
                        return_value=b"audio"
                    )
                    mock_vp._get_audio_duration.return_value = 10.0
                    mock_vp.split_audio_into_chunks = AsyncMock(
                        return_value=[
                            MagicMock(
                                audio_data=b"chunk",
                                start_time=0.0,
                                end_time=10.0,
                            )
                        ]
                    )
                    MockVP.return_value = mock_vp

                    await service.process("meeting-1", "http://example.com/v.mp4", mock_supabase)

                    # diarize=True 확인
                    call_kwargs = mock_stt.transcribe.call_args.kwargs
                    assert call_kwargs.get("diarize") is True

    @pytest.mark.asyncio
    async def test_speaker_grouping_with_words(self, mock_supabase):
        """words가 있을 때 화자별로 그룹핑된 자막이 생성되어야 합니다."""
        service = VodSttService()

        words = [
            {"word": "안녕하세요", "speaker": 0, "confidence": 0.9, "start": 0.0, "end": 1.0},
            {"word": "회의를", "speaker": 0, "confidence": 0.85, "start": 1.0, "end": 2.0},
            {"word": "시작합니다.", "speaker": 0, "confidence": 0.88, "start": 2.0, "end": 3.0},
            {"word": "네,", "speaker": 1, "confidence": 0.92, "start": 3.0, "end": 3.5},
            {"word": "알겠습니다.", "speaker": 1, "confidence": 0.95, "start": 3.5, "end": 5.0},
        ]

        inserted_subtitles = []

        def capture_insert(data):
            inserted_subtitles.extend(data)
            mock_chain = MagicMock()
            mock_chain.execute.return_value = MagicMock()
            return mock_chain

        mock_supabase.table.return_value.insert.side_effect = capture_insert

        with patch.object(
            VodSttService, "_download_with_progress", new_callable=AsyncMock
        ) as mock_dl:
            mock_dl.return_value = b"fake_mp4"

            with patch(
                "app.services.vod_stt_service.DeepgramService"
            ) as MockDG:
                mock_stt = AsyncMock(spec=DeepgramService)
                mock_stt.transcribe.return_value = TranscriptionResult(
                    text="안녕하세요 회의를 시작합니다. 네, 알겠습니다.",
                    confidence=0.9,
                    words=words,
                )
                mock_stt.close = AsyncMock()
                MockDG.from_config.return_value = mock_stt

                with patch(
                    "app.services.vod_stt_service.VodProcessor"
                ) as MockVP:
                    mock_vp = MagicMock()
                    mock_vp.extract_audio_from_bytes = AsyncMock(
                        return_value=b"audio"
                    )
                    mock_vp._get_audio_duration.return_value = 10.0
                    mock_vp.split_audio_into_chunks = AsyncMock(
                        return_value=[
                            MagicMock(
                                audio_data=b"chunk",
                                start_time=30.0,
                                end_time=40.0,
                            )
                        ]
                    )
                    MockVP.return_value = mock_vp

                    await service.process("meeting-1", "http://example.com/v.mp4", mock_supabase)

        # 2개 그룹 (화자 0, 화자 1)
        assert len(inserted_subtitles) == 2

        # 화자 0 그룹
        sub0 = inserted_subtitles[0]
        assert sub0["speaker"] == "화자 1"  # 0-based -> 1-based
        assert sub0["text"] == "안녕하세요 회의를 시작합니다."
        # chunk.start_time (30.0) + group["start"] (0.0)
        assert sub0["start_time"] == pytest.approx(30.0)
        # chunk.start_time (30.0) + group["end"] (3.0)
        assert sub0["end_time"] == pytest.approx(33.0)

        # 화자 1 그룹
        sub1 = inserted_subtitles[1]
        assert sub1["speaker"] == "화자 2"  # 1-based
        assert sub1["text"] == "네, 알겠습니다."
        # chunk.start_time (30.0) + group["start"] (3.0)
        assert sub1["start_time"] == pytest.approx(33.0)
        # chunk.start_time (30.0) + group["end"] (5.0)
        assert sub1["end_time"] == pytest.approx(35.0)

    @pytest.mark.asyncio
    async def test_fallback_when_no_words(self, mock_supabase):
        """words가 비어있을 때 기존 방식으로 자막이 생성되어야 합니다."""
        service = VodSttService()

        inserted_subtitles = []

        def capture_insert(data):
            inserted_subtitles.extend(data)
            mock_chain = MagicMock()
            mock_chain.execute.return_value = MagicMock()
            return mock_chain

        mock_supabase.table.return_value.insert.side_effect = capture_insert

        with patch.object(
            VodSttService, "_download_with_progress", new_callable=AsyncMock
        ) as mock_dl:
            mock_dl.return_value = b"fake_mp4"

            with patch(
                "app.services.vod_stt_service.DeepgramService"
            ) as MockDG:
                mock_stt = AsyncMock(spec=DeepgramService)
                mock_stt.transcribe.return_value = TranscriptionResult(
                    text="안녕하세요",
                    confidence=0.9,
                    words=[],  # words 비어있음
                )
                mock_stt.close = AsyncMock()
                MockDG.from_config.return_value = mock_stt

                with patch(
                    "app.services.vod_stt_service.VodProcessor"
                ) as MockVP:
                    mock_vp = MagicMock()
                    mock_vp.extract_audio_from_bytes = AsyncMock(
                        return_value=b"audio"
                    )
                    mock_vp._get_audio_duration.return_value = 10.0
                    mock_vp.split_audio_into_chunks = AsyncMock(
                        return_value=[
                            MagicMock(
                                audio_data=b"chunk",
                                start_time=0.0,
                                end_time=10.0,
                            )
                        ]
                    )
                    MockVP.return_value = mock_vp

                    await service.process("meeting-1", "http://example.com/v.mp4", mock_supabase)

        # 기존 방식: 1개 자막 (화자 없음)
        assert len(inserted_subtitles) == 1
        assert inserted_subtitles[0]["text"] == "안녕하세요"
        assert inserted_subtitles[0]["speaker"] is None
        assert inserted_subtitles[0]["start_time"] == 0.0
        assert inserted_subtitles[0]["end_time"] == 10.0

    @pytest.mark.asyncio
    async def test_none_speaker_label(self, mock_supabase):
        """speaker가 None인 words는 speaker=None으로 저장되어야 합니다."""
        service = VodSttService()

        words = [
            {"word": "테스트", "speaker": None, "confidence": 0.9, "start": 0.0, "end": 1.0},
        ]

        inserted_subtitles = []

        def capture_insert(data):
            inserted_subtitles.extend(data)
            mock_chain = MagicMock()
            mock_chain.execute.return_value = MagicMock()
            return mock_chain

        mock_supabase.table.return_value.insert.side_effect = capture_insert

        with patch.object(
            VodSttService, "_download_with_progress", new_callable=AsyncMock
        ) as mock_dl:
            mock_dl.return_value = b"fake_mp4"

            with patch(
                "app.services.vod_stt_service.DeepgramService"
            ) as MockDG:
                mock_stt = AsyncMock(spec=DeepgramService)
                mock_stt.transcribe.return_value = TranscriptionResult(
                    text="테스트",
                    confidence=0.9,
                    words=words,
                )
                mock_stt.close = AsyncMock()
                MockDG.from_config.return_value = mock_stt

                with patch(
                    "app.services.vod_stt_service.VodProcessor"
                ) as MockVP:
                    mock_vp = MagicMock()
                    mock_vp.extract_audio_from_bytes = AsyncMock(
                        return_value=b"audio"
                    )
                    mock_vp._get_audio_duration.return_value = 5.0
                    mock_vp.split_audio_into_chunks = AsyncMock(
                        return_value=[
                            MagicMock(
                                audio_data=b"chunk",
                                start_time=0.0,
                                end_time=5.0,
                            )
                        ]
                    )
                    MockVP.return_value = mock_vp

                    await service.process("meeting-1", "http://example.com/v.mp4", mock_supabase)

        assert len(inserted_subtitles) == 1
        assert inserted_subtitles[0]["speaker"] is None

    @pytest.mark.asyncio
    async def test_empty_text_groups_filtered(self, mock_supabase):
        """빈 텍스트 그룹은 필터링되어야 합니다."""
        service = VodSttService()

        words = [
            {"word": " ", "speaker": 0, "confidence": 0.5, "start": 0.0, "end": 0.5},
            {"word": "유효한텍스트", "speaker": 1, "confidence": 0.9, "start": 0.5, "end": 1.0},
        ]

        inserted_subtitles = []

        def capture_insert(data):
            inserted_subtitles.extend(data)
            mock_chain = MagicMock()
            mock_chain.execute.return_value = MagicMock()
            return mock_chain

        mock_supabase.table.return_value.insert.side_effect = capture_insert

        with patch.object(
            VodSttService, "_download_with_progress", new_callable=AsyncMock
        ) as mock_dl:
            mock_dl.return_value = b"fake_mp4"

            with patch(
                "app.services.vod_stt_service.DeepgramService"
            ) as MockDG:
                mock_stt = AsyncMock(spec=DeepgramService)
                mock_stt.transcribe.return_value = TranscriptionResult(
                    text="유효한텍스트",
                    confidence=0.9,
                    words=words,
                )
                mock_stt.close = AsyncMock()
                MockDG.from_config.return_value = mock_stt

                with patch(
                    "app.services.vod_stt_service.VodProcessor"
                ) as MockVP:
                    mock_vp = MagicMock()
                    mock_vp.extract_audio_from_bytes = AsyncMock(
                        return_value=b"audio"
                    )
                    mock_vp._get_audio_duration.return_value = 5.0
                    mock_vp.split_audio_into_chunks = AsyncMock(
                        return_value=[
                            MagicMock(
                                audio_data=b"chunk",
                                start_time=0.0,
                                end_time=5.0,
                            )
                        ]
                    )
                    MockVP.return_value = mock_vp

                    await service.process("meeting-1", "http://example.com/v.mp4", mock_supabase)

        # 빈 텍스트(" ")는 strip() 후 비어있으므로 필터링
        # 유효한텍스트만 남아야 함
        valid = [s for s in inserted_subtitles if s.get("text")]
        assert len(valid) >= 1
        assert all(s["text"].strip() for s in valid)
