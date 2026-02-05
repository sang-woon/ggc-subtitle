"""VOD 프로세서 서비스 테스트 (TDD - RED Phase)

VOD(MP4) 파일에서 자막을 생성하는 서비스 테스트.

테스트 케이스:
1. test_download_vod_success - VOD 다운로드
2. test_extract_audio_from_mp4 - ffmpeg 오디오 추출
3. test_split_audio_into_chunks - 청크 분할
4. test_batch_transcribe_chunks - 배치 STT
5. test_calculate_timestamps - 타임스탬프 계산
6. test_save_subtitles_to_db - DB 저장
7. test_full_vod_processing_pipeline - 전체 파이프라인
8. test_update_meeting_status - 상태 업데이트
"""

import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.vod_processor import (
    VodProcessor,
    VodProcessorConfig,
    VodProcessorError,
    VodDownloadError,
    AudioChunk,
    SubtitleData,
)
from app.services.deepgram_stt import DeepgramService, TranscriptionResult


class TestVodDownload:
    """VOD 다운로드 테스트"""

    @pytest.fixture
    def vod_processor(self) -> VodProcessor:
        """VodProcessor 인스턴스"""
        stt_service = MagicMock(spec=DeepgramService)
        return VodProcessor(stt_service=stt_service)

    @pytest.fixture
    def mock_vod_url(self) -> str:
        """테스트용 VOD URL"""
        return "https://example.com/videos/meeting_20240101.mp4"

    @pytest.mark.asyncio
    async def test_download_vod_success(
        self, vod_processor: VodProcessor, mock_vod_url: str
    ):
        """VOD 다운로드 성공 테스트"""
        # Arrange
        expected_content = b"fake_mp4_content" * 1000

        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.read = AsyncMock(return_value=expected_content)

            mock_session.get = MagicMock(return_value=AsyncMock(
                __aenter__=AsyncMock(return_value=mock_response),
                __aexit__=AsyncMock(return_value=None),
            ))
            mock_session_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_session
            )
            mock_session_class.return_value.__aexit__ = AsyncMock(return_value=None)

            # Act
            result = await vod_processor.download_vod(mock_vod_url)

            # Assert
            assert result == expected_content
            assert len(result) == len(expected_content)

    @pytest.mark.asyncio
    async def test_download_vod_not_found(
        self, vod_processor: VodProcessor, mock_vod_url: str
    ):
        """VOD 다운로드 실패 테스트 (404)"""
        with patch("aiohttp.ClientSession") as mock_session_class:
            mock_session = AsyncMock()
            mock_response = AsyncMock()
            mock_response.status = 404

            mock_session.get = MagicMock(return_value=AsyncMock(
                __aenter__=AsyncMock(return_value=mock_response),
                __aexit__=AsyncMock(return_value=None),
            ))
            mock_session_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_session
            )
            mock_session_class.return_value.__aexit__ = AsyncMock(return_value=None)

            # Act & Assert
            with pytest.raises(VodDownloadError, match="404"):
                await vod_processor.download_vod(mock_vod_url)

    @pytest.mark.asyncio
    async def test_download_vod_to_file(
        self, vod_processor: VodProcessor, mock_vod_url: str, tmp_path: Path
    ):
        """VOD 파일로 다운로드 테스트"""
        # Arrange
        expected_content = b"fake_mp4_content" * 1000
        output_path = tmp_path / "test_video.mp4"

        with patch.object(
            vod_processor, "download_vod", new_callable=AsyncMock
        ) as mock_download:
            mock_download.return_value = expected_content

            # Act
            result_path = await vod_processor.download_vod_to_file(
                mock_vod_url, output_path
            )

            # Assert
            assert result_path == output_path
            assert output_path.exists()
            assert output_path.read_bytes() == expected_content


class TestAudioExtraction:
    """오디오 추출 테스트"""

    @pytest.fixture
    def vod_processor(self) -> VodProcessor:
        """VodProcessor 인스턴스"""
        stt_service = MagicMock(spec=DeepgramService)
        return VodProcessor(stt_service=stt_service)

    @pytest.mark.asyncio
    async def test_extract_audio_from_mp4(self, vod_processor: VodProcessor):
        """MP4에서 오디오 추출 테스트"""
        # Arrange
        mp4_path = Path("/tmp/test_video.mp4")
        expected_audio = b"RIFF" + b"\x00" * 44 + b"audio_data" * 100

        with patch("asyncio.create_subprocess_exec") as mock_subprocess:
            mock_process = AsyncMock()
            mock_process.returncode = 0
            mock_process.communicate = AsyncMock(
                return_value=(expected_audio, b"")
            )
            mock_subprocess.return_value = mock_process

            # Act
            result = await vod_processor.extract_audio_from_file(mp4_path)

            # Assert
            assert result == expected_audio
            mock_subprocess.assert_called_once()

    @pytest.mark.asyncio
    async def test_extract_audio_ffmpeg_error(self, vod_processor: VodProcessor):
        """FFmpeg 오류 테스트"""
        mp4_path = Path("/tmp/test_video.mp4")

        with patch("asyncio.create_subprocess_exec") as mock_subprocess:
            mock_process = AsyncMock()
            mock_process.returncode = 1
            mock_process.communicate = AsyncMock(
                return_value=(b"", b"FFmpeg error: invalid input")
            )
            mock_subprocess.return_value = mock_process

            # Act & Assert
            with pytest.raises(VodProcessorError, match="FFmpeg"):
                await vod_processor.extract_audio_from_file(mp4_path)


class TestAudioChunking:
    """오디오 청크 분할 테스트"""

    @pytest.fixture
    def vod_processor(self) -> VodProcessor:
        """VodProcessor 인스턴스 (30초 청크)"""
        stt_service = MagicMock(spec=DeepgramService)
        config = VodProcessorConfig(chunk_duration_seconds=30)
        return VodProcessor(stt_service=stt_service, config=config)

    @pytest.mark.asyncio
    async def test_split_audio_into_chunks(self, vod_processor: VodProcessor):
        """오디오를 30초 청크로 분할 테스트"""
        # Arrange - 90초 분량의 오디오 시뮬레이션
        audio_data = b"audio_data" * 10000  # 약 90초 분량
        total_duration = 90.0  # seconds

        with patch.object(
            vod_processor, "_get_audio_duration", return_value=total_duration
        ):
            with patch.object(
                vod_processor, "_extract_audio_chunk", new_callable=AsyncMock
            ) as mock_extract:
                # 각 청크 반환값 설정
                chunk_audio_1 = b"chunk_1_audio"
                chunk_audio_2 = b"chunk_2_audio"
                chunk_audio_3 = b"chunk_3_audio"
                mock_extract.side_effect = [
                    chunk_audio_1,
                    chunk_audio_2,
                    chunk_audio_3,
                ]

                # Act
                chunks = await vod_processor.split_audio_into_chunks(
                    audio_data, total_duration
                )

                # Assert
                assert len(chunks) == 3
                assert chunks[0].start_time == 0.0
                assert chunks[0].end_time == 30.0
                assert chunks[0].audio_data == chunk_audio_1

                assert chunks[1].start_time == 30.0
                assert chunks[1].end_time == 60.0
                assert chunks[1].audio_data == chunk_audio_2

                assert chunks[2].start_time == 60.0
                assert chunks[2].end_time == 90.0
                assert chunks[2].audio_data == chunk_audio_3

    @pytest.mark.asyncio
    async def test_split_audio_short_duration(self, vod_processor: VodProcessor):
        """30초 미만 오디오 처리 테스트"""
        # Arrange - 15초 분량의 오디오
        audio_data = b"short_audio"
        total_duration = 15.0

        with patch.object(
            vod_processor, "_get_audio_duration", return_value=total_duration
        ):
            with patch.object(
                vod_processor, "_extract_audio_chunk", new_callable=AsyncMock
            ) as mock_extract:
                mock_extract.return_value = audio_data

                # Act
                chunks = await vod_processor.split_audio_into_chunks(
                    audio_data, total_duration
                )

                # Assert
                assert len(chunks) == 1
                assert chunks[0].start_time == 0.0
                assert chunks[0].end_time == 15.0


class TestBatchTranscription:
    """배치 STT 테스트"""

    @pytest.fixture
    def deepgram_service(self) -> AsyncMock:
        """Mock Deepgram 서비스"""
        service = AsyncMock(spec=DeepgramService)
        return service

    @pytest.fixture
    def vod_processor(self, deepgram_service: AsyncMock) -> VodProcessor:
        """VodProcessor 인스턴스"""
        return VodProcessor(stt_service=deepgram_service)

    @pytest.mark.asyncio
    async def test_batch_transcribe_chunks(
        self, vod_processor: VodProcessor, deepgram_service: AsyncMock
    ):
        """배치 STT 처리 테스트"""
        # Arrange
        chunks = [
            AudioChunk(
                index=0,
                start_time=0.0,
                end_time=30.0,
                audio_data=b"chunk_1_audio",
            ),
            AudioChunk(
                index=1,
                start_time=30.0,
                end_time=60.0,
                audio_data=b"chunk_2_audio",
            ),
            AudioChunk(
                index=2,
                start_time=60.0,
                end_time=90.0,
                audio_data=b"chunk_3_audio",
            ),
        ]

        deepgram_service.transcribe.side_effect = [
            TranscriptionResult(text="안녕하세요. 회의를 시작하겠습니다.", confidence=0.95),
            TranscriptionResult(text="첫 번째 안건입니다.", confidence=0.92),
            TranscriptionResult(text="감사합니다.", confidence=0.98),
        ]

        # Act
        subtitles = await vod_processor.batch_transcribe_chunks(chunks)

        # Assert
        assert len(subtitles) == 3
        assert subtitles[0].text == "안녕하세요. 회의를 시작하겠습니다."
        assert subtitles[0].start_time == 0.0
        assert subtitles[0].end_time == 30.0
        assert subtitles[0].confidence == 0.95

        assert subtitles[1].text == "첫 번째 안건입니다."
        assert subtitles[1].start_time == 30.0

        assert subtitles[2].text == "감사합니다."
        assert subtitles[2].start_time == 60.0

        # Deepgram 서비스가 3번 호출되었는지 확인
        assert deepgram_service.transcribe.call_count == 3

    @pytest.mark.asyncio
    async def test_batch_transcribe_with_councilor_names(
        self, vod_processor: VodProcessor, deepgram_service: AsyncMock
    ):
        """의원 이름 적용 배치 STT 테스트"""
        # Arrange
        chunks = [
            AudioChunk(
                index=0,
                start_time=0.0,
                end_time=30.0,
                audio_data=b"chunk_audio",
            ),
        ]
        councilor_names = ["김철수", "박영희"]

        deepgram_service.transcribe.return_value = TranscriptionResult(
            text="김철수 의원님 발언해 주십시오.", confidence=0.95
        )

        # Act
        await vod_processor.batch_transcribe_chunks(
            chunks, councilor_names=councilor_names
        )

        # Assert - councilor_names가 전달되었는지 확인
        call_args = deepgram_service.transcribe.call_args
        assert call_args.kwargs.get("councilor_names") == councilor_names

    @pytest.mark.asyncio
    async def test_batch_transcribe_empty_result_filtered(
        self, vod_processor: VodProcessor, deepgram_service: AsyncMock
    ):
        """빈 결과 필터링 테스트"""
        # Arrange
        chunks = [
            AudioChunk(index=0, start_time=0.0, end_time=30.0, audio_data=b"audio1"),
            AudioChunk(index=1, start_time=30.0, end_time=60.0, audio_data=b"audio2"),
            AudioChunk(index=2, start_time=60.0, end_time=90.0, audio_data=b"audio3"),
        ]

        deepgram_service.transcribe.side_effect = [
            TranscriptionResult(text="첫 번째 자막", confidence=0.95),
            TranscriptionResult(text="", confidence=0.0),  # 빈 결과
            TranscriptionResult(text="세 번째 자막", confidence=0.90),
        ]

        # Act
        subtitles = await vod_processor.batch_transcribe_chunks(chunks)

        # Assert - 빈 결과는 필터링됨
        assert len(subtitles) == 2
        assert subtitles[0].text == "첫 번째 자막"
        assert subtitles[1].text == "세 번째 자막"


class TestTimestampCalculation:
    """타임스탬프 계산 테스트"""

    @pytest.fixture
    def vod_processor(self) -> VodProcessor:
        """VodProcessor 인스턴스"""
        stt_service = MagicMock(spec=DeepgramService)
        return VodProcessor(stt_service=stt_service)

    def test_calculate_timestamps(self, vod_processor: VodProcessor):
        """타임스탬프 계산 테스트"""
        # Arrange
        chunk_index = 2
        chunk_duration = 30.0

        # Act
        start_time, end_time = vod_processor.calculate_timestamps(
            chunk_index, chunk_duration
        )

        # Assert
        assert start_time == 60.0  # 2 * 30
        assert end_time == 90.0  # 2 * 30 + 30

    def test_calculate_timestamps_partial_chunk(self, vod_processor: VodProcessor):
        """마지막 불완전한 청크 타임스탬프 계산"""
        # Arrange
        chunk_index = 3
        chunk_duration = 30.0
        actual_duration = 15.0  # 마지막 청크는 15초

        # Act
        start_time, end_time = vod_processor.calculate_timestamps(
            chunk_index, chunk_duration, actual_duration=actual_duration
        )

        # Assert
        assert start_time == 90.0  # 3 * 30
        assert end_time == 105.0  # 3 * 30 + 15


class TestDatabaseStorage:
    """DB 저장 테스트"""

    @pytest.fixture
    def vod_processor(self) -> VodProcessor:
        """VodProcessor 인스턴스"""
        stt_service = MagicMock(spec=DeepgramService)
        return VodProcessor(stt_service=stt_service)

    @pytest.fixture
    def meeting_id(self) -> uuid.UUID:
        """테스트용 회의 ID"""
        return uuid.uuid4()

    @pytest.fixture
    def mock_db_session(self) -> AsyncMock:
        """Mock DB 세션"""
        session = AsyncMock()
        session.add = MagicMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()
        return session

    @pytest.mark.asyncio
    async def test_save_subtitles_to_db(
        self,
        vod_processor: VodProcessor,
        meeting_id: uuid.UUID,
        mock_db_session: AsyncMock,
    ):
        """자막 DB 저장 테스트"""
        # Arrange
        subtitles_data = [
            SubtitleData(
                text="첫 번째 자막",
                start_time=0.0,
                end_time=30.0,
                confidence=0.95,
            ),
            SubtitleData(
                text="두 번째 자막",
                start_time=30.0,
                end_time=60.0,
                confidence=0.92,
            ),
        ]

        # Act
        saved_count = await vod_processor.save_subtitles_to_db(
            meeting_id=meeting_id,
            subtitles=subtitles_data,
            db=mock_db_session,
        )

        # Assert
        assert saved_count == 2
        assert mock_db_session.add.call_count == 2
        mock_db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_save_subtitles_with_speaker(
        self,
        vod_processor: VodProcessor,
        meeting_id: uuid.UUID,
        mock_db_session: AsyncMock,
    ):
        """화자 정보 포함 자막 저장 테스트"""
        # Arrange
        subtitles_data = [
            SubtitleData(
                text="김철수 의원 발언입니다.",
                start_time=0.0,
                end_time=30.0,
                confidence=0.95,
                speaker="김철수",
            ),
        ]

        # Act
        await vod_processor.save_subtitles_to_db(
            meeting_id=meeting_id,
            subtitles=subtitles_data,
            db=mock_db_session,
        )

        # Assert
        call_args = mock_db_session.add.call_args
        saved_subtitle = call_args[0][0]
        assert saved_subtitle.speaker == "김철수"


class TestMeetingStatusUpdate:
    """회의 상태 업데이트 테스트"""

    @pytest.fixture
    def vod_processor(self) -> VodProcessor:
        """VodProcessor 인스턴스"""
        stt_service = MagicMock(spec=DeepgramService)
        return VodProcessor(stt_service=stt_service)

    @pytest.fixture
    def meeting_id(self) -> uuid.UUID:
        """테스트용 회의 ID"""
        return uuid.uuid4()

    @pytest.fixture
    def mock_db_session(self) -> AsyncMock:
        """Mock DB 세션"""
        session = AsyncMock()
        session.execute = AsyncMock()
        session.commit = AsyncMock()
        return session

    @pytest.mark.asyncio
    async def test_update_meeting_status_to_processing(
        self,
        vod_processor: VodProcessor,
        meeting_id: uuid.UUID,
        mock_db_session: AsyncMock,
    ):
        """회의 상태 processing으로 업데이트 테스트"""
        # Act
        await vod_processor.update_meeting_status(
            meeting_id=meeting_id,
            status="processing",
            db=mock_db_session,
        )

        # Assert
        mock_db_session.execute.assert_called_once()
        mock_db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_meeting_status_to_ended(
        self,
        vod_processor: VodProcessor,
        meeting_id: uuid.UUID,
        mock_db_session: AsyncMock,
    ):
        """회의 상태 ended로 업데이트 테스트"""
        # Act
        await vod_processor.update_meeting_status(
            meeting_id=meeting_id,
            status="ended",
            db=mock_db_session,
        )

        # Assert
        mock_db_session.execute.assert_called_once()
        mock_db_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_meeting_status_with_duration(
        self,
        vod_processor: VodProcessor,
        meeting_id: uuid.UUID,
        mock_db_session: AsyncMock,
    ):
        """회의 상태 및 duration 업데이트 테스트"""
        # Act
        await vod_processor.update_meeting_status(
            meeting_id=meeting_id,
            status="ended",
            db=mock_db_session,
            duration_seconds=3600,  # 1시간
        )

        # Assert
        mock_db_session.execute.assert_called_once()
        mock_db_session.commit.assert_called_once()


class TestFullPipeline:
    """전체 파이프라인 테스트"""

    @pytest.fixture
    def deepgram_service(self) -> AsyncMock:
        """Mock Deepgram 서비스"""
        service = AsyncMock(spec=DeepgramService)
        return service

    @pytest.fixture
    def vod_processor(self, deepgram_service: AsyncMock) -> VodProcessor:
        """VodProcessor 인스턴스"""
        config = VodProcessorConfig(chunk_duration_seconds=30)
        return VodProcessor(stt_service=deepgram_service, config=config)

    @pytest.fixture
    def meeting_id(self) -> uuid.UUID:
        """테스트용 회의 ID"""
        return uuid.uuid4()

    @pytest.fixture
    def mock_db_session(self) -> AsyncMock:
        """Mock DB 세션"""
        session = AsyncMock()
        session.add = MagicMock()
        session.commit = AsyncMock()
        session.refresh = AsyncMock()
        session.execute = AsyncMock()
        return session

    @pytest.mark.asyncio
    async def test_full_vod_processing_pipeline(
        self,
        vod_processor: VodProcessor,
        deepgram_service: AsyncMock,
        meeting_id: uuid.UUID,
        mock_db_session: AsyncMock,
        tmp_path: Path,
    ):
        """전체 VOD 처리 파이프라인 테스트"""
        # Arrange
        vod_url = "https://example.com/videos/meeting.mp4"
        mp4_content = b"fake_mp4_content" * 1000
        audio_content = b"RIFF" + b"\x00" * 44 + b"audio" * 1000
        total_duration = 60.0  # 60초 -> 2개 청크

        # Mock 설정
        with patch.object(
            vod_processor, "download_vod", new_callable=AsyncMock
        ) as mock_download:
            mock_download.return_value = mp4_content

            with patch.object(
                vod_processor, "extract_audio_from_file", new_callable=AsyncMock
            ) as mock_extract:
                mock_extract.return_value = audio_content

                with patch.object(
                    vod_processor, "_get_audio_duration", return_value=total_duration
                ):
                    with patch.object(
                        vod_processor, "_extract_audio_chunk", new_callable=AsyncMock
                    ) as mock_extract_chunk:
                        mock_extract_chunk.side_effect = [
                            b"chunk_1_audio",
                            b"chunk_2_audio",
                        ]

                        deepgram_service.transcribe.side_effect = [
                            TranscriptionResult(
                                text="안녕하세요. 회의 시작합니다.",
                                confidence=0.95,
                            ),
                            TranscriptionResult(
                                text="감사합니다.",
                                confidence=0.92,
                            ),
                        ]

                        # Act
                        result = await vod_processor.process_vod(
                            vod_url=vod_url,
                            meeting_id=meeting_id,
                            db=mock_db_session,
                        )

                        # Assert
                        assert result["status"] == "completed"
                        assert result["subtitles_count"] == 2
                        assert result["duration_seconds"] == total_duration

                        # DB 저장 확인
                        assert mock_db_session.add.call_count == 2
                        assert mock_db_session.commit.call_count >= 1

    @pytest.mark.asyncio
    async def test_pipeline_with_error_handling(
        self,
        vod_processor: VodProcessor,
        meeting_id: uuid.UUID,
        mock_db_session: AsyncMock,
    ):
        """파이프라인 에러 핸들링 테스트"""
        # Arrange
        vod_url = "https://example.com/videos/not_found.mp4"

        with patch.object(
            vod_processor, "download_vod", new_callable=AsyncMock
        ) as mock_download:
            mock_download.side_effect = VodDownloadError("404 Not Found")

            # Act
            result = await vod_processor.process_vod(
                vod_url=vod_url,
                meeting_id=meeting_id,
                db=mock_db_session,
            )

            # Assert
            assert result["status"] == "error"
            assert "error" in result
            assert "404" in result["error"]


class TestVodProcessorConfig:
    """VodProcessor 설정 테스트"""

    def test_default_config(self):
        """기본 설정 테스트"""
        config = VodProcessorConfig()

        assert config.chunk_duration_seconds == 30
        assert config.max_retries == 3
        assert config.retry_delay == 1.0
        assert config.audio_sample_rate == 16000
        assert config.audio_channels == 1

    def test_custom_config(self):
        """커스텀 설정 테스트"""
        config = VodProcessorConfig(
            chunk_duration_seconds=60,
            max_retries=5,
            audio_sample_rate=44100,
        )

        assert config.chunk_duration_seconds == 60
        assert config.max_retries == 5
        assert config.audio_sample_rate == 44100


class TestProgressTracking:
    """진행률 추적 테스트 (선택)"""

    @pytest.fixture
    def vod_processor(self) -> VodProcessor:
        """VodProcessor 인스턴스"""
        stt_service = MagicMock(spec=DeepgramService)
        return VodProcessor(stt_service=stt_service)

    @pytest.mark.asyncio
    async def test_progress_callback(self, vod_processor: VodProcessor):
        """진행률 콜백 테스트"""
        # Arrange
        progress_values = []

        def progress_callback(progress: float, message: str):
            progress_values.append((progress, message))

        # Act
        vod_processor.set_progress_callback(progress_callback)

        # 진행률 알림 시뮬레이션
        vod_processor._notify_progress(0.0, "다운로드 시작")
        vod_processor._notify_progress(0.25, "오디오 추출 완료")
        vod_processor._notify_progress(0.5, "청크 1/2 처리 중")
        vod_processor._notify_progress(1.0, "처리 완료")

        # Assert
        assert len(progress_values) == 4
        assert progress_values[0] == (0.0, "다운로드 시작")
        assert progress_values[-1] == (1.0, "처리 완료")
