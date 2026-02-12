"""OpenAI 기반 실시간 자막 교정 서비스

STT로 생성된 자막을 OpenAI API로 교정하여
의원 이름, 숫자, 의회 용어 등을 정확하게 수정합니다.

파이프라인:
  STT 자막 생성 -> 큐에 추가 -> 배치 수집 -> OpenAI 교정 -> WebSocket broadcast
"""

# @TASK P8-T1 - OpenAI 자막 교정 서비스
# @SPEC docs/planning/02-trd.md#자막-교정

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass

from openai import AsyncOpenAI

from app.api.websocket import manager
from app.core.config import settings

logger = logging.getLogger(__name__)

# 경기도의회 의원 목록 (11대, 2024년 기준 - 예시)
COUNCILOR_NAMES = [
    "김동규", "이영봉", "이재준", "한원찬", "최만식",
    "김선영", "이혜원", "박근철", "장현국", "이운성",
    "이영주", "김명원", "박옥분", "염종현", "최종현",
]

SYSTEM_PROMPT = """당신은 경기도의회 회의록 교정 전문가입니다.
음성인식(STT)으로 생성된 자막을 교정해주세요.

## 규칙
1. **의원 이름**: 절대 틀리면 안 됩니다. 아래 의원 목록을 참조하세요.
2. **숫자/금액**: 정확하게 표기하세요.
   - "삼천억" -> "3,000억원"
   - "이십삼조" -> "23조"
   - 연도, 법률 번호 등도 숫자로 표기
3. **의회 용어**: 정확히 사용하세요.
   - 개의, 산회, 속개, 상정, 의결, 표결, 질의, 답변, 채택, 부의
4. **자연스러운 한국어**: 띄어쓰기, 조사, 어미를 교정하세요.
5. **의미 보존**: 원래 의미를 절대 변경하지 마세요.
6. **교정 불필요**: 이미 정확한 자막은 그대로 반환하세요.

## 의원 목록
{councilor_list}

## 출력 형식
각 자막에 대해 JSON 배열로 응답하세요:
[
  {{"id": "원본ID", "corrected_text": "교정된 텍스트"}},
  ...
]
"""


@dataclass
class _PendingSubtitle:
    """교정 대기 중인 자막"""
    id: str
    channel_id: str
    text: str
    speaker: str | None = None


class SubtitleCorrectorService:
    """OpenAI 기반 자막 교정 서비스

    비동기 배치 큐로 자막을 수집하여 OpenAI API로 교정합니다.
    """

    def __init__(self) -> None:
        self._client: AsyncOpenAI | None = None
        self._queue: asyncio.Queue[_PendingSubtitle] = asyncio.Queue()
        self._worker_task: asyncio.Task | None = None
        self._enabled = (
            settings.subtitle_correction_enabled
            and bool(settings.openai_api_key)
        )

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def start(self) -> None:
        """교정 서비스를 시작합니다."""
        if not self._enabled:
            logger.info(
                "SubtitleCorrector disabled (openai_api_key=%s, enabled=%s)",
                bool(settings.openai_api_key),
                settings.subtitle_correction_enabled,
            )
            return

        self._client = AsyncOpenAI(api_key=settings.openai_api_key)
        self._worker_task = asyncio.create_task(
            self._worker_loop(),
            name="subtitle-corrector",
        )
        logger.info(
            "SubtitleCorrector started (model=%s, batch=%d, interval=%.1fs)",
            settings.subtitle_correction_model,
            settings.subtitle_correction_batch_size,
            settings.subtitle_correction_interval,
        )

    async def stop(self) -> None:
        """교정 서비스를 중지합니다."""
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        if self._client:
            await self._client.close()
            self._client = None
        logger.info("SubtitleCorrector stopped")

    async def enqueue(
        self,
        subtitle_id: str,
        channel_id: str,
        text: str,
        speaker: str | None = None,
    ) -> None:
        """자막을 교정 큐에 추가합니다."""
        if not self._enabled:
            return
        await self._queue.put(_PendingSubtitle(
            id=subtitle_id,
            channel_id=channel_id,
            text=text,
            speaker=speaker,
        ))

    async def _worker_loop(self) -> None:
        """배치 수집 및 교정 워커."""
        batch_size = settings.subtitle_correction_batch_size
        interval = settings.subtitle_correction_interval

        while True:
            batch: list[_PendingSubtitle] = []
            try:
                # 첫 번째 아이템은 blocking wait
                first = await self._queue.get()
                batch.append(first)

                # 나머지는 timeout 내에서 수집
                deadline = asyncio.get_event_loop().time() + interval
                while len(batch) < batch_size:
                    remaining = deadline - asyncio.get_event_loop().time()
                    if remaining <= 0:
                        break
                    try:
                        item = await asyncio.wait_for(
                            self._queue.get(), timeout=remaining
                        )
                        batch.append(item)
                    except asyncio.TimeoutError:
                        break

                # 배치 교정 실행
                if batch:
                    await self._correct_batch(batch)

            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error("SubtitleCorrector worker error: %s", e)
                await asyncio.sleep(1.0)

    async def _correct_batch(self, batch: list[_PendingSubtitle]) -> None:
        """배치 자막을 OpenAI로 교정합니다."""
        if not self._client:
            return

        # 요청 데이터 구성
        subtitles_text = json.dumps(
            [{"id": s.id, "text": s.text, "speaker": s.speaker} for s in batch],
            ensure_ascii=False,
        )

        councilor_list = ", ".join(COUNCILOR_NAMES)
        system = SYSTEM_PROMPT.format(councilor_list=councilor_list)

        try:
            response = await self._client.chat.completions.create(
                model=settings.subtitle_correction_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"다음 자막들을 교정해주세요:\n{subtitles_text}"},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )

            result_text = response.choices[0].message.content
            if not result_text:
                return

            result = json.loads(result_text)
            # result가 {"corrections": [...]} 형태일 수 있음
            corrections = result if isinstance(result, list) else result.get("corrections", [])

            # 원본 ID -> channel_id 매핑
            id_to_channel = {s.id: s.channel_id for s in batch}
            id_to_original = {s.id: s.text for s in batch}

            for correction in corrections:
                sub_id = correction.get("id", "")
                corrected = correction.get("corrected_text", "")
                channel_id = id_to_channel.get(sub_id, "")
                original = id_to_original.get(sub_id, "")

                if not channel_id or not corrected:
                    continue

                # 원본과 동일하면 스킵
                if corrected == original:
                    continue

                logger.info(
                    "SubtitleCorrector: [%s] '%s' -> '%s'",
                    sub_id[:8], original[:40], corrected[:40],
                )

                # WebSocket으로 교정 결과 브로드캐스트
                await manager.broadcast_corrected_subtitle(channel_id, {
                    "id": sub_id,
                    "corrected_text": corrected,
                })

        except Exception as e:
            logger.error("SubtitleCorrector: OpenAI API error: %s", e)


# 싱글톤
_corrector: SubtitleCorrectorService | None = None


def get_subtitle_corrector() -> SubtitleCorrectorService:
    global _corrector
    if _corrector is None:
        _corrector = SubtitleCorrectorService()
    return _corrector
