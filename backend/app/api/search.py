"""Global Search API 라우터 - 회의록 통합 검색"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client

from app.core.database import get_supabase

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get(
    "",
    summary="회의록 통합 검색",
)
async def global_search(
    q: Annotated[str, Query(min_length=1, description="검색어")],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """모든 회의의 자막에서 키워드를 검색합니다.

    결과는 회의별로 그룹핑되어 반환됩니다.
    """
    search_term = q.strip()
    if not search_term:
        raise HTTPException(status_code=422, detail="검색어는 비어있을 수 없습니다")

    try:
        # 전체 검색 결과 개수
        count_result = (
            supabase.table("subtitles")
            .select("id", count="exact")
            .ilike("text", f"%{search_term}%")
            .execute()
        )
        total = count_result.count or 0

        # 검색 결과 조회 (자막 + 회의 정보)
        result = (
            supabase.table("subtitles")
            .select("*, meetings(id, title, meeting_date, status, vod_url)")
            .ilike("text", f"%{search_term}%")
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        # 회의별로 그룹핑
        meetings_map: dict[str, dict] = {}
        for item in result.data:
            meeting_info = item.get("meetings")
            meeting_id = item.get("meeting_id", "")

            if meeting_id not in meetings_map:
                meetings_map[meeting_id] = {
                    "meeting_id": meeting_id,
                    "meeting_title": meeting_info.get("title", "알 수 없음") if meeting_info else "알 수 없음",
                    "meeting_date": meeting_info.get("meeting_date") if meeting_info else None,
                    "meeting_status": meeting_info.get("status") if meeting_info else None,
                    "vod_url": meeting_info.get("vod_url") if meeting_info else None,
                    "subtitles": [],
                }

            meetings_map[meeting_id]["subtitles"].append({
                "id": item["id"],
                "start_time": item["start_time"],
                "end_time": item["end_time"],
                "text": item["text"],
                "speaker": item.get("speaker"),
                "confidence": item.get("confidence"),
            })

        return {
            "items": result.data,
            "grouped": list(meetings_map.values()),
            "total": total,
            "limit": limit,
            "offset": offset,
            "query": search_term,
        }
    except Exception as e:
        # Supabase 테이블 미존재 등 예외 처리
        return {
            "items": [],
            "grouped": [],
            "total": 0,
            "limit": limit,
            "offset": offset,
            "query": search_term,
        }


@router.get(
    "/meetings",
    summary="회의 제목 검색",
)
async def search_meetings(
    q: Annotated[str, Query(min_length=1, description="검색어")],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """회의 제목에서 키워드를 검색합니다."""
    search_term = q.strip()
    if not search_term:
        raise HTTPException(status_code=422, detail="검색어는 비어있을 수 없습니다")

    try:
        count_result = (
            supabase.table("meetings")
            .select("id", count="exact")
            .ilike("title", f"%{search_term}%")
            .execute()
        )
        total = count_result.count or 0

        result = (
            supabase.table("meetings")
            .select("*")
            .ilike("title", f"%{search_term}%")
            .order("meeting_date", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        return {
            "items": result.data,
            "total": total,
            "limit": limit,
            "offset": offset,
            "query": search_term,
        }
    except Exception:
        return {
            "items": [],
            "total": 0,
            "limit": limit,
            "offset": offset,
            "query": search_term,
        }
