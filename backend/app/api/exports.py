"""회의록 내보내기 API 라우터"""

import json
from enum import Enum
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from supabase import Client

from app.api.meetings import get_meeting_by_id_service
from app.core.database import get_supabase
from app.services.transcript_export import export_json, export_markdown, export_official, export_srt

router = APIRouter(prefix="/api/meetings", tags=["exports"])


class ExportFormat(str, Enum):
    MARKDOWN = "markdown"
    SRT = "srt"
    JSON = "json"
    OFFICIAL = "official"


def _fetch_all_subtitles(supabase: Client, meeting_id: str) -> list[dict]:
    """회의의 전체 자막을 시간순으로 조회합니다."""
    all_subtitles = []
    offset = 0
    page_size = 1000

    while True:
        result = (
            supabase.table("subtitles")
            .select("*")
            .eq("meeting_id", meeting_id)
            .order("start_time")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not result.data:
            break
        all_subtitles.extend(result.data)
        if len(result.data) < page_size:
            break
        offset += page_size

    return all_subtitles


@router.get(
    "/{meeting_id}/export",
    summary="회의록 내보내기",
    description="회의 자막을 지정 형식으로 내보냅니다. (markdown, srt, json, official)",
)
async def export_meeting_transcript(
    meeting_id: str,
    format: ExportFormat = Query(
        ExportFormat.MARKDOWN, description="내보내기 형식"
    ),
    supabase: Client = Depends(get_supabase),
):
    meeting = get_meeting_by_id_service(supabase, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="회의를 찾을 수 없습니다.")

    subtitles = _fetch_all_subtitles(supabase, meeting_id)
    title = meeting.get("title", "회의록").replace(" ", "_")

    ext_map = {
        ExportFormat.MARKDOWN: ("text/markdown; charset=utf-8", "md"),
        ExportFormat.SRT: ("text/plain; charset=utf-8", "srt"),
        ExportFormat.JSON: ("application/json; charset=utf-8", "json"),
        ExportFormat.OFFICIAL: ("text/plain; charset=utf-8", "txt"),
    }
    media_type, ext = ext_map[format]
    # RFC 5987: 한글 파일명을 UTF-8 URL-인코딩
    encoded_name = quote(f"{title}.{ext}")
    disposition = f"attachment; filename*=UTF-8''{encoded_name}"

    if format == ExportFormat.MARKDOWN:
        content = export_markdown(meeting, subtitles)
    elif format == ExportFormat.SRT:
        content = export_srt(subtitles)
    elif format == ExportFormat.OFFICIAL:
        content = export_official(meeting, subtitles)
    else:
        data = export_json(meeting, subtitles)
        content = json.dumps(data, ensure_ascii=False, indent=2)

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": disposition},
    )
