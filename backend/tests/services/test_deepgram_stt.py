"""Deepgram STT 서비스 테스트 (TDD - RED Phase)

Deepgram Nova-3 모델을 사용한 음성-텍스트 변환 서비스 테스트.

테스트 케이스:
1. test_deepgram_transcribe_success - 정상 변환
2. test_deepgram_with_councilor_prompt - 의원 명단 프롬프트 적용
3. test_deepgram_rate_limit_retry - rate limit 재시도
4. test_dictionary_correction - 용어 교정
5. test_councilor_name_correction - 의원 이름 교정
6. test_diarize_parameter_passed - diarize 파라미터 전달
7. test_diarize_words_in_result - diarize 응답의 words 필드 파싱
8. test_transcription_result_words_default - words 기본값 빈 리스트
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.deepgram_stt import (
    DeepgramService,
    TranscriptionResult,
    DeepgramError,
    RateLimitError,
    TimeoutError,
    APIError,
)
from app.services.dictionary import DictionaryService, DictionaryEntry


class TestDeepgramService:
    """Deepgram 서비스 테스트"""

    @pytest.fixture
    def deepgram_service(self) -> DeepgramService:
        """Deepgram 서비스 인스턴스"""
        return DeepgramService(api_key="test-api-key")

    @pytest.fixture
    def mock_audio_chunk(self) -> bytes:
        """테스트용 오디오 청크 (WAV 형식 헤더 포함)"""
        # 최소한의 WAV 파일 헤더 생성
        wav_header = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"fmt " + b"\x00" * 20
        audio_data = b"\x00" * 1000
        return wav_header + audio_data

    @pytest.fixture
    def councilor_names(self) -> list[str]:
        """테스트용 의원 명단"""
        return ["김철수", "박영희", "이민수", "최유진"]

    @pytest.fixture
    def mock_deepgram_response(self) -> dict:
        """Deepgram API 응답 형식 mock"""
        return {
            "results": {
                "channels": [
                    {
                        "alternatives": [
                            {
                                "transcript": "안녕하세요. 오늘 회의를 시작하겠습니다.",
                                "confidence": 0.98,
                            }
                        ]
                    }
                ]
            }
        }

    @pytest.mark.asyncio
    async def test_deepgram_transcribe_success(
        self, deepgram_service: DeepgramService, mock_audio_chunk: bytes
    ):
        """정상 변환 테스트"""
        # Arrange
        expected_text = "안녕하세요. 오늘 회의를 시작하겠습니다."
        expected_confidence = 0.98

        with patch.object(
            deepgram_service, "_call_deepgram_api", new_callable=AsyncMock
        ) as mock_api:
            mock_api.return_value = TranscriptionResult(
                text=expected_text,
                confidence=expected_confidence,
            )

            # Act
            result = await deepgram_service.transcribe(mock_audio_chunk)

            # Assert
            assert result.text == expected_text
            assert result.confidence == expected_confidence
            mock_api.assert_called_once()

    @pytest.mark.asyncio
    async def test_deepgram_with_councilor_prompt(
        self,
        deepgram_service: DeepgramService,
        mock_audio_chunk: bytes,
        councilor_names: list[str],
    ):
        """의원 명단 프롬프트 적용 테스트 (keywords 기능 활용)"""
        # Arrange
        expected_text = "김철수 의원님, 발언해 주십시오."

        with patch.object(
            deepgram_service, "_call_deepgram_api", new_callable=AsyncMock
        ) as mock_api:
            mock_api.return_value = TranscriptionResult(
                text=expected_text,
                confidence=0.98,
            )

            # Act
            result = await deepgram_service.transcribe(
                mock_audio_chunk,
                councilor_names=councilor_names,
            )

            # Assert
            assert result.text == expected_text
            # keywords 파라미터가 전달되었는지 확인
            call_args = mock_api.call_args
            assert call_args is not None
            if "keywords" in call_args.kwargs:
                keywords = call_args.kwargs["keywords"]
                assert any(name in keywords for name in councilor_names)

    @pytest.mark.asyncio
    async def test_deepgram_rate_limit_retry(
        self, deepgram_service: DeepgramService, mock_audio_chunk: bytes
    ):
        """Rate limit 재시도 테스트"""
        # Arrange
        expected_text = "재시도 후 성공한 텍스트입니다."

        # 첫 번째 호출은 RateLimitError, 두 번째 호출은 성공
        with patch.object(
            deepgram_service, "_call_deepgram_api", new_callable=AsyncMock
        ) as mock_api:
            mock_api.side_effect = [
                RateLimitError("Rate limit exceeded"),
                TranscriptionResult(text=expected_text, confidence=0.90),
            ]

            # Act
            result = await deepgram_service.transcribe(
                mock_audio_chunk,
                max_retries=3,
            )

            # Assert
            assert result.text == expected_text
            assert mock_api.call_count == 2

    @pytest.mark.asyncio
    async def test_deepgram_rate_limit_max_retries_exceeded(
        self, deepgram_service: DeepgramService, mock_audio_chunk: bytes
    ):
        """Rate limit 최대 재시도 초과 테스트"""
        with patch.object(
            deepgram_service, "_call_deepgram_api", new_callable=AsyncMock
        ) as mock_api:
            mock_api.side_effect = RateLimitError("Rate limit exceeded")

            # Act & Assert
            with pytest.raises(RateLimitError):
                await deepgram_service.transcribe(
                    mock_audio_chunk,
                    max_retries=2,
                )

            assert mock_api.call_count == 3  # 초기 시도 1회 + 재시도 2회

    @pytest.mark.asyncio
    async def test_deepgram_timeout_error(
        self, deepgram_service: DeepgramService, mock_audio_chunk: bytes
    ):
        """타임아웃 에러 테스트"""
        with patch.object(
            deepgram_service, "_call_deepgram_api", new_callable=AsyncMock
        ) as mock_api:
            mock_api.side_effect = TimeoutError("Request timed out")

            # Act & Assert
            with pytest.raises(TimeoutError):
                await deepgram_service.transcribe(mock_audio_chunk)

    @pytest.mark.asyncio
    async def test_deepgram_empty_audio(self, deepgram_service: DeepgramService):
        """빈 오디오 처리 테스트"""
        # Arrange
        empty_audio = b""

        # Act
        result = await deepgram_service.transcribe(empty_audio)

        # Assert
        assert result.text == ""
        assert result.confidence == 0.0

    @pytest.mark.asyncio
    async def test_deepgram_model_selection(self):
        """모델 선택 테스트 (Nova-3)"""
        # Arrange
        service = DeepgramService(api_key="test-key", model="nova-3")

        # Assert
        assert service._model == "nova-3"

    @pytest.mark.asyncio
    async def test_deepgram_language_setting(
        self, deepgram_service: DeepgramService, mock_audio_chunk: bytes
    ):
        """언어 설정 테스트 (한국어)"""
        with patch.object(
            deepgram_service, "_call_deepgram_api", new_callable=AsyncMock
        ) as mock_api:
            mock_api.return_value = TranscriptionResult(
                text="테스트", confidence=0.95
            )

            # Act
            await deepgram_service.transcribe(mock_audio_chunk, language="ko")

            # Assert
            call_args = mock_api.call_args
            assert call_args is not None
            assert call_args.kwargs.get("language") == "ko"


class TestDictionaryServiceWithDeepgram:
    """사전 서비스 테스트 (Deepgram과 함께 사용)"""

    @pytest.fixture
    def dictionary_service(self) -> DictionaryService:
        """사전 서비스 인스턴스"""
        entries = [
            DictionaryEntry(
                wrong_text="경기도 의회",
                correct_text="경기도의회",
                category="term",
            ),
            DictionaryEntry(
                wrong_text="예산안",
                correct_text="예산(안)",
                category="term",
            ),
            DictionaryEntry(
                wrong_text="김철순",
                correct_text="김철수",
                category="councilor",
            ),
            DictionaryEntry(
                wrong_text="박영휘",
                correct_text="박영희",
                category="councilor",
            ),
        ]
        return DictionaryService(entries=entries)

    def test_dictionary_correction(self, dictionary_service: DictionaryService):
        """용어 교정 테스트"""
        # Arrange
        input_text = "경기도 의회에서 예산안을 심의합니다."
        expected_text = "경기도의회에서 예산(안)을 심의합니다."

        # Act
        result = dictionary_service.correct(input_text)

        # Assert
        assert result == expected_text

    def test_councilor_name_correction(self, dictionary_service: DictionaryService):
        """의원 이름 교정 테스트"""
        # Arrange
        input_text = "김철순 의원님이 발언하셨습니다. 이어서 박영휘 의원님."
        expected_text = "김철수 의원님이 발언하셨습니다. 이어서 박영희 의원님."

        # Act
        result = dictionary_service.correct(input_text)

        # Assert
        assert result == expected_text

    def test_dictionary_multiple_corrections(
        self, dictionary_service: DictionaryService
    ):
        """여러 교정 적용 테스트"""
        # Arrange
        input_text = "경기도 의회에서 김철순 의원이 예산안을 발표했습니다."
        expected_text = "경기도의회에서 김철수 의원이 예산(안)을 발표했습니다."

        # Act
        result = dictionary_service.correct(input_text)

        # Assert
        assert result == expected_text


class TestDeepgramServiceFactory:
    """Deepgram 서비스 팩토리 테스트"""

    def test_from_config_with_api_key(self):
        """API 키로 서비스 생성 테스트"""
        # Act
        service = DeepgramService.from_config(api_key="test-key")

        # Assert
        assert service is not None
        assert service._api_key == "test-key"

    def test_from_config_without_api_key_raises_error(self):
        """API 키 없이 서비스 생성 시 에러 발생 테스트"""
        # Arrange
        with patch("app.core.config.settings") as mock_settings:
            mock_settings.deepgram_api_key = ""

            # Act & Assert
            with pytest.raises(ValueError, match="API key is required"):
                DeepgramService.from_config()

    def test_from_config_with_dictionary_service(self):
        """사전 서비스와 함께 서비스 생성 테스트"""
        # Arrange
        dictionary_service = DictionaryService()

        # Act
        service = DeepgramService.from_config(
            api_key="test-key",
            dictionary_service=dictionary_service,
        )

        # Assert
        assert service._dictionary_service is dictionary_service

    def test_from_config_default_model_is_nova3(self):
        """기본 모델이 nova-3인지 확인"""
        # Act
        service = DeepgramService.from_config(api_key="test-key")

        # Assert
        assert service._model == "nova-3"


class TestDeepgramWithDictionary:
    """Deepgram + Dictionary 통합 테스트"""

    @pytest.fixture
    def deepgram_service(self) -> DeepgramService:
        """Deepgram 서비스 인스턴스"""
        entries = [
            DictionaryEntry(
                wrong_text="경기도 의회",
                correct_text="경기도의회",
                category="term",
            ),
        ]
        dictionary_service = DictionaryService(entries=entries)
        return DeepgramService(
            api_key="test-api-key",
            dictionary_service=dictionary_service,
        )

    @pytest.fixture
    def mock_audio_chunk(self) -> bytes:
        """테스트용 오디오 청크"""
        wav_header = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"fmt " + b"\x00" * 20
        return wav_header + b"\x00" * 1000

    @pytest.mark.asyncio
    async def test_transcribe_with_dictionary_correction(
        self, deepgram_service: DeepgramService, mock_audio_chunk: bytes
    ):
        """사전 교정이 적용된 변환 테스트"""
        # Arrange
        raw_text = "경기도 의회에서 회의가 진행됩니다."
        expected_text = "경기도의회에서 회의가 진행됩니다."

        with patch.object(
            deepgram_service, "_call_deepgram_api", new_callable=AsyncMock
        ) as mock_api:
            mock_api.return_value = TranscriptionResult(
                text=raw_text,
                confidence=0.95,
            )

            # Act
            result = await deepgram_service.transcribe(
                mock_audio_chunk,
                apply_dictionary=True,
            )

            # Assert
            assert result.text == expected_text


class TestDeepgramFeatures:
    """Deepgram 특화 기능 테스트"""

    @pytest.fixture
    def deepgram_service(self) -> DeepgramService:
        """Deepgram 서비스 인스턴스"""
        return DeepgramService(api_key="test-api-key")

    @pytest.fixture
    def mock_audio_chunk(self) -> bytes:
        """테스트용 오디오 청크"""
        wav_header = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"fmt " + b"\x00" * 20
        return wav_header + b"\x00" * 1000

    @pytest.mark.asyncio
    async def test_smart_format_enabled(
        self, deepgram_service: DeepgramService, mock_audio_chunk: bytes
    ):
        """smart_format 옵션 활성화 테스트"""
        with patch.object(
            deepgram_service, "_call_deepgram_api", new_callable=AsyncMock
        ) as mock_api:
            mock_api.return_value = TranscriptionResult(
                text="테스트", confidence=0.95
            )

            # Act
            await deepgram_service.transcribe(mock_audio_chunk)

            # Assert - smart_format이 기본으로 True인지 확인
            call_args = mock_api.call_args
            assert call_args is not None
            assert call_args.kwargs.get("smart_format") is True

    @pytest.mark.asyncio
    async def test_punctuate_enabled(
        self, deepgram_service: DeepgramService, mock_audio_chunk: bytes
    ):
        """punctuate 옵션 활성화 테스트"""
        with patch.object(
            deepgram_service, "_call_deepgram_api", new_callable=AsyncMock
        ) as mock_api:
            mock_api.return_value = TranscriptionResult(
                text="테스트", confidence=0.95
            )

            # Act
            await deepgram_service.transcribe(mock_audio_chunk)

            # Assert - punctuate가 기본으로 True인지 확인
            call_args = mock_api.call_args
            assert call_args is not None
            assert call_args.kwargs.get("punctuate") is True


class TestDeepgramContextManager:
    """Deepgram 서비스 컨텍스트 매니저 테스트"""

    @pytest.mark.asyncio
    async def test_async_context_manager(self):
        """async context manager 테스트"""
        # Act & Assert
        async with DeepgramService(api_key="test-key") as service:
            assert service is not None
            assert isinstance(service, DeepgramService)

    @pytest.mark.asyncio
    async def test_close_method(self):
        """close 메서드 테스트"""
        service = DeepgramService(api_key="test-key")
        # close가 에러 없이 호출되어야 함
        await service.close()


class TestTranscriptionResultWords:
    """TranscriptionResult words 필드 테스트"""

    def test_transcription_result_words_default_empty_list(self):
        """words 필드 기본값은 빈 리스트"""
        result = TranscriptionResult(text="테스트", confidence=0.95)
        assert result.words == []

    def test_transcription_result_with_words(self):
        """words 필드에 단어 데이터 설정"""
        words = [
            {"word": "안녕하세요", "start": 0.0, "end": 0.5, "speaker": 0, "confidence": 0.99},
            {"word": "오늘", "start": 0.6, "end": 0.9, "speaker": 1, "confidence": 0.97},
        ]
        result = TranscriptionResult(text="안녕하세요 오늘", confidence=0.98, words=words)
        assert len(result.words) == 2
        assert result.words[0]["speaker"] == 0
        assert result.words[1]["speaker"] == 1

    def test_transcription_result_backward_compatible(self):
        """기존 코드와의 호환성: text, confidence만으로 생성 가능"""
        result = TranscriptionResult(text="호환성", confidence=0.90)
        assert result.text == "호환성"
        assert result.confidence == 0.90
        assert result.words == []


class TestDiarization:
    """Deepgram Diarization 기능 테스트"""

    @pytest.fixture
    def deepgram_service(self) -> DeepgramService:
        """Deepgram 서비스 인스턴스"""
        return DeepgramService(api_key="test-api-key")

    @pytest.fixture
    def mock_audio_chunk(self) -> bytes:
        """테스트용 오디오 청크"""
        wav_header = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"fmt " + b"\x00" * 20
        return wav_header + b"\x00" * 1000

    @pytest.mark.asyncio
    async def test_diarize_parameter_passed_to_api(
        self, deepgram_service: DeepgramService, mock_audio_chunk: bytes
    ):
        """diarize=True가 _call_deepgram_api에 전달되는지 확인"""
        with patch.object(
            deepgram_service, "_call_deepgram_api", new_callable=AsyncMock
        ) as mock_api:
            mock_api.return_value = TranscriptionResult(
                text="테스트", confidence=0.95, words=[]
            )

            await deepgram_service.transcribe(mock_audio_chunk, diarize=True)

            call_args = mock_api.call_args
            assert call_args is not None
            assert call_args.kwargs.get("diarize") is True

    @pytest.mark.asyncio
    async def test_diarize_default_false(
        self, deepgram_service: DeepgramService, mock_audio_chunk: bytes
    ):
        """diarize 기본값은 False"""
        with patch.object(
            deepgram_service, "_call_deepgram_api", new_callable=AsyncMock
        ) as mock_api:
            mock_api.return_value = TranscriptionResult(
                text="테스트", confidence=0.95
            )

            await deepgram_service.transcribe(mock_audio_chunk)

            call_args = mock_api.call_args
            assert call_args is not None
            assert call_args.kwargs.get("diarize") is False

    @pytest.mark.asyncio
    async def test_diarize_api_url_contains_diarize_param(
        self, deepgram_service: DeepgramService, mock_audio_chunk: bytes
    ):
        """diarize=True 시 Deepgram API URL에 diarize=true 파라미터 포함"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "results": {
                "channels": [
                    {
                        "alternatives": [
                            {
                                "transcript": "안녕하세요",
                                "confidence": 0.98,
                                "words": [
                                    {
                                        "word": "안녕하세요",
                                        "start": 0.0,
                                        "end": 0.5,
                                        "confidence": 0.98,
                                        "speaker": 0,
                                    }
                                ],
                            }
                        ]
                    }
                ]
            }
        }

        with patch.object(
            deepgram_service._client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            result = await deepgram_service._call_deepgram_api(
                audio_chunk=mock_audio_chunk,
                diarize=True,
            )

            # API 호출 시 params에 diarize가 포함되었는지 확인
            call_args = mock_post.call_args
            params = call_args.kwargs.get("params", {})
            assert params.get("diarize") == "true"

    @pytest.mark.asyncio
    async def test_diarize_words_parsed_from_response(
        self, deepgram_service: DeepgramService, mock_audio_chunk: bytes
    ):
        """diarize 응답에서 words 배열이 파싱되어 결과에 포함"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "results": {
                "channels": [
                    {
                        "alternatives": [
                            {
                                "transcript": "안녕하세요 오늘 회의를 시작하겠습니다",
                                "confidence": 0.97,
                                "words": [
                                    {
                                        "word": "안녕하세요",
                                        "start": 0.0,
                                        "end": 0.5,
                                        "confidence": 0.99,
                                        "speaker": 0,
                                    },
                                    {
                                        "word": "오늘",
                                        "start": 0.6,
                                        "end": 0.9,
                                        "confidence": 0.97,
                                        "speaker": 0,
                                    },
                                    {
                                        "word": "회의를",
                                        "start": 1.0,
                                        "end": 1.4,
                                        "confidence": 0.96,
                                        "speaker": 1,
                                    },
                                    {
                                        "word": "시작하겠습니다",
                                        "start": 1.5,
                                        "end": 2.2,
                                        "confidence": 0.98,
                                        "speaker": 1,
                                    },
                                ],
                            }
                        ]
                    }
                ]
            }
        }

        with patch.object(
            deepgram_service._client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            result = await deepgram_service._call_deepgram_api(
                audio_chunk=mock_audio_chunk,
                diarize=True,
            )

            assert len(result.words) == 4
            assert result.words[0]["word"] == "안녕하세요"
            assert result.words[0]["speaker"] == 0
            assert result.words[2]["speaker"] == 1

    @pytest.mark.asyncio
    async def test_diarize_false_no_words_in_result(
        self, deepgram_service: DeepgramService, mock_audio_chunk: bytes
    ):
        """diarize=False 시 words는 빈 리스트 (Deepgram이 words를 반환하지 않을 때)"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "results": {
                "channels": [
                    {
                        "alternatives": [
                            {
                                "transcript": "안녕하세요",
                                "confidence": 0.98,
                            }
                        ]
                    }
                ]
            }
        }

        with patch.object(
            deepgram_service._client, "post", new_callable=AsyncMock
        ) as mock_post:
            mock_post.return_value = mock_response

            result = await deepgram_service._call_deepgram_api(
                audio_chunk=mock_audio_chunk,
                diarize=False,
            )

            assert result.words == []

    @pytest.mark.asyncio
    async def test_dictionary_correction_preserves_words(
        self, mock_audio_chunk: bytes
    ):
        """사전 후처리 시 words 필드가 보존되는지 확인"""
        entries = [
            DictionaryEntry(
                wrong_text="경기도 의회",
                correct_text="경기도의회",
                category="term",
            ),
        ]
        dictionary_service = DictionaryService(entries=entries)
        service = DeepgramService(
            api_key="test-api-key",
            dictionary_service=dictionary_service,
        )

        words_data = [
            {"word": "경기도", "start": 0.0, "end": 0.3, "speaker": 0, "confidence": 0.98},
            {"word": "의회", "start": 0.4, "end": 0.7, "speaker": 0, "confidence": 0.97},
        ]

        with patch.object(
            service, "_call_deepgram_api", new_callable=AsyncMock
        ) as mock_api:
            mock_api.return_value = TranscriptionResult(
                text="경기도 의회에서 회의합니다",
                confidence=0.95,
                words=words_data,
            )

            result = await service.transcribe(
                mock_audio_chunk,
                apply_dictionary=True,
                diarize=True,
            )

            # 사전 교정이 적용됨
            assert "경기도의회" in result.text
            # words 필드가 보존됨
            assert len(result.words) == 2
            assert result.words[0]["speaker"] == 0
