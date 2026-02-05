"""데이터베이스 및 Supabase 클라이언트 설정"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base
from supabase import Client, create_client

from app.core.config import settings

# SQLAlchemy Base
Base = declarative_base()

# Async SQLAlchemy Engine
# asyncpg 드라이버 사용을 위해 postgresql+asyncpg:// 형식으로 변환
_database_url = settings.database_url
if _database_url.startswith("postgresql://"):
    _database_url = _database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(
    _database_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

# Async Session Factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Supabase Client (싱글톤)
_supabase_client: Client | None = None


def get_supabase_client() -> Client:
    """Supabase 클라이언트 인스턴스를 반환합니다.

    Returns:
        Client: Supabase 클라이언트

    Raises:
        ValueError: Supabase URL 또는 KEY가 설정되지 않은 경우
    """
    global _supabase_client

    if _supabase_client is None:
        if not settings.supabase_url or not settings.supabase_key:
            raise ValueError(
                "SUPABASE_URL과 SUPABASE_KEY 환경변수가 설정되어야 합니다."
            )
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_key,
        )

    return _supabase_client


@asynccontextmanager
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """비동기 데이터베이스 세션을 생성합니다.

    Yields:
        AsyncSession: SQLAlchemy 비동기 세션
    """
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI Dependency용 데이터베이스 세션 제공자.

    Yields:
        AsyncSession: SQLAlchemy 비동기 세션
    """
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def test_database_connection() -> bool:
    """데이터베이스 연결을 테스트합니다.

    Returns:
        bool: 연결 성공 여부
    """
    try:
        async with async_session_maker() as session:
            await session.execute("SELECT 1")
        return True
    except Exception as e:
        print(f"데이터베이스 연결 실패: {e}")
        return False


async def test_supabase_connection() -> bool:
    """Supabase 연결을 테스트합니다.

    Returns:
        bool: 연결 성공 여부
    """
    try:
        client = get_supabase_client()
        # 간단한 health check - auth 서비스 접근 시도
        client.auth.get_session()
        return True
    except Exception as e:
        print(f"Supabase 연결 실패: {e}")
        return False


async def init_database() -> None:
    """데이터베이스 테이블을 초기화합니다."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_database() -> None:
    """데이터베이스 연결을 종료합니다."""
    await engine.dispose()
