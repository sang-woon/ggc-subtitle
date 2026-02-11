# @TASK P7-T2.1 - AI 요약 서비스 (Meeting Summary Service)
# @SPEC docs/planning/02-trd.md#AI-요약

"""회의 AI 요약 서비스

회의 자막을 분석하여 자동 요약을 생성합니다.
OpenAI GPT API를 사용합니다.
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import timedelta

import httpx
from supabase import Client

from app.core.config import settings

logger = logging.getLogger(__name__)

# 프롬프트에 넣을 자막 텍스트 최대 길이 (gpt-4o-mini 컨텍스트 한도 고려)
MAX_TRANSCRIPT_CHARS = 12000

SUMMARY_SYSTEM_PROMPT = """당신은 경기도의회 회의록 분석 전문가입니다.
주어진 회의 자막을 분석하여 다음 형식의 JSON으로 요약을 생성하세요.

{
  "summary_text": "전체 회의 요약 (2-3문장)",
  "agenda_summaries": [
    {"order_num": 1, "title": "안건 제목", "summary": "안건별 논의 요약"}
  ],
  "key_decisions": ["결정사항 1", "결정사항 2"],
  "action_items": ["후속 조치 1", "후속 조치 2"]
}

규칙:
- 한국어로 작성
- 객관적이고 간결하게
- 핵심 논의 내용과 결론 위주
- 안건이 명확하지 않으면 agenda_summaries는 빈 배열
- 결정사항이 없으면 key_decisions는 빈 배열
- 후속 조치가 없으면 action_items는 빈 배열
- 반드시 유효한 JSON만 출력하세요. 다른 텍스트는 출력하지 마세요."""


@dataclass
class MeetingSummary:
    """요약 결과"""

    summary_text: str  # 전체 요약 (2-3 문장)
    agenda_summaries: list[dict] = field(default_factory=list)
    key_decisions: list[str] = field(default_factory=list)
    action_items: list[str] = field(default_factory=list)
    model_used: str = "gpt-4o-mini"


def _format_time_hms(seconds: float) -> str:
    """초를 HH:MM:SS 형식으로 변환합니다."""
    td = timedelta(seconds=int(seconds))
    total_seconds = int(td.total_seconds())
    hours, remainder = divmod(total_seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def _format_subtitles_for_prompt(
    subtitles: list[dict],
    agendas: list[dict] | None = None,
) -> str:
    """자막을 GPT 프롬프트용 텍스트로 변환합니다.

    Format:
    [00:00:30] 화자 1: 안녕하세요, 회의를 시작하겠습니다.
    [00:01:15] 화자 2: 네, 첫 번째 안건부터 논의하겠습니다.

    안건 정보가 있으면 상단에 안건 목록을 추가합니다.
    """
    lines: list[str] = []

    # 안건 목록이 있으면 상단에 추가
    if agendas:
        lines.append("=== 안건 목록 ===")
        for agenda in agendas:
            order_num = agenda.get("order_num", "?")
            title = agenda.get("title", "제목 없음")
            lines.append(f"{order_num}. {title}")
        lines.append("")
        lines.append("=== 회의 자막 ===")

    for sub in subtitles:
        start_time = sub.get("start_time", 0.0)
        speaker = sub.get("speaker") or "발언자 미확인"
        text = sub.get("text", "")
        time_str = _format_time_hms(start_time)
        lines.append(f"[{time_str}] {speaker}: {text}")

    result = "\n".join(lines)

    # 토큰 제한: 텍스트가 너무 길면 잘라냄
    if len(result) > MAX_TRANSCRIPT_CHARS:
        result = result[:MAX_TRANSCRIPT_CHARS] + "\n\n... (이하 생략, 전체 자막 중 일부만 포함)"

    return result


async def _call_openai_summary(
    transcript_text: str,
    agendas: list[dict] | None = None,
) -> MeetingSummary:
    """OpenAI API 호출하여 요약 생성합니다.

    Args:
        transcript_text: 프롬프트용으로 포맷된 자막 텍스트
        agendas: 안건 목록 (선택)

    Returns:
        MeetingSummary 데이터클래스

    Raises:
        ValueError: API 키가 설정되지 않은 경우
        httpx.HTTPStatusError: API 호출 실패
    """
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")

    user_message = transcript_text
    if agendas:
        user_message = (
            "안건 목록이 포함된 회의 자막입니다. "
            "안건별로 요약해 주세요.\n\n" + transcript_text
        )

    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0.3,
                "max_tokens": 2048,
            },
        )
        response.raise_for_status()

    data = response.json()
    content = data["choices"][0]["message"]["content"].strip()

    # JSON 파싱 (코드블록 제거)
    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        logger.warning("Failed to parse summary response: %s", content[:200])
        # 파싱 실패 시 원본 텍스트를 요약으로 사용
        return MeetingSummary(
            summary_text=content[:500],
            agenda_summaries=[],
            key_decisions=[],
            action_items=[],
        )

    return MeetingSummary(
        summary_text=parsed.get("summary_text", ""),
        agenda_summaries=parsed.get("agenda_summaries", []),
        key_decisions=parsed.get("key_decisions", []),
        action_items=parsed.get("action_items", []),
    )


async def generate_meeting_summary(
    supabase: Client,
    meeting_id: str,
) -> MeetingSummary:
    """회의 자막을 분석하여 AI 요약을 생성합니다.

    1. 자막 전체 조회 (시간순)
    2. 화자별 그룹핑하여 대화 형태로 변환
    3. 안건 목록 조회 (있으면)
    4. GPT에 전달하여 구조화된 요약 생성
    5. meeting_summaries 테이블에 저장

    Args:
        supabase: Supabase 클라이언트
        meeting_id: 회의 ID

    Returns:
        MeetingSummary 데이터클래스

    Raises:
        ValueError: 자막이 없거나 API 키 미설정
    """
    # 1. 자막 조회 (시간순)
    subtitle_resp = (
        supabase.table("subtitles")
        .select("*")
        .eq("meeting_id", meeting_id)
        .order("start_time")
        .execute()
    )
    subtitles = subtitle_resp.data

    if not subtitles:
        raise ValueError(f"회의 {meeting_id}에 자막이 없습니다.")

    # 2. 안건 조회 (테이블이 없을 수 있으므로 try/except)
    agendas: list[dict] | None = None
    try:
        agenda_resp = (
            supabase.table("meeting_agendas")
            .select("*")
            .eq("meeting_id", meeting_id)
            .order("order_num")
            .execute()
        )
        if agenda_resp.data:
            agendas = agenda_resp.data
    except Exception:
        logger.debug("meeting_agendas 테이블 조회 실패 (테이블 미존재 가능)")

    # 3. 프롬프트용 텍스트 변환
    transcript_text = _format_subtitles_for_prompt(subtitles, agendas)

    # 4. GPT 요약 생성
    summary = await _call_openai_summary(transcript_text, agendas)

    # 5. DB 저장 (upsert - 재생성 시 덮어쓰기)
    try:
        supabase.table("meeting_summaries").upsert({
            "meeting_id": meeting_id,
            "summary_text": summary.summary_text,
            "agenda_summaries": summary.agenda_summaries,
            "key_decisions": summary.key_decisions,
            "action_items": summary.action_items,
            "model_used": summary.model_used,
        }).execute()
    except Exception as e:
        logger.error("요약 저장 실패: %s", e)
        # 저장 실패해도 요약 결과는 반환

    return summary


async def get_summary(
    supabase: Client,
    meeting_id: str,
) -> dict | None:
    """저장된 요약을 조회합니다.

    Args:
        supabase: Supabase 클라이언트
        meeting_id: 회의 ID

    Returns:
        요약 dict 또는 None (없으면)
    """
    resp = (
        supabase.table("meeting_summaries")
        .select("*")
        .eq("meeting_id", meeting_id)
        .execute()
    )
    if resp.data:
        return resp.data[0]
    return None


async def delete_summary(
    supabase: Client,
    meeting_id: str,
) -> bool:
    """요약을 삭제합니다 (재생성용).

    Args:
        supabase: Supabase 클라이언트
        meeting_id: 회의 ID

    Returns:
        삭제 성공 여부
    """
    try:
        supabase.table("meeting_summaries").delete().eq(
            "meeting_id", meeting_id
        ).execute()
        return True
    except Exception as e:
        logger.error("요약 삭제 실패: %s", e)
        return False
