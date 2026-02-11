"""Deepgram STT API 클라이언트 서비스

Deepgram Nova-3 모델을 사용하여 오디오 청크를 텍스트로 변환하는 서비스입니다.

특징:
- Nova-3 모델: 다국어 지원, 한국어 최고 성능
- 가격: $0.0092/분 (약 730원/시간)
- 실시간 스트리밍 WebSocket 지원
"""

from __future__ import annotations

import asyncio
import io
from dataclasses import dataclass, field
from types import TracebackType
from typing import TYPE_CHECKING, Self

import httpx

if TYPE_CHECKING:
    from app.services.dictionary import DictionaryService


class DeepgramError(Exception):
    """Deepgram 서비스 기본 예외"""

    pass


class RateLimitError(DeepgramError):
    """Rate limit 초과 예외"""

    pass


class TimeoutError(DeepgramError):
    """타임아웃 예외"""

    pass


class APIError(DeepgramError):
    """API 호출 실패 예외"""

    pass


@dataclass
class TranscriptionResult:
    """변환 결과

    Attributes:
        text: 변환된 텍스트
        confidence: 신뢰도 (0~1)
        words: 단어별 상세 정보 리스트 (diarize 활성화 시)
               각 항목: {word, start, end, speaker, confidence}
    """

    text: str
    confidence: float
    words: list[dict] = field(default_factory=list)


class DeepgramService:
    """Deepgram STT API 클라이언트

    오디오 청크를 텍스트로 변환합니다.
    - Nova-3 모델 사용 (다국어, 한국어 지원)
    - 의원 명단 keywords로 정확도 향상
    - Rate limit, timeout 등 에러 핸들링
    - 사전 기반 후처리 지원
    """

    DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen"
    DEFAULT_MODEL = "nova-3"
    DEFAULT_LANGUAGE = "ko"
    DEFAULT_TIMEOUT = 30.0
    DEFAULT_RETRY_DELAY = 1.0

    def __init__(
        self,
        api_key: str,
        model: str = DEFAULT_MODEL,
        dictionary_service: "DictionaryService | None" = None,
        timeout: float = DEFAULT_TIMEOUT,
    ):
        """Deepgram 서비스 초기화

        Args:
            api_key: Deepgram API 키
            model: 사용할 모델 (기본값: nova-3)
            dictionary_service: 사전 서비스 (후처리용)
            timeout: API 호출 타임아웃 (초)
        """
        self._api_key = api_key
        self._model = model
        self._dictionary_service = dictionary_service
        self._timeout = timeout
        self._client = httpx.AsyncClient(timeout=timeout)

    async def transcribe(
        self,
        audio_chunk: bytes,
        *,
        councilor_names: list[str] | None = None,
        max_retries: int = 0,
        apply_dictionary: bool = False,
        language: str = DEFAULT_LANGUAGE,
        content_type: str = "audio/wav",
        diarize: bool = False,
    ) -> TranscriptionResult:
        """오디오 청크를 텍스트로 변환

        Args:
            audio_chunk: 오디오 데이터 (WAV, MP3 등)
            councilor_names: 의원 이름 목록 (keywords에 포함)
            max_retries: 최대 재시도 횟수 (rate limit 시)
            apply_dictionary: 사전 후처리 적용 여부
            language: 언어 코드 (기본값: ko)
            content_type: 오디오 Content-Type (기본값: audio/wav, TS는 application/octet-stream)
            diarize: 화자 분리 활성화 여부 (기본값: False)

        Returns:
            TranscriptionResult: 변환 결과

        Raises:
            RateLimitError: Rate limit 초과 시 (max_retries 초과 시)
            TimeoutError: 타임아웃 발생 시
            APIError: 기타 API 오류 시
        """
        # 빈 오디오 처리
        if not audio_chunk:
            return TranscriptionResult(text="", confidence=0.0)

        # keywords 생성 (의원 이름)
        keywords = self._build_keywords(councilor_names)

        # 재시도 로직
        retries = 0
        last_error = None

        while retries <= max_retries:
            try:
                result = await self._call_deepgram_api(
                    audio_chunk=audio_chunk,
                    language=language,
                    keywords=keywords,
                    smart_format=True,
                    punctuate=True,
                    content_type=content_type,
                    diarize=diarize,
                )

                # 사전 후처리
                if apply_dictionary and self._dictionary_service:
                    result = TranscriptionResult(
                        text=self._dictionary_service.correct(result.text),
                        confidence=result.confidence,
                        words=result.words,
                    )

                return result

            except RateLimitError as e:
                last_error = e
                retries += 1
                if retries <= max_retries:
                    # 지수 백오프
                    delay = self.DEFAULT_RETRY_DELAY * (2 ** (retries - 1))
                    await asyncio.sleep(delay)
                continue

        # 모든 재시도 실패
        raise last_error or RateLimitError("Rate limit exceeded")

    def _build_keywords(self, councilor_names: list[str] | None) -> list[str] | None:
        """Deepgram keywords 빌드

        의원 이름을 keywords로 전달하여 인식 정확도를 향상시킵니다.

        Args:
            councilor_names: 의원 이름 목록

        Returns:
            keywords 리스트 또는 None
        """
        if not councilor_names:
            return None

        # Deepgram keywords는 문자열 리스트
        return councilor_names

    async def _call_deepgram_api(
        self,
        audio_chunk: bytes,
        language: str = DEFAULT_LANGUAGE,
        keywords: list[str] | None = None,
        smart_format: bool = True,
        punctuate: bool = True,
        content_type: str = "audio/wav",
        diarize: bool = False,
    ) -> TranscriptionResult:
        """Deepgram API 호출

        Args:
            audio_chunk: 오디오 데이터
            language: 언어 코드
            keywords: 인식 정확도 향상을 위한 키워드
            smart_format: 스마트 포맷팅 (숫자, 날짜 등)
            punctuate: 구두점 자동 추가
            content_type: 오디오 Content-Type (기본값: audio/wav)
            diarize: 화자 분리 활성화 여부 (기본값: False)

        Returns:
            TranscriptionResult: 변환 결과

        Raises:
            RateLimitError: Rate limit 초과 시
            TimeoutError: 타임아웃 발생 시
            APIError: 기타 API 오류 시
        """
        # 쿼리 파라미터 구성
        params = {
            "model": self._model,
            "language": language,
            "smart_format": str(smart_format).lower(),
            "punctuate": str(punctuate).lower(),
        }

        # diarize 활성화 시 파라미터 추가
        if diarize:
            params["diarize"] = "true"

        # keywords가 있으면 추가
        if keywords:
            # Deepgram은 keywords를 쿼리 파라미터로 전달
            # 여러 키워드는 keywords=word1&keywords=word2 형식
            params["keywords"] = keywords

        headers = {
            "Authorization": f"Token {self._api_key}",
            "Content-Type": content_type,
        }

        try:
            response = await self._client.post(
                self.DEEPGRAM_API_URL,
                params=params,
                headers=headers,
                content=audio_chunk,
            )

            if response.status_code == 429:
                raise RateLimitError("Rate limit exceeded")

            if response.status_code != 200:
                raise APIError(f"API error: {response.status_code} - {response.text}")

            result = response.json()

            # Deepgram 응답에서 텍스트와 신뢰도 추출
            channels = result.get("results", {}).get("channels", [])
            if not channels:
                return TranscriptionResult(text="", confidence=0.0)

            alternatives = channels[0].get("alternatives", [])
            if not alternatives:
                return TranscriptionResult(text="", confidence=0.0)

            transcript = alternatives[0].get("transcript", "")
            confidence = alternatives[0].get("confidence", 0.0)

            # words 배열 파싱 (diarize 활성화 시 speaker 정보 포함)
            words_raw = alternatives[0].get("words", [])
            words = [
                {
                    "word": w.get("word", ""),
                    "start": w.get("start", 0.0),
                    "end": w.get("end", 0.0),
                    "confidence": w.get("confidence", 0.0),
                    "speaker": w.get("speaker"),
                }
                for w in words_raw
            ]

            return TranscriptionResult(
                text=transcript,
                confidence=confidence,
                words=words,
            )

        except httpx.TimeoutException:
            raise TimeoutError("Request timed out")
        except httpx.RequestError as e:
            raise APIError(f"Request failed: {str(e)}")

    @classmethod
    def from_config(
        cls,
        api_key: str | None = None,
        dictionary_service: "DictionaryService | None" = None,
        model: str = DEFAULT_MODEL,
    ) -> "DeepgramService":
        """설정으로부터 서비스 인스턴스 생성

        Args:
            api_key: Deepgram API 키 (None이면 환경변수에서 읽음)
            dictionary_service: 사전 서비스 (후처리용)
            model: 사용할 모델 (기본값: nova-3)

        Returns:
            DeepgramService 인스턴스

        Raises:
            ValueError: API 키가 설정되지 않은 경우
        """
        if api_key is None:
            from app.core.config import settings

            api_key = settings.deepgram_api_key

        if not api_key:
            raise ValueError("Deepgram API key is required")

        return cls(
            api_key=api_key,
            model=model,
            dictionary_service=dictionary_service,
        )

    async def close(self) -> None:
        """HTTP 클라이언트 종료"""
        await self._client.aclose()

    async def __aenter__(self) -> Self:
        """Async context manager 진입"""
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        """Async context manager 종료"""
        await self.close()
