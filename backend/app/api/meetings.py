"""Meetings API 라우터 (Supabase REST)

meetings 테이블이 없으면 channels 정적 데이터로 폴백합니다.
"""

import asyncio
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

from app.core.channels import get_all_channels, get_channel
from app.core.database import get_supabase
from app.schemas.meeting import (
    AgendaCreate,
    AgendaUpdate,
    MeetingCreate,
    MeetingFromUrl,
    MeetingStatus,
    MeetingUpdate,
    ParticipantCreate,
    PublicationCreate,
    TranscriptStatusUpdate,
)
from app.services.kms_vod_resolver import (
    is_kms_vod_url,
    resolve_kms_vod_url,
    resolve_kms_vod_metadata,
)
from app.services.summary_service import (
    delete_summary,
    generate_meeting_summary,
    get_summary,
)
from app.services.vod_stt_service import (
    VodSttService,
    get_task_by_meeting,
    is_processing,
)


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
        try:
            status_list = []
            for s in status.split(","):
                status_list.append(MeetingStatus(s.strip()))
            statuses = status_list
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail="Invalid status value",
            )
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


@router.post("/from-url", status_code=status.HTTP_201_CREATED)
async def create_meeting_from_url(
    data: MeetingFromUrl,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """URL만으로 VOD를 등록합니다. KMS URL이면 메타데이터를 자동 추출합니다."""
    # 1. 메타데이터 추출
    try:
        metadata = await resolve_kms_vod_metadata(data.url)
    except (ValueError, Exception) as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"URL 변환 실패: {e}",
        )

    # 2. 중복 체크 (vod_url 기준)
    try:
        result = (
            supabase.table("meetings")
            .select("id")
            .eq("vod_url", metadata["vod_url"])
            .limit(1)
            .execute()
        )
        if result.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="이미 등록된 VOD입니다.",
            )
    except HTTPException:
        raise
    except Exception:
        pass  # 테이블 없으면 중복 체크 스킵

    # 3. meeting 생성
    meeting_data = MeetingCreate(
        title=metadata["title"],
        meeting_date=date.fromisoformat(metadata["meeting_date"]),
        vod_url=metadata["vod_url"],
        status=MeetingStatus.ENDED,
        duration_seconds=metadata["duration_seconds"],
    )
    return create_meeting_service(supabase, meeting_data)


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


# =============================================================================
# VOD STT Endpoints
# =============================================================================


@router.post("/{meeting_id}/stt")
async def start_stt_processing(
    meeting_id: str,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """VOD STT 처리를 시작합니다 (백그라운드).

    - meeting이 존재하고 vod_url이 있어야 함
    - 이미 처리 중이면 409 Conflict
    - 즉시 task_id와 status를 반환
    """
    # 1. meeting 존재 확인
    meeting = get_meeting_by_id_service(supabase, meeting_id)
    if meeting is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting {meeting_id}을(를) 찾을 수 없습니다.",
        )

    # 2. vod_url 필수 체크
    vod_url = meeting.get("vod_url")
    if not vod_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="VOD URL이 없는 회의입니다. 먼저 VOD URL을 등록해주세요.",
        )

    # 3. 중복 처리 방지
    if is_processing(meeting_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 STT 처리가 진행 중입니다.",
        )

    # 4. 백그라운드 태스크 실행
    service = VodSttService()
    asyncio.create_task(service.process(meeting_id, vod_url, supabase))

    # 5. 즉시 응답 (태스크가 아직 등록 안됐을 수 있으므로 짧은 대기)
    await asyncio.sleep(0.05)
    task = get_task_by_meeting(meeting_id)
    return {
        "task_id": task.task_id if task else None,
        "meeting_id": meeting_id,
        "status": task.status if task else "pending",
        "message": "STT 처리가 시작되었습니다.",
    }


@router.get("/{meeting_id}/stt/status")
async def get_stt_status(
    meeting_id: str,
) -> dict:
    """VOD STT 처리 상태를 조회합니다."""
    task = get_task_by_meeting(meeting_id)

    if task is None:
        return {
            "meeting_id": meeting_id,
            "status": "none",
            "progress": 0.0,
            "message": "STT 처리 기록이 없습니다.",
            "error": None,
        }

    return {
        "task_id": task.task_id,
        "meeting_id": task.meeting_id,
        "status": task.status,
        "progress": task.progress,
        "message": task.message,
        "error": task.error,
    }


# =============================================================================
# Meeting Update (PATCH)
# =============================================================================


@router.patch("/{meeting_id}")
async def update_meeting(
    meeting_id: str,
    body: MeetingUpdate,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """회의 정보를 수정합니다 (meeting_type, committee 등)."""
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="수정할 필드가 없습니다.",
        )

    # date → isoformat 변환
    if "meeting_date" in update_data:
        update_data["meeting_date"] = update_data["meeting_date"].isoformat()
    if "status" in update_data:
        update_data["status"] = update_data["status"].value

    result = (
        supabase.table("meetings")
        .update(update_data)
        .eq("id", meeting_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting {meeting_id}을(를) 찾을 수 없습니다.",
        )

    return result.data[0]


# =============================================================================
# Participants CRUD
# =============================================================================


@router.get("/{meeting_id}/participants")
async def get_participants(
    meeting_id: str,
    supabase: Client = Depends(get_supabase),
) -> list[dict]:
    """회의 참석자 목록을 조회합니다."""
    result = (
        supabase.table("meeting_participants")
        .select("*")
        .eq("meeting_id", meeting_id)
        .order("created_at")
        .execute()
    )
    return result.data


@router.post("/{meeting_id}/participants", status_code=status.HTTP_201_CREATED)
async def add_participant(
    meeting_id: str,
    body: ParticipantCreate,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """회의 참석자를 추가합니다."""
    # 회의 존재 확인
    meeting = get_meeting_by_id_service(supabase, meeting_id)
    if meeting is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting {meeting_id}을(를) 찾을 수 없습니다.",
        )

    data = {
        "meeting_id": meeting_id,
        "councilor_id": body.councilor_id,
        "name": body.name,
        "role": body.role,
    }

    try:
        result = supabase.table("meeting_participants").insert(data).execute()
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="이미 등록된 참석자입니다.",
            )
        raise

    return result.data[0]


@router.delete("/{meeting_id}/participants/{participant_id}")
async def remove_participant(
    meeting_id: str,
    participant_id: str,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """회의 참석자를 제거합니다."""
    result = (
        supabase.table("meeting_participants")
        .delete()
        .eq("id", participant_id)
        .eq("meeting_id", meeting_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="참석자를 찾을 수 없습니다.",
        )

    return {"deleted": True}


# =============================================================================
# Agendas CRUD
# =============================================================================


@router.get("/{meeting_id}/agendas")
async def get_agendas(
    meeting_id: str,
    supabase: Client = Depends(get_supabase),
) -> list[dict]:
    """회의 안건 목록을 조회합니다."""
    result = (
        supabase.table("meeting_agendas")
        .select("*")
        .eq("meeting_id", meeting_id)
        .order("order_num")
        .execute()
    )
    return result.data


@router.post("/{meeting_id}/agendas", status_code=status.HTTP_201_CREATED)
async def add_agenda(
    meeting_id: str,
    body: AgendaCreate,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """안건을 추가합니다."""
    meeting = get_meeting_by_id_service(supabase, meeting_id)
    if meeting is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting {meeting_id}을(를) 찾을 수 없습니다.",
        )

    data = {
        "meeting_id": meeting_id,
        "order_num": body.order_num,
        "title": body.title,
        "description": body.description,
    }
    result = supabase.table("meeting_agendas").insert(data).execute()
    return result.data[0]


@router.patch("/{meeting_id}/agendas/{agenda_id}")
async def update_agenda(
    meeting_id: str,
    agenda_id: str,
    body: AgendaUpdate,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """안건을 수정합니다."""
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="수정할 필드가 없습니다.",
        )

    result = (
        supabase.table("meeting_agendas")
        .update(update_data)
        .eq("id", agenda_id)
        .eq("meeting_id", meeting_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="안건을 찾을 수 없습니다.",
        )

    return result.data[0]


@router.delete("/{meeting_id}/agendas/{agenda_id}")
async def delete_agenda(
    meeting_id: str,
    agenda_id: str,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """안건을 삭제합니다."""
    result = (
        supabase.table("meeting_agendas")
        .delete()
        .eq("id", agenda_id)
        .eq("meeting_id", meeting_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="안건을 찾을 수 없습니다.",
        )

    return {"deleted": True}


# =============================================================================
# Transcript Status + Publications (P6-3: T10)
# =============================================================================


@router.patch("/{meeting_id}/transcript-status")
async def update_transcript_status(
    meeting_id: str,
    body: TranscriptStatusUpdate,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """회의록 상태를 변경합니다 (draft → reviewing → final)."""
    result = (
        supabase.table("meetings")
        .update({"transcript_status": body.transcript_status.value})
        .eq("id", meeting_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting {meeting_id}을(를) 찾을 수 없습니다.",
        )

    return result.data[0]


@router.post("/{meeting_id}/publications", status_code=status.HTTP_201_CREATED)
async def create_publication(
    meeting_id: str,
    body: PublicationCreate,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """회의록 확정/공개 이력을 등록합니다."""
    meeting = get_meeting_by_id_service(supabase, meeting_id)
    if meeting is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting {meeting_id}을(를) 찾을 수 없습니다.",
        )

    data = {
        "meeting_id": meeting_id,
        "status": body.status.value,
        "published_by": body.published_by,
        "notes": body.notes,
    }
    result = supabase.table("transcript_publications").insert(data).execute()
    return result.data[0]


@router.get("/{meeting_id}/publications")
async def get_publications(
    meeting_id: str,
    supabase: Client = Depends(get_supabase),
) -> list[dict]:
    """회의록 확정/공개 이력을 조회합니다."""
    result = (
        supabase.table("transcript_publications")
        .select("*")
        .eq("meeting_id", meeting_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


# =============================================================================
# AI Summary (P7-T2.2)
# @TASK P7-T2.2 - AI 요약 API 엔드포인트
# @SPEC docs/planning/02-trd.md#AI-요약
# =============================================================================


@router.post("/{meeting_id}/summary")
async def create_meeting_summary(
    meeting_id: str,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """AI 요약 생성

    자막 데이터를 GPT로 분석하여 회의 요약을 생성합니다.
    기존 요약이 있으면 덮어씁니다.
    """
    try:
        summary = await generate_meeting_summary(supabase, meeting_id)
        return {
            "meeting_id": meeting_id,
            "summary_text": summary.summary_text,
            "agenda_summaries": summary.agenda_summaries,
            "key_decisions": summary.key_decisions,
            "action_items": summary.action_items,
            "model_used": summary.model_used,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"요약 생성 실패: {str(e)}")


@router.get("/{meeting_id}/summary")
async def get_meeting_summary(
    meeting_id: str,
    supabase: Client = Depends(get_supabase),
) -> dict:
    """저장된 요약 조회"""
    result = await get_summary(supabase, meeting_id)
    if result is None:
        raise HTTPException(
            status_code=404, detail="요약이 없습니다. POST로 생성하세요."
        )
    return result


@router.delete("/{meeting_id}/summary", status_code=204)
async def delete_meeting_summary(
    meeting_id: str,
    supabase: Client = Depends(get_supabase),
) -> None:
    """요약 삭제 (재생성용)"""
    deleted = await delete_summary(supabase, meeting_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="삭제할 요약이 없습니다.")
