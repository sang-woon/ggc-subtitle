"""pytest 공통 설정 및 픽스처"""

import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.main import app


class MockResult:
    """Mock SQLAlchemy Result"""

    def __init__(self, data: list | int = None):
        self._data = data or []

    def scalars(self) -> "MockResult":
        return self

    def all(self) -> list:
        return self._data

    def scalar(self) -> int | None:
        if isinstance(self._data, int):
            return self._data
        return len(self._data) if self._data else 0


class MockAsyncSession:
    """Mock Async SQLAlchemy Session for testing without real DB"""

    def __init__(self, subtitles: list = None):
        self._subtitles = subtitles or []

    async def execute(self, query) -> MockResult:
        """Execute query and return mock result"""
        # Check if it's a count query (by checking if func.count is used)
        query_str = str(query)
        if "count" in query_str.lower():
            return MockResult(len(self._subtitles))
        return MockResult(self._subtitles)

    async def commit(self) -> None:
        pass

    async def rollback(self) -> None:
        pass


def create_mock_subtitle(
    meeting_id: uuid.UUID,
    text: str = "테스트 자막",
    start_time: float = 0.0,
    end_time: float = 5.0,
    speaker: str | None = "발언자",
    confidence: float | None = 0.95,
) -> MagicMock:
    """테스트용 자막 객체 생성"""
    subtitle = MagicMock()
    subtitle.id = uuid.uuid4()
    subtitle.meeting_id = meeting_id
    subtitle.start_time = start_time
    subtitle.end_time = end_time
    subtitle.text = text
    subtitle.speaker = speaker
    subtitle.confidence = confidence
    subtitle.created_at = datetime.now(timezone.utc)
    return subtitle


@pytest.fixture
def meeting_id() -> uuid.UUID:
    """테스트용 회의 ID"""
    return uuid.uuid4()


@pytest.fixture
def mock_subtitles(meeting_id: uuid.UUID) -> list:
    """테스트용 자막 목록"""
    return [
        create_mock_subtitle(meeting_id, "첫 번째 자막입니다", 0.0, 5.0),
        create_mock_subtitle(meeting_id, "두 번째 자막입니다", 5.0, 10.0),
        create_mock_subtitle(meeting_id, "테스트 키워드 포함", 10.0, 15.0),
    ]


@pytest.fixture
def mock_db_session(mock_subtitles: list) -> MockAsyncSession:
    """Mock 데이터베이스 세션"""
    return MockAsyncSession(mock_subtitles)


@pytest.fixture
def client_with_mock_db(mock_db_session: MockAsyncSession) -> Generator[TestClient, None, None]:
    """Mock DB를 사용하는 테스트 클라이언트"""

    async def override_get_db() -> AsyncGenerator[MockAsyncSession, None]:
        yield mock_db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def client_with_empty_db() -> Generator[TestClient, None, None]:
    """빈 DB를 사용하는 테스트 클라이언트"""

    async def override_get_db() -> AsyncGenerator[MockAsyncSession, None]:
        yield MockAsyncSession([])

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def client() -> TestClient:
    """기본 테스트 클라이언트 (DB 없이 스키마 검증용)"""
    # 빈 DB로 오버라이드
    async def override_get_db() -> AsyncGenerator[MockAsyncSession, None]:
        yield MockAsyncSession([])

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()
