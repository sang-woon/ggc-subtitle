"""Meetings API 라우터"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.meeting import Meeting
from app.schemas.meeting import (
    MeetingCreate,
    MeetingResponse,
    MeetingStatus,
)


router = APIRouter(prefix="/api/meetings", tags=["meetings"])


# =============================================================================
# Service Functions
# =============================================================================


async def get_meetings_service(
    db: AsyncSession,
    status: Optional[MeetingStatus] = None,
    limit: int = 10,
    offset: int = 0,
) -> list[dict]:
    """회의 목록을 조회합니다.

    Args:
        db: 데이터베이스 세션
        status: 필터링할 상태
        limit: 조회할 개수
        offset: 시작 위치

    Returns:
        회의 목록
    """
    query = select(Meeting)

    if status:
        query = query.where(Meeting.status == status.value)

    query = query.order_by(Meeting.meeting_date.desc())
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    meetings = result.scalars().all()

    return [
        MeetingResponse.model_validate(meeting).model_dump(mode="json")
        for meeting in meetings
    ]


async def get_live_meeting_service(db: AsyncSession) -> Optional[dict]:
    """실시간 회의를 조회합니다.

    Args:
        db: 데이터베이스 세션

    Returns:
        실시간 회의 정보 또는 None
    """
    query = select(Meeting).where(Meeting.status == MeetingStatus.LIVE.value)
    result = await db.execute(query)
    meeting = result.scalar_one_or_none()

    if meeting:
        return MeetingResponse.model_validate(meeting).model_dump(mode="json")
    return None


async def get_meeting_by_id_service(db: AsyncSession, meeting_id: UUID) -> Optional[dict]:
    """회의 ID로 회의를 조회합니다.

    Args:
        db: 데이터베이스 세션
        meeting_id: 회의 ID

    Returns:
        회의 정보 또는 None
    """
    query = select(Meeting).where(Meeting.id == meeting_id)
    result = await db.execute(query)
    meeting = result.scalar_one_or_none()

    if meeting:
        return MeetingResponse.model_validate(meeting).model_dump(mode="json")
    return None


async def create_meeting_service(db: AsyncSession, meeting_data: MeetingCreate) -> dict:
    """새 회의를 생성합니다.

    Args:
        db: 데이터베이스 세션
        meeting_data: 회의 생성 데이터

    Returns:
        생성된 회의 정보
    """
    meeting = Meeting(
        title=meeting_data.title,
        meeting_date=meeting_data.meeting_date,
        stream_url=meeting_data.stream_url,
        vod_url=meeting_data.vod_url,
        status=meeting_data.status.value,
        duration_seconds=meeting_data.duration_seconds,
    )

    db.add(meeting)
    await db.flush()
    await db.refresh(meeting)

    return MeetingResponse.model_validate(meeting).model_dump(mode="json")


# =============================================================================
# API Endpoints
# =============================================================================


@router.get("", response_model=list[MeetingResponse])
async def get_meetings(
    status: Optional[MeetingStatus] = Query(None, description="회의 상태 필터"),
    limit: int = Query(10, ge=1, le=100, description="조회할 개수"),
    offset: int = Query(0, ge=0, description="시작 위치"),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """회의 목록을 조회합니다.

    Args:
        status: 필터링할 상태 (선택)
        limit: 조회할 개수 (기본 10, 최대 100)
        offset: 시작 위치 (기본 0)
        db: 데이터베이스 세션

    Returns:
        회의 목록
    """
    return await get_meetings_service(db, status=status, limit=limit, offset=offset)


@router.get("/live", response_model=Optional[MeetingResponse])
async def get_live_meeting(
    db: AsyncSession = Depends(get_db),
) -> Optional[dict]:
    """현재 실시간 회의를 조회합니다.

    Returns:
        실시간 회의 정보 또는 null
    """
    return await get_live_meeting_service(db)


@router.get("/{meeting_id}", response_model=MeetingResponse)
async def get_meeting_by_id(
    meeting_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """회의 ID로 회의를 조회합니다.

    Args:
        meeting_id: 회의 UUID
        db: 데이터베이스 세션

    Returns:
        회의 정보

    Raises:
        HTTPException: 회의를 찾을 수 없는 경우 404
    """
    meeting = await get_meeting_by_id_service(db, meeting_id)

    if meeting is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting with id {meeting_id} not found",
        )

    return meeting


@router.post("", response_model=MeetingResponse, status_code=status.HTTP_201_CREATED)
async def create_meeting(
    meeting_data: MeetingCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """새 회의(VOD)를 등록합니다.

    Args:
        meeting_data: 회의 생성 데이터
        db: 데이터베이스 세션

    Returns:
        생성된 회의 정보
    """
    return await create_meeting_service(db, meeting_data)
