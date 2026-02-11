"""Subtitles API 라우터 (Supabase REST)

# @TASK P5-T2.1 - 자막 조회/검색/수정 API
# @SPEC docs/planning/02-trd.md#자막-API
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from supabase import Client

from app.core.database import get_supabase
from app.schemas.subtitle import SubtitleBatchUpdate, SubtitleUpdate
from app.services.history_tracker import get_subtitle_history, record_changes_for_update
from app.services.pii_masking import mask_pii, mask_pii_batch

logger = logging.getLogger(__name__)

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


# @TASK P5-T2.1 - 자막 단건 수정 엔드포인트
@router.patch(
    "/{meeting_id}/subtitles/{subtitle_id}",
    summary="자막 단건 수정",
)
async def update_subtitle(
    meeting_id: str,
    subtitle_id: str,
    body: SubtitleUpdate,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """자막을 수정합니다. text 또는 speaker 필드를 변경할 수 있습니다."""
    # Layer 2: 도메인 검증 - 변경할 필드가 하나도 없으면 400
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="수정할 필드가 없습니다. text 또는 speaker를 지정해주세요.",
        )

    # 원본 조회 (이력 기록용)
    original_result = (
        supabase.table("subtitles")
        .select("*")
        .eq("id", subtitle_id)
        .eq("meeting_id", meeting_id)
        .limit(1)
        .execute()
    )
    original = original_result.data[0] if original_result.data else None

    # Supabase UPDATE + 필터링
    result = (
        supabase.table("subtitles")
        .update(update_data)
        .eq("id", subtitle_id)
        .eq("meeting_id", meeting_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"자막을 찾을 수 없습니다 (meeting_id={meeting_id}, subtitle_id={subtitle_id})",
        )

    # 변경 이력 기록
    if original:
        record_changes_for_update(supabase, subtitle_id, original, update_data)

    logger.info(
        "자막 수정 완료: meeting_id=%s, subtitle_id=%s, fields=%s",
        meeting_id,
        subtitle_id,
        list(update_data.keys()),
    )
    return result.data[0]


# @TASK P5-T2.1 - 자막 배치 수정 엔드포인트
@router.patch(
    "/{meeting_id}/subtitles",
    summary="자막 배치 수정",
)
async def update_subtitles_batch(
    meeting_id: str,
    body: SubtitleBatchUpdate,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """여러 자막을 한번에 수정합니다.

    각 항목의 id로 자막을 찾아 text/speaker를 업데이트합니다.
    존재하지 않는 자막은 건너뛰고 나머지만 수정합니다.
    """
    updated_items: list[dict] = []

    for item in body.items:
        update_data = {}
        if item.text is not None:
            update_data["text"] = item.text
        if item.speaker is not None:
            update_data["speaker"] = item.speaker

        # 변경할 필드가 없으면 건너뜀
        if not update_data:
            continue

        # 원본 조회 (이력 기록용)
        original_result = (
            supabase.table("subtitles")
            .select("*")
            .eq("id", item.id)
            .eq("meeting_id", meeting_id)
            .limit(1)
            .execute()
        )
        original = original_result.data[0] if original_result.data else None

        result = (
            supabase.table("subtitles")
            .update(update_data)
            .eq("id", item.id)
            .eq("meeting_id", meeting_id)
            .execute()
        )

        if result.data:
            updated_items.append(result.data[0])
            # 변경 이력 기록
            if original:
                record_changes_for_update(supabase, item.id, original, update_data)

    logger.info(
        "자막 배치 수정 완료: meeting_id=%s, 요청=%d건, 수정=%d건",
        meeting_id,
        len(body.items),
        len(updated_items),
    )
    return {
        "updated": len(updated_items),
        "items": updated_items,
    }


# =============================================================================
# Subtitle History (P6-2: T7)
# =============================================================================


@router.get(
    "/{meeting_id}/subtitles/{subtitle_id}/history",
    summary="자막 변경 이력 조회",
)
async def get_history(
    meeting_id: str,
    subtitle_id: str,
    supabase: Client = Depends(get_supabase),
) -> list[dict]:
    """자막의 변경 이력을 조회합니다."""
    return get_subtitle_history(supabase, subtitle_id)


# =============================================================================
# PII Masking (P6-2: T6)
# =============================================================================


@router.post(
    "/{meeting_id}/subtitles/detect-pii",
    summary="자막 PII 감지",
)
async def detect_pii_in_subtitles(
    meeting_id: str,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """회의의 모든 자막에서 개인정보(PII)를 감지합니다."""
    result = (
        supabase.table("subtitles")
        .select("id, text")
        .eq("meeting_id", meeting_id)
        .order("start_time")
        .execute()
    )

    if not result.data:
        return {"items": [], "total_pii_count": 0}

    masked_results = mask_pii_batch(result.data)
    pii_items = [r for r in masked_results if r["pii_found"]]
    total_pii = sum(len(r["pii_found"]) for r in masked_results)

    return {"items": pii_items, "total_pii_count": total_pii}


@router.post(
    "/{meeting_id}/subtitles/apply-pii-mask",
    summary="자막 PII 마스킹 적용",
)
async def apply_pii_mask(
    meeting_id: str,
    subtitle_ids: list[str] = Body(default=None, description="마스킹할 자막 ID 목록 (없으면 전체)"),
    supabase: Client = Depends(get_supabase),
) -> dict:
    """자막의 PII를 마스킹하여 실제로 업데이트합니다."""
    query = supabase.table("subtitles").select("id, text").eq("meeting_id", meeting_id)
    if subtitle_ids:
        query = query.in_("id", subtitle_ids)
    result = query.order("start_time").execute()

    if not result.data:
        return {"updated": 0, "items": []}

    updated_items = []
    for item in result.data:
        masked_text, pii_list = mask_pii(item["text"])
        if not pii_list:
            continue

        # 원본 기록 후 업데이트
        record_changes_for_update(
            supabase, item["id"], {"text": item["text"]}, {"text": masked_text}, "system:pii_mask"
        )

        supabase.table("subtitles").update({"text": masked_text}).eq("id", item["id"]).execute()
        updated_items.append({
            "id": item["id"],
            "original_text": item["text"],
            "masked_text": masked_text,
            "pii_count": len(pii_list),
        })

    return {"updated": len(updated_items), "items": updated_items}


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
