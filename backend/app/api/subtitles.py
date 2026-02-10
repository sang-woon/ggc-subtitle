"""Subtitles API 라우터 (Supabase REST)"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client

from app.core.database import get_supabase

router = APIRouter(prefix="/api/meetings", tags=["subtitles"])


@router.get(
    "/{meeting_id}/subtitles",
    summary="회의별 자막 목록 조회",
)
async def get_subtitles(
    meeting_id: str,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """회의별 자막 목록을 조회합니다."""
    # 전체 개수
    count_result = (
        supabase.table("subtitles")
        .select("id", count="exact")
        .eq("meeting_id", meeting_id)
        .execute()
    )
    total = count_result.count or 0

    # 자막 목록 (시간순)
    result = (
        supabase.table("subtitles")
        .select("*")
        .eq("meeting_id", meeting_id)
        .order("start_time")
        .range(offset, offset + limit - 1)
        .execute()
    )

    return {
        "items": result.data,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get(
    "/{meeting_id}/subtitles/search",
    summary="자막 내 키워드 검색",
)
async def search_subtitles(
    meeting_id: str,
    q: Annotated[str, Query(min_length=1, description="검색어")],
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """자막 내 키워드를 검색합니다."""
    search_term = q.strip()
    if not search_term:
        raise HTTPException(status_code=422, detail="검색어는 비어있을 수 없습니다")

    # 전체 개수
    count_result = (
        supabase.table("subtitles")
        .select("id", count="exact")
        .eq("meeting_id", meeting_id)
        .ilike("text", f"%{search_term}%")
        .execute()
    )
    total = count_result.count or 0

    # 검색 결과
    result = (
        supabase.table("subtitles")
        .select("*")
        .eq("meeting_id", meeting_id)
        .ilike("text", f"%{search_term}%")
        .order("start_time")
        .range(offset, offset + limit - 1)
        .execute()
    )

    return {
        "items": result.data,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
