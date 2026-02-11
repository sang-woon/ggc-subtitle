"""pytest 공통 설정 및 픽스처

Supabase REST 클라이언트를 모킹합니다.
"""

import uuid
from datetime import datetime, timezone
from typing import Generator
import pytest
from fastapi.testclient import TestClient

from app.core.database import get_supabase
from app.main import app


def _make_subtitle_row(
    meeting_id: str,
    text: str = "테스트 자막",
    start_time: float = 0.0,
    end_time: float = 5.0,
    speaker: str | None = "발언자",
    confidence: float | None = 0.95,
    subtitle_id: str | None = None,
) -> dict:
    """Supabase 응답 형태의 자막 dict를 생성합니다."""
    return {
        "id": subtitle_id or str(uuid.uuid4()),
        "meeting_id": str(meeting_id),
        "start_time": start_time,
        "end_time": end_time,
        "text": text,
        "speaker": speaker,
        "confidence": confidence,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


class MockSupabaseResponse:
    """Supabase execute() 반환 객체"""

    def __init__(self, data: list | None = None, count: int | None = None):
        self.data = data or []
        self.count = count


class MockSupabaseQuery:
    """Supabase 체이닝 쿼리 빌더 모킹

    .table("x").select("*").eq("k","v").execute() 패턴을 지원합니다.
    """

    def __init__(self, data: list | None = None, count: int | None = None):
        self._data = data or []
        self._count = count

    # 체이닝 메서드: 모두 self 반환
    def select(self, *args, **kwargs) -> "MockSupabaseQuery":
        if kwargs.get("count") == "exact":
            self._count = len(self._data)
        return self

    def eq(self, *args, **kwargs) -> "MockSupabaseQuery":
        return self

    def ilike(self, *args, **kwargs) -> "MockSupabaseQuery":
        return self

    def order(self, *args, **kwargs) -> "MockSupabaseQuery":
        return self

    def range(self, *args, **kwargs) -> "MockSupabaseQuery":
        return self

    def limit(self, *args, **kwargs) -> "MockSupabaseQuery":
        return self

    def update(self, *args, **kwargs) -> "MockSupabaseQuery":
        return self

    def insert(self, *args, **kwargs) -> "MockSupabaseQuery":
        return self

    def delete(self, *args, **kwargs) -> "MockSupabaseQuery":
        return self

    def upsert(self, *args, **kwargs) -> "MockSupabaseQuery":
        return self

    def neq(self, *args, **kwargs) -> "MockSupabaseQuery":
        return self

    def lt(self, *args, **kwargs) -> "MockSupabaseQuery":
        return self

    def in_(self, *args, **kwargs) -> "MockSupabaseQuery":
        return self

    def execute(self) -> MockSupabaseResponse:
        return MockSupabaseResponse(data=self._data, count=self._count)


class MockSupabaseClient:
    """Supabase Client 모킹

    table() 호출 시 MockSupabaseQuery를 반환합니다.
    """

    def __init__(self, table_data: dict[str, list] | None = None):
        self._table_data = table_data or {}

    def table(self, name: str) -> MockSupabaseQuery:
        data = self._table_data.get(name, [])
        return MockSupabaseQuery(data=data)


@pytest.fixture
def meeting_id() -> uuid.UUID:
    """테스트용 회의 ID"""
    return uuid.uuid4()


@pytest.fixture
def mock_subtitles(meeting_id: uuid.UUID) -> list[dict]:
    """테스트용 자막 목록 (dict 형태)"""
    mid = str(meeting_id)
    return [
        _make_subtitle_row(mid, "첫 번째 자막입니다", 0.0, 5.0),
        _make_subtitle_row(mid, "두 번째 자막입니다", 5.0, 10.0),
        _make_subtitle_row(mid, "테스트 키워드 포함", 10.0, 15.0),
    ]


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """기본 테스트 클라이언트 (빈 DB)"""
    mock_supabase = MockSupabaseClient()
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def client_with_mock_db(
    mock_subtitles: list[dict],
) -> Generator[TestClient, None, None]:
    """자막 데이터가 있는 Supabase 모킹 클라이언트"""
    mock_supabase = MockSupabaseClient(
        table_data={"subtitles": mock_subtitles}
    )
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def client_with_empty_db() -> Generator[TestClient, None, None]:
    """빈 DB를 사용하는 테스트 클라이언트"""
    mock_supabase = MockSupabaseClient(table_data={"subtitles": []})
    app.dependency_overrides[get_supabase] = lambda: mock_supabase
    yield TestClient(app)
    app.dependency_overrides.clear()
