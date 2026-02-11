# @TASK P7-T2.1 - AI 요약 서비스 테스트
# @TEST tests/services/test_summary_service.py

"""summary_service 모듈 테스트

_format_subtitles_for_prompt, generate_meeting_summary,
get_summary, delete_summary 를 테스트합니다.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.summary_service import (
    MAX_TRANSCRIPT_CHARS,
    MeetingSummary,
    _call_openai_summary,
    _format_subtitles_for_prompt,
    _format_time_hms,
    delete_summary,
    generate_meeting_summary,
    get_summary,
)
from tests.conftest import MockSupabaseClient


# ──────────────────────────────────────────────
# _format_time_hms 헬퍼 테스트
# ──────────────────────────────────────────────


class TestFormatTimeHms:
    def test_zero(self):
        assert _format_time_hms(0) == "00:00:00"

    def test_seconds_only(self):
        assert _format_time_hms(45) == "00:00:45"

    def test_minutes_and_seconds(self):
        assert _format_time_hms(125) == "00:02:05"

    def test_hours_minutes_seconds(self):
        assert _format_time_hms(3661) == "01:01:01"

    def test_float_input(self):
        assert _format_time_hms(90.7) == "00:01:30"


# ──────────────────────────────────────────────
# _format_subtitles_for_prompt 테스트
# ──────────────────────────────────────────────

SAMPLE_SUBTITLES = [
    {
        "id": "s1",
        "meeting_id": "test-123",
        "start_time": 30.0,
        "end_time": 35.0,
        "text": "회의를 시작하겠습니다.",
        "speaker": "의장",
        "confidence": 0.95,
    },
    {
        "id": "s2",
        "meeting_id": "test-123",
        "start_time": 75.0,
        "end_time": 82.0,
        "text": "첫 번째 안건을 논의하겠습니다.",
        "speaker": "김위원",
        "confidence": 0.90,
    },
    {
        "id": "s3",
        "meeting_id": "test-123",
        "start_time": 150.0,
        "end_time": 160.0,
        "text": "찬성합니다.",
        "speaker": None,
        "confidence": 0.88,
    },
]

SAMPLE_AGENDAS = [
    {"order_num": 1, "title": "2026년 예산안 심의"},
    {"order_num": 2, "title": "조례 개정안 논의"},
]


class TestFormatSubtitlesForPrompt:
    def test_basic_formatting(self):
        result = _format_subtitles_for_prompt(SAMPLE_SUBTITLES)
        assert "[00:00:30] 의장: 회의를 시작하겠습니다." in result
        assert "[00:01:15] 김위원: 첫 번째 안건을 논의하겠습니다." in result

    def test_null_speaker_fallback(self):
        """화자가 None이면 '발언자 미확인'으로 표시."""
        result = _format_subtitles_for_prompt(SAMPLE_SUBTITLES)
        assert "[00:02:30] 발언자 미확인: 찬성합니다." in result

    def test_empty_subtitles(self):
        result = _format_subtitles_for_prompt([])
        assert result == ""

    def test_with_agendas(self):
        """안건 목록이 있으면 상단에 포함."""
        result = _format_subtitles_for_prompt(SAMPLE_SUBTITLES, SAMPLE_AGENDAS)
        assert "=== 안건 목록 ===" in result
        assert "1. 2026년 예산안 심의" in result
        assert "2. 조례 개정안 논의" in result
        assert "=== 회의 자막 ===" in result

    def test_without_agendas(self):
        """안건이 없으면 안건 섹션 미포함."""
        result = _format_subtitles_for_prompt(SAMPLE_SUBTITLES, None)
        assert "=== 안건 목록 ===" not in result

    def test_truncation_on_long_text(self):
        """매우 긴 자막은 MAX_TRANSCRIPT_CHARS로 잘림."""
        long_subtitles = []
        for i in range(500):
            long_subtitles.append({
                "start_time": float(i * 10),
                "end_time": float(i * 10 + 5),
                "text": f"이것은 매우 긴 자막 텍스트입니다. 번호: {i}. " * 5,
                "speaker": f"화자{i % 3}",
            })
        result = _format_subtitles_for_prompt(long_subtitles)
        # 잘린 텍스트 끝에 생략 안내 포함
        assert "이하 생략" in result
        # MAX_TRANSCRIPT_CHARS보다 약간 길 수 있음 (생략 메시지 포함)
        assert len(result) < MAX_TRANSCRIPT_CHARS + 100

    def test_missing_start_time_defaults_zero(self):
        """start_time이 없으면 0으로 기본값."""
        subs = [{"text": "테스트", "speaker": "화자"}]
        result = _format_subtitles_for_prompt(subs)
        assert "[00:00:00]" in result


# ──────────────────────────────────────────────
# _call_openai_summary 테스트 (mocked HTTP)
# ──────────────────────────────────────────────


MOCK_OPENAI_RESPONSE = {
    "choices": [
        {
            "message": {
                "content": json.dumps(
                    {
                        "summary_text": "경기도의회 본회의에서 예산안을 심의하고 조례 개정안을 논의했습니다.",
                        "agenda_summaries": [
                            {
                                "order_num": 1,
                                "title": "예산안 심의",
                                "summary": "2026년 예산안이 원안대로 가결되었습니다.",
                            }
                        ],
                        "key_decisions": ["2026년 예산안 가결"],
                        "action_items": ["세부 집행계획 수립"],
                    },
                    ensure_ascii=False,
                )
            }
        }
    ]
}


class TestCallOpenaiSummary:
    @pytest.mark.asyncio
    async def test_successful_call(self):
        """OpenAI API 정상 호출 시 MeetingSummary 반환."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = MOCK_OPENAI_RESPONSE

        with patch("app.services.summary_service.settings") as mock_settings:
            mock_settings.openai_api_key = "test-key"
            with patch("app.services.summary_service.httpx.AsyncClient") as mock_client_cls:
                mock_client = AsyncMock()
                mock_client.post.return_value = mock_response
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=False)
                mock_client_cls.return_value = mock_client

                result = await _call_openai_summary("테스트 자막 텍스트")

        assert isinstance(result, MeetingSummary)
        assert "예산안" in result.summary_text
        assert len(result.agenda_summaries) == 1
        assert result.key_decisions == ["2026년 예산안 가결"]
        assert result.action_items == ["세부 집행계획 수립"]
        assert result.model_used == "gpt-4o-mini"

    @pytest.mark.asyncio
    async def test_missing_api_key_raises(self):
        """API 키가 없으면 ValueError."""
        with patch("app.services.summary_service.settings") as mock_settings:
            mock_settings.openai_api_key = ""
            with pytest.raises(ValueError, match="OPENAI_API_KEY"):
                await _call_openai_summary("테스트")

    @pytest.mark.asyncio
    async def test_json_with_code_block(self):
        """코드블록으로 감싸진 JSON도 파싱."""
        code_block_content = '```json\n{"summary_text": "요약입니다.", "agenda_summaries": [], "key_decisions": [], "action_items": []}\n```'
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "choices": [{"message": {"content": code_block_content}}]
        }

        with patch("app.services.summary_service.settings") as mock_settings:
            mock_settings.openai_api_key = "test-key"
            with patch("app.services.summary_service.httpx.AsyncClient") as mock_client_cls:
                mock_client = AsyncMock()
                mock_client.post.return_value = mock_response
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=False)
                mock_client_cls.return_value = mock_client

                result = await _call_openai_summary("테스트")

        assert result.summary_text == "요약입니다."

    @pytest.mark.asyncio
    async def test_invalid_json_fallback(self):
        """JSON 파싱 실패 시 원본 텍스트를 요약으로 사용."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "이것은 유효하지 않은 JSON입니다."}}]
        }

        with patch("app.services.summary_service.settings") as mock_settings:
            mock_settings.openai_api_key = "test-key"
            with patch("app.services.summary_service.httpx.AsyncClient") as mock_client_cls:
                mock_client = AsyncMock()
                mock_client.post.return_value = mock_response
                mock_client.__aenter__ = AsyncMock(return_value=mock_client)
                mock_client.__aexit__ = AsyncMock(return_value=False)
                mock_client_cls.return_value = mock_client

                result = await _call_openai_summary("테스트")

        assert "유효하지 않은 JSON" in result.summary_text
        assert result.agenda_summaries == []


# ──────────────────────────────────────────────
# generate_meeting_summary 통합 테스트
# ──────────────────────────────────────────────


class TestGenerateMeetingSummary:
    @pytest.mark.asyncio
    async def test_generates_summary_with_subtitles(self):
        """자막이 있는 회의의 요약 생성."""
        mock_supabase = MockSupabaseClient(
            table_data={
                "subtitles": SAMPLE_SUBTITLES,
                "meeting_summaries": [],
            }
        )

        expected_summary = MeetingSummary(
            summary_text="테스트 요약입니다.",
            agenda_summaries=[],
            key_decisions=["결정1"],
            action_items=["조치1"],
        )

        with patch(
            "app.services.summary_service._call_openai_summary",
            new_callable=AsyncMock,
            return_value=expected_summary,
        ) as mock_call:
            result = await generate_meeting_summary(mock_supabase, "test-123")

        assert isinstance(result, MeetingSummary)
        assert result.summary_text == "테스트 요약입니다."
        assert result.key_decisions == ["결정1"]
        mock_call.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_when_no_subtitles(self):
        """자막이 없으면 ValueError."""
        mock_supabase = MockSupabaseClient(
            table_data={"subtitles": []}
        )

        with pytest.raises(ValueError, match="자막이 없습니다"):
            await generate_meeting_summary(mock_supabase, "test-123")

    @pytest.mark.asyncio
    async def test_continues_when_agenda_table_missing(self):
        """meeting_agendas 테이블이 없어도 정상 동작."""
        # MockSupabaseClient는 없는 테이블에 빈 배열 반환
        mock_supabase = MockSupabaseClient(
            table_data={"subtitles": SAMPLE_SUBTITLES}
        )

        expected_summary = MeetingSummary(
            summary_text="요약",
            agenda_summaries=[],
            key_decisions=[],
            action_items=[],
        )

        with patch(
            "app.services.summary_service._call_openai_summary",
            new_callable=AsyncMock,
            return_value=expected_summary,
        ):
            result = await generate_meeting_summary(mock_supabase, "test-123")

        assert result.summary_text == "요약"

    @pytest.mark.asyncio
    async def test_db_save_failure_still_returns_summary(self):
        """DB 저장 실패해도 요약은 반환."""
        # upsert에서 예외 발생하도록 별도 mock 설정
        mock_supabase = MagicMock()

        # subtitles 쿼리 체인
        subtitle_query = MagicMock()
        subtitle_query.select.return_value = subtitle_query
        subtitle_query.eq.return_value = subtitle_query
        subtitle_query.order.return_value = subtitle_query
        subtitle_resp = MagicMock()
        subtitle_resp.data = SAMPLE_SUBTITLES
        subtitle_query.execute.return_value = subtitle_resp

        # meeting_agendas 쿼리 체인
        agenda_query = MagicMock()
        agenda_query.select.return_value = agenda_query
        agenda_query.eq.return_value = agenda_query
        agenda_query.order.return_value = agenda_query
        agenda_resp = MagicMock()
        agenda_resp.data = []
        agenda_query.execute.return_value = agenda_resp

        # meeting_summaries 쿼리 (upsert 실패)
        summary_query = MagicMock()
        summary_query.upsert.side_effect = Exception("DB Error")

        def table_router(name):
            if name == "subtitles":
                return subtitle_query
            if name == "meeting_agendas":
                return agenda_query
            if name == "meeting_summaries":
                return summary_query
            return MagicMock()

        mock_supabase.table.side_effect = table_router

        expected_summary = MeetingSummary(
            summary_text="요약 결과",
            agenda_summaries=[],
            key_decisions=[],
            action_items=[],
        )

        with patch(
            "app.services.summary_service._call_openai_summary",
            new_callable=AsyncMock,
            return_value=expected_summary,
        ):
            result = await generate_meeting_summary(mock_supabase, "test-123")

        # 저장 실패했지만 결과는 반환됨
        assert result.summary_text == "요약 결과"


# ──────────────────────────────────────────────
# get_summary 테스트
# ──────────────────────────────────────────────


class TestGetSummary:
    @pytest.mark.asyncio
    async def test_returns_summary_when_exists(self):
        """저장된 요약이 있으면 반환."""
        stored_summary = {
            "meeting_id": "test-123",
            "summary_text": "저장된 요약",
            "agenda_summaries": [],
            "key_decisions": [],
            "action_items": [],
            "model_used": "gpt-4o-mini",
        }
        mock_supabase = MockSupabaseClient(
            table_data={"meeting_summaries": [stored_summary]}
        )

        result = await get_summary(mock_supabase, "test-123")
        assert result is not None
        assert result["summary_text"] == "저장된 요약"

    @pytest.mark.asyncio
    async def test_returns_none_when_not_exists(self):
        """저장된 요약이 없으면 None."""
        mock_supabase = MockSupabaseClient(
            table_data={"meeting_summaries": []}
        )

        result = await get_summary(mock_supabase, "nonexistent-id")
        assert result is None


# ──────────────────────────────────────────────
# delete_summary 테스트
# ──────────────────────────────────────────────


class TestDeleteSummary:
    @pytest.mark.asyncio
    async def test_delete_returns_true(self):
        """삭제 성공 시 True 반환."""
        mock_supabase = MockSupabaseClient(
            table_data={"meeting_summaries": [{"meeting_id": "test-123"}]}
        )

        result = await delete_summary(mock_supabase, "test-123")
        assert result is True

    @pytest.mark.asyncio
    async def test_delete_returns_false_on_error(self):
        """삭제 실패 시 False 반환."""
        mock_supabase = MagicMock()
        mock_query = MagicMock()
        mock_query.delete.return_value = mock_query
        mock_query.eq.side_effect = Exception("DB Error")
        mock_supabase.table.return_value = mock_query

        result = await delete_summary(mock_supabase, "test-123")
        assert result is False


# ──────────────────────────────────────────────
# MeetingSummary 데이터클래스 테스트
# ──────────────────────────────────────────────


class TestMeetingSummaryDataclass:
    def test_default_values(self):
        """기본값이 올바르게 설정되는지 확인."""
        summary = MeetingSummary(summary_text="테스트")
        assert summary.summary_text == "테스트"
        assert summary.agenda_summaries == []
        assert summary.key_decisions == []
        assert summary.action_items == []
        assert summary.model_used == "gpt-4o-mini"

    def test_full_initialization(self):
        """모든 필드를 지정하여 초기화."""
        summary = MeetingSummary(
            summary_text="전체 요약",
            agenda_summaries=[{"order_num": 1, "title": "안건1", "summary": "요약1"}],
            key_decisions=["결정1", "결정2"],
            action_items=["조치1"],
            model_used="gpt-4o",
        )
        assert summary.summary_text == "전체 요약"
        assert len(summary.agenda_summaries) == 1
        assert len(summary.key_decisions) == 2
        assert summary.model_used == "gpt-4o"
