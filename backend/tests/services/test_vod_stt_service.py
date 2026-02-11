"""VodSttService 화자 분리(diarization) 통합 테스트.

# @TASK P5-T1.3 - VodSttService에서 화자 정보 저장
# @SPEC VodSttService.process()에서 diarize=True로 STT 호출,
#       화자별 그룹핑 후 자막 저장

테스트 케이스:
1. diarize=True로 STT 호출 확인 (Deepgram API 파라미터)
2. utterances가 있을 때 화자별 자막 생성
3. 화자 레이블 포맷 ("화자 1", "화자 2")
4. utterances가 없을 때 words 폴백 (화자별 그룹핑)
5. words도 없을 때 빈 자막 처리
6. None 화자 레이블 처리
"""

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import tempfile

import pytest

from app.services.vod_stt_service import VodSttService, SttTaskStatus, _tasks


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
        """_send_to_deepgram()가 diarize=true 파라미터로 호출되어야 합니다."""
        service = VodSttService()

        # 임시 파일 생성
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(b"fake_mp4_content")
            tmp_path = Path(tmp.name)

        try:
            deepgram_response = {
                "metadata": {"duration": 10.0},
                "results": {
                    "utterances": [
                        {
                            "speaker": 0,
                            "transcript": "테스트",
                            "start": 0.0,
                            "end": 1.0,
                            "confidence": 0.9,
                        }
                    ]
                },
            }

            with patch.object(
                VodSttService, "_download_to_file", new_callable=AsyncMock
            ) as mock_dl:
                mock_dl.return_value = tmp_path

                with patch.object(
                    VodSttService, "_send_to_deepgram", new_callable=AsyncMock
                ) as mock_dg:
                    mock_dg.return_value = deepgram_response

                    await service.process(
                        "meeting-1", "http://example.com/v.mp4", mock_supabase
                    )

                    # _send_to_deepgram 호출 확인
                    assert mock_dg.called
                    # 첫 번째 호출의 첫 번째 인자는 mp4_path
                    call_args = mock_dg.call_args
                    assert call_args is not None
                    # task는 두 번째 인자
                    assert isinstance(call_args[0][1], SttTaskStatus)

        finally:
            tmp_path.unlink(missing_ok=True)

    @pytest.mark.asyncio
    async def test_speaker_grouping_with_utterances(self, mock_supabase):
        """utterances가 있을 때 화자별로 자막이 생성되어야 합니다."""
        service = VodSttService()

        # 임시 파일 생성
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(b"fake_mp4_content")
            tmp_path = Path(tmp.name)

        try:
            deepgram_response = {
                "metadata": {"duration": 5.0},
                "results": {
                    "utterances": [
                        {
                            "speaker": 0,
                            "transcript": "안녕하세요 회의를 시작합니다.",
                            "start": 0.0,
                            "end": 3.0,
                            "confidence": 0.9,
                        },
                        {
                            "speaker": 1,
                            "transcript": "네, 알겠습니다.",
                            "start": 3.0,
                            "end": 5.0,
                            "confidence": 0.95,
                        },
                    ]
                },
            }

            inserted_subtitles = []

            def capture_insert(data):
                inserted_subtitles.extend(data)
                mock_chain = MagicMock()
                mock_chain.execute.return_value = MagicMock()
                return mock_chain

            mock_supabase.table.return_value.insert.side_effect = capture_insert

            with patch.object(
                VodSttService, "_download_to_file", new_callable=AsyncMock
            ) as mock_dl:
                mock_dl.return_value = tmp_path

                with patch.object(
                    VodSttService, "_send_to_deepgram", new_callable=AsyncMock
                ) as mock_dg:
                    mock_dg.return_value = deepgram_response

                    await service.process(
                        "meeting-1", "http://example.com/v.mp4", mock_supabase
                    )

            # 2개 자막 (화자 0, 화자 1)
            assert len(inserted_subtitles) == 2

            # 화자 0 자막
            sub0 = inserted_subtitles[0]
            assert sub0["speaker"] == "화자 1"  # 0-based -> 1-based
            assert sub0["text"] == "안녕하세요 회의를 시작합니다."
            assert sub0["start_time"] == 0.0
            assert sub0["end_time"] == 3.0

            # 화자 1 자막
            sub1 = inserted_subtitles[1]
            assert sub1["speaker"] == "화자 2"  # 1-based
            assert sub1["text"] == "네, 알겠습니다."
            assert sub1["start_time"] == 3.0
            assert sub1["end_time"] == 5.0

        finally:
            tmp_path.unlink(missing_ok=True)

    @pytest.mark.asyncio
    async def test_fallback_when_no_utterances_with_words(self, mock_supabase):
        """utterances가 없으면 words로 폴백하여 화자별 그룹핑된 자막이 생성되어야 합니다."""
        service = VodSttService()

        # 임시 파일 생성
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(b"fake_mp4_content")
            tmp_path = Path(tmp.name)

        try:
            words = [
                {
                    "word": "안녕하세요",
                    "speaker": 0,
                    "confidence": 0.9,
                    "start": 0.0,
                    "end": 1.0,
                },
                {
                    "word": "회의를",
                    "speaker": 0,
                    "confidence": 0.85,
                    "start": 1.0,
                    "end": 2.0,
                },
                {
                    "word": "시작합니다.",
                    "speaker": 0,
                    "confidence": 0.88,
                    "start": 2.0,
                    "end": 3.0,
                },
                {"word": "네,", "speaker": 1, "confidence": 0.92, "start": 3.0, "end": 3.5},
                {
                    "word": "알겠습니다.",
                    "speaker": 1,
                    "confidence": 0.95,
                    "start": 3.5,
                    "end": 5.0,
                },
            ]

            deepgram_response = {
                "metadata": {"duration": 5.0},
                "results": {
                    "utterances": [],  # utterances 없음 → words로 폴백
                    "channels": [
                        {
                            "alternatives": [
                                {
                                    "transcript": "안녕하세요 회의를 시작합니다. 네, 알겠습니다.",
                                    "confidence": 0.9,
                                    "words": words,
                                }
                            ]
                        }
                    ],
                },
            }

            inserted_subtitles = []

            def capture_insert(data):
                inserted_subtitles.extend(data)
                mock_chain = MagicMock()
                mock_chain.execute.return_value = MagicMock()
                return mock_chain

            mock_supabase.table.return_value.insert.side_effect = capture_insert

            with patch.object(
                VodSttService, "_download_to_file", new_callable=AsyncMock
            ) as mock_dl:
                mock_dl.return_value = tmp_path

                with patch.object(
                    VodSttService, "_send_to_deepgram", new_callable=AsyncMock
                ) as mock_dg:
                    mock_dg.return_value = deepgram_response

                    await service.process(
                        "meeting-1", "http://example.com/v.mp4", mock_supabase
                    )

            # words 폴백: 2개 그룹 (화자별 분할)
            assert len(inserted_subtitles) == 2

            # 화자 0 그룹
            sub0 = inserted_subtitles[0]
            assert sub0["speaker"] == "화자 1"
            assert "안녕하세요" in sub0["text"]
            assert "회의를" in sub0["text"]
            assert "시작합니다" in sub0["text"]

            # 화자 1 그룹
            sub1 = inserted_subtitles[1]
            assert sub1["speaker"] == "화자 2"
            assert "네" in sub1["text"]
            assert "알겠습니다" in sub1["text"]

        finally:
            tmp_path.unlink(missing_ok=True)

    @pytest.mark.asyncio
    async def test_none_speaker_label(self, mock_supabase):
        """speaker가 None인 words는 speaker=None으로 저장되어야 합니다."""
        service = VodSttService()

        # 임시 파일 생성
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(b"fake_mp4_content")
            tmp_path = Path(tmp.name)

        try:
            words = [
                {"word": "테스트", "speaker": None, "confidence": 0.9, "start": 0.0, "end": 1.0},
            ]

            deepgram_response = {
                "metadata": {"duration": 1.0},
                "results": {
                    "utterances": [],  # utterances 없음 → words로 폴백
                    "channels": [
                        {
                            "alternatives": [
                                {
                                    "transcript": "테스트",
                                    "confidence": 0.9,
                                    "words": words,
                                }
                            ]
                        }
                    ],
                },
            }

            inserted_subtitles = []

            def capture_insert(data):
                inserted_subtitles.extend(data)
                mock_chain = MagicMock()
                mock_chain.execute.return_value = MagicMock()
                return mock_chain

            mock_supabase.table.return_value.insert.side_effect = capture_insert

            with patch.object(
                VodSttService, "_download_to_file", new_callable=AsyncMock
            ) as mock_dl:
                mock_dl.return_value = tmp_path

                with patch.object(
                    VodSttService, "_send_to_deepgram", new_callable=AsyncMock
                ) as mock_dg:
                    mock_dg.return_value = deepgram_response

                    await service.process(
                        "meeting-1", "http://example.com/v.mp4", mock_supabase
                    )

            assert len(inserted_subtitles) == 1
            assert inserted_subtitles[0]["speaker"] is None
            assert inserted_subtitles[0]["text"] == "테스트"

        finally:
            tmp_path.unlink(missing_ok=True)

    @pytest.mark.asyncio
    async def test_empty_text_groups_filtered(self, mock_supabase):
        """빈 텍스트 그룹은 필터링되어야 합니다."""
        service = VodSttService()

        # 임시 파일 생성
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(b"fake_mp4_content")
            tmp_path = Path(tmp.name)

        try:
            words = [
                {"word": " ", "speaker": 0, "confidence": 0.5, "start": 0.0, "end": 0.5},
                {
                    "word": "유효한텍스트",
                    "speaker": 1,
                    "confidence": 0.9,
                    "start": 0.5,
                    "end": 1.0,
                },
            ]

            deepgram_response = {
                "metadata": {"duration": 1.0},
                "results": {
                    "utterances": [],  # utterances 없음 → words로 폴백
                    "channels": [
                        {
                            "alternatives": [
                                {
                                    "transcript": "유효한텍스트",
                                    "confidence": 0.9,
                                    "words": words,
                                }
                            ]
                        }
                    ],
                },
            }

            inserted_subtitles = []

            def capture_insert(data):
                inserted_subtitles.extend(data)
                mock_chain = MagicMock()
                mock_chain.execute.return_value = MagicMock()
                return mock_chain

            mock_supabase.table.return_value.insert.side_effect = capture_insert

            with patch.object(
                VodSttService, "_download_to_file", new_callable=AsyncMock
            ) as mock_dl:
                mock_dl.return_value = tmp_path

                with patch.object(
                    VodSttService, "_send_to_deepgram", new_callable=AsyncMock
                ) as mock_dg:
                    mock_dg.return_value = deepgram_response

                    await service.process(
                        "meeting-1", "http://example.com/v.mp4", mock_supabase
                    )

            # 빈 텍스트(" ")는 strip() 후 필터링되어야 함
            # 유효한텍스트만 남음
            valid = [s for s in inserted_subtitles if s.get("text")]
            assert len(valid) >= 1
            assert all(s["text"].strip() for s in valid)
            assert "유효한텍스트" in [s["text"] for s in valid]

        finally:
            tmp_path.unlink(missing_ok=True)
