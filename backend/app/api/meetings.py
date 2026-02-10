"""Meetings API 라우터 (Supabase REST)

meetings 테이블이 없으면 channels 정적 데이터로 폴백합니다.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

from app.core.channels import get_all_channels, get_channel
from app.core.database import get_supabase
from app.schemas.meeting import MeetingCreate, MeetingStatus
from app.services.kms_vod_resolver import is_kms_vod_url, resolve_kms_vod_url


router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def _channel_to_meeting(ch: dict, meeting_status: str = "live") -> dict:
    """채널 정보를 meeting 형식으로 변환합니다."""
    return {
        "id": ch["id"],
        "title": ch["name"],
        "meeting_date": date.today().isoformat(),
        "stream_url": ch["stream_url"],
        "vod_url": None,
        "status": meeting_status,
        "duration_seconds": None,
        "created_at": None,
        "updated_at": None,
    }


# =============================================================================
# Service Functions (Supabase REST + 채널 폴백)
# =============================================================================


def get_meetings_service(
    supabase: Client,
    statuses: Optional[list[MeetingStatus]] = None,
    limit: int = 10,
    offset: int = 0,
) -> list[dict]:
    """회의 목록을 조회합니다. meetings 테이블 없으면 채널 데이터 반환."""
    try:
        query = supabase.table("meetings").select("*")
        if statuses:
            status_values = [s.value for s in statuses]
            query = query.in_("status", status_values)
        query = query.order("meeting_date", desc=True)
        query = query.range(offset, offset + limit - 1)
        result = query.execute()
        return result.data
    except Exception:
        # meetings 테이블이 없으면 채널 데이터로 폴백
        channels = get_all_channels()
        meetings = [_channel_to_meeting(ch) for ch in channels]
        if statuses:
            status_values = [s.value for s in statuses]
            meetings = [m for m in meetings if m["status"] in status_values]
        return meetings[offset:offset + limit]


def get_live_meeting_service(
    supabase: Client,
    channel: Optional[str] = None,
) -> Optional[dict]:
    """실시간 회의를 조회합니다. channel 파라미터로 채널 데이터 직접 반환."""
    if channel:
        ch = get_channel(channel)
        if ch:
            return _channel_to_meeting(ch)
        return None

    try:
        result = (
            supabase.table("meetings")
            .select("*")
            .eq("status", "live")
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception:
        return None


def get_meeting_by_id_service(
    supabase: Client,
    meeting_id: str,
) -> Optional[dict]:
    """회의 ID로 회의를 조회합니다."""
    # 먼저 채널 ID인지 확인
    ch = get_channel(meeting_id)
    if ch:
        return _channel_to_meeting(ch)

    try:
        result = (
            supabase.table("meetings")
            .select("*")
            .eq("id", meeting_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception:
        return None


def create_meeting_service(supabase: Client, meeting_data: MeetingCreate) -> dict:
    """새 회의를 생성합니다."""
    data = {
        "title": meeting_data.title,
        "meeting_date": meeting_data.meeting_date.isoformat(),
        "stream_url": meeting_data.stream_url,
        "vod_url": meeting_data.vod_url,
        "status": meeting_data.status.value,
        "duration_seconds": meeting_data.duration_seconds,
    }
    result = supabase.table("meetings").insert(data).execute()
    return result.data[0]


# =============================================================================
# API Endpoints
# =============================================================================


@router.get("")
async def get_meetings(
    status: Optional[str] = Query(None, description="회의 상태 필터 (콤마구분 가능: processing,ended)"),
    limit: int = Query(10, ge=1, le=100, description="조회할 개수"),
    offset: int = Query(0, ge=0, description="시작 위치"),
    supabase: Client = Depends(get_supabase),
) -> list[dict]:
    """회의 목록을 조회합니다."""
    statuses = None
    if status:
        statuses = [MeetingStatus(s.strip()) for s in status.split(",")]
    return get_meetings_service(supabase, statuses=statuses, limit=limit, offset=offset)


@router.get("/live")
async def get_live_meeting(
    channel: Optional[str] = Query(None, description="채널 ID (예: ch14)"),
    supabase: Client = Depends(get_supabase),
) -> Optional[dict]:
    """현재 실시간 회의를 조회합니다. 채널로 필터 가능."""
    return get_live_meeting_service(supabase, channel=channel)


@router.get("/{meeting_id}")
async def get_meeting_by_id(
    meeting_id: str,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """회의 ID로 회의를 조회합니다."""
    meeting = get_meeting_by_id_service(supabase, meeting_id)

    if meeting is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting with id {meeting_id} not found",
        )

    return meeting


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_meeting(
    meeting_data: MeetingCreate,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """새 회의(VOD)를 등록합니다. KMS VOD URL은 자동으로 MP4 URL로 변환됩니다."""
    if meeting_data.vod_url and is_kms_vod_url(meeting_data.vod_url):
        try:
            meeting_data.vod_url = await resolve_kms_vod_url(meeting_data.vod_url)
        except (ValueError, Exception) as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"KMS VOD URL 변환 실패: {e}",
            )
    return create_meeting_service(supabase, meeting_data)
