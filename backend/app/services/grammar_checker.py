"""AI 기반 문장검사 서비스

OpenAI API를 사용하여 맞춤법, 띄어쓰기, 문장 구조 오류를 점검하고 교정합니다.
"""

import json
import logging
from dataclasses import dataclass

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

GRAMMAR_CHECK_PROMPT = """당신은 한국어 맞춤법/문법 교정 전문가입니다.
경기도의회 회의록 자막을 교정합니다.

규칙:
1. 맞춤법 오류만 교정 (의미 변경 금지)
2. 띄어쓰기 교정
3. 조사 오류 교정
4. 구어체 → 문어체 변환 (회의록이므로)
5. 의회 전문용어는 그대로 유지

입력: JSON 배열 [{"id": "...", "text": "..."}]
출력: 교정이 필요한 항목만 JSON 배열로 반환
[{"id": "...", "original": "...", "corrected": "...", "changes": ["변경 설명1", "변경 설명2"]}]

교정이 필요 없는 항목은 출력에 포함하지 마세요.
반드시 유효한 JSON만 출력하세요. 다른 텍스트는 출력하지 마세요."""


@dataclass
class GrammarIssue:
    """문법 교정 항목"""

    subtitle_id: str
    original_text: str
    corrected_text: str
    changes: list[str]


async def check_grammar_batch(
    subtitles: list[dict],
    batch_size: int = 20,
) -> list[GrammarIssue]:
    """AI API로 자막 문장을 일괄 검사합니다.

    Args:
        subtitles: [{"id": ..., "text": ...}, ...]
        batch_size: 한 번에 검사할 자막 수

    Returns:
        교정이 필요한 항목 목록
    """
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")

    all_issues: list[GrammarIssue] = []

    # 배치 처리
    for i in range(0, len(subtitles), batch_size):
        batch = subtitles[i:i + batch_size]
        batch_input = [{"id": s["id"], "text": s["text"]} for s in batch]

        try:
            issues = await _call_openai(batch_input)
            all_issues.extend(issues)
        except Exception as e:
            logger.error("Grammar check batch %d failed: %s", i, e)

    return all_issues


async def _call_openai(batch_input: list[dict]) -> list[GrammarIssue]:
    """OpenAI API 호출."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": GRAMMAR_CHECK_PROMPT},
                    {"role": "user", "content": json.dumps(batch_input, ensure_ascii=False)},
                ],
                "temperature": 0.1,
                "max_tokens": 4096,
            },
        )
        response.raise_for_status()

    data = response.json()
    content = data["choices"][0]["message"]["content"].strip()

    # JSON 파싱 (코드블록 제거)
    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        results = json.loads(content)
    except json.JSONDecodeError:
        logger.warning("Failed to parse grammar check response: %s", content[:200])
        return []

    issues = []
    for item in results:
        if not isinstance(item, dict):
            continue
        if item.get("original") == item.get("corrected"):
            continue
        issues.append(GrammarIssue(
            subtitle_id=item.get("id", ""),
            original_text=item.get("original", ""),
            corrected_text=item.get("corrected", ""),
            changes=item.get("changes", []),
        ))

    return issues
