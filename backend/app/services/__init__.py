"""비즈니스 로직 서비스 모듈"""

from app.services.dictionary import DictionaryEntry, DictionaryService
from app.services.stream_processor import (
    AudioExtractionError,
    SegmentDownloadError,
    StreamProcessor,
    StreamProcessorConfig,
    StreamProcessorError,
)
from app.services.deepgram_stt import (
    APIError,
    RateLimitError,
    TimeoutError,
    TranscriptionResult,
    DeepgramError,
    DeepgramService,
)

__all__ = [
    # Dictionary Service
    "DictionaryEntry",
    "DictionaryService",
    # Stream Processor Service
    "StreamProcessor",
    "StreamProcessorConfig",
    "StreamProcessorError",
    "SegmentDownloadError",
    "AudioExtractionError",
    # Deepgram STT Service
    "DeepgramService",
    "TranscriptionResult",
    "DeepgramError",
    "RateLimitError",
    "TimeoutError",
    "APIError",
]
