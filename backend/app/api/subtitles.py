"""Subtitles API 라우터"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.subtitle import Subtitle
from app.schemas.subtitle import SubtitleListResponse, SubtitleResponse

router = APIRouter(prefix="/api/meetings", tags=["subtitles"])


@router.get(
    "/{meeting_id}/subtitles",
    response_model=SubtitleListResponse,
    summary="회의별 자막 목록 조회",
    description="특정 회의의 자막 목록을 조회합니다.",
)
async def get_subtitles(
    meeting_id: uuid.UUID,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    db: AsyncSession = Depends(get_db),
) -> SubtitleListResponse:
    """회의별 자막 목록을 조회합니다.

    Args:
        meeting_id: 회의 ID
        limit: 페이지 크기 (기본값: 100, 최대: 1000)
        offset: 오프셋 (기본값: 0)
        db: 데이터베이스 세션

    Returns:
        SubtitleListResponse: 자막 목록 및 페이지네이션 정보
    """
    # 전체 개수 조회
    count_query = select(func.count(Subtitle.id)).where(
        Subtitle.meeting_id == meeting_id
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # 자막 목록 조회 (시간순 정렬)
    query = (
        select(Subtitle)
        .where(Subtitle.meeting_id == meeting_id)
        .order_by(Subtitle.start_time)
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(query)
    subtitles = result.scalars().all()

    return SubtitleListResponse(
        items=[SubtitleResponse.model_validate(s) for s in subtitles],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{meeting_id}/subtitles/search",
    response_model=SubtitleListResponse,
    summary="자막 내 키워드 검색",
    description="특정 회의의 자막에서 키워드를 검색합니다.",
)
async def search_subtitles(
    meeting_id: uuid.UUID,
    q: Annotated[str, Query(min_length=1, description="검색어")],
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    db: AsyncSession = Depends(get_db),
) -> SubtitleListResponse:
    """자막 내 키워드를 검색합니다.

    Args:
        meeting_id: 회의 ID
        q: 검색어
        limit: 페이지 크기 (기본값: 100, 최대: 1000)
        offset: 오프셋 (기본값: 0)
        db: 데이터베이스 세션

    Returns:
        SubtitleListResponse: 검색 결과 목록 및 페이지네이션 정보
    """
    # 검색어 검증
    search_term = q.strip()
    if not search_term:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="검색어는 비어있을 수 없습니다")

    # 전체 개수 조회 (ILIKE로 대소문자 무시 검색)
    count_query = select(func.count(Subtitle.id)).where(
        Subtitle.meeting_id == meeting_id,
        Subtitle.text.ilike(f"%{search_term}%"),
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # 검색 결과 조회
    query = (
        select(Subtitle)
        .where(
            Subtitle.meeting_id == meeting_id,
            Subtitle.text.ilike(f"%{search_term}%"),
        )
        .order_by(Subtitle.start_time)
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(query)
    subtitles = result.scalars().all()

    return SubtitleListResponse(
        items=[SubtitleResponse.model_validate(s) for s in subtitles],
        total=total,
        limit=limit,
        offset=offset,
    )
