"""채널 방송 상태 조회 서비스

경기도의회 생중계 사이트(live.ggc.go.kr)에서 실시간 방송 상태를 수집하고,
인메모리 캐시(5초 TTL)로 중복 요청을 방지합니다.
상태 변경 감지를 통해 SSE 이벤트를 트리거합니다.
"""

import asyncio
import logging
import time
from datetime import datetime
from typing import Optional

import httpx

from app.core.channels import CHANNELS, get_status_text

logger = logging.getLogger(__name__)

ONAIR_API_URL = "https://live.ggc.go.kr/getOnairListTodayData.do"
CACHE_TTL_SECONDS = 5


class ChannelStatusService:
    """채널 방송 상태를 관리하는 싱글턴 서비스."""

    def __init__(self) -> None:
        # adCode → livestatus 매핑 (현재 상태)
        self._status: dict[str, int] = {}
        # adCode → 일정 정보 (회차, 차수)
        self._schedule: dict[str, dict] = {}
        # 이전 상태 (변경 감지용)
        self._prev_status: dict[str, int] = {}
        # 캐시 타임스탬프
        self._last_fetched: float = 0.0
        # 동시 fetch 방지 락
        self._lock = asyncio.Lock()
        # 상태 변경 콜백 리스트 (SSE 구독자)
        self._subscribers: list[asyncio.Queue] = []

    async def fetch_status(self) -> dict[str, int]:
        """외부 API에서 방송 상태를 가져옵니다 (캐시 적용)."""
        now = time.monotonic()
        if now - self._last_fetched < CACHE_TTL_SECONDS and self._status:
            return self._status

        async with self._lock:
            # 락 획득 후 다시 확인 (다른 코루틴이 이미 fetch 했을 수 있음)
            now = time.monotonic()
            if now - self._last_fetched < CACHE_TTL_SECONDS and self._status:
                return self._status

            self._prev_status = dict(self._status)
            try:
                ymd = datetime.now().strftime("%Y-%m-%d")
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        ONAIR_API_URL,
                        data={"ymd": ymd},
                        headers={
                            "Referer": "https://live.ggc.go.kr/",
                            "Content-Type": "application/x-www-form-urlencoded",
                            "X-Requested-With": "XMLHttpRequest",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                            "Accept": "application/json, text/javascript, */*; q=0.01",
                        },
                    )
                    resp.raise_for_status()
                    # HTML 에러 페이지 감지: JSON 파싱 시도로 검증
                    data = resp.json()

                new_status: dict[str, int] = {}
                new_schedule: dict[str, dict] = {}
                for item in data:
                    ad_code = item.get("adCode", "")
                    live_status = item.get("kmsLivestatus", 0)
                    if ad_code:
                        new_status[ad_code] = live_status
                        new_schedule[ad_code] = {
                            "session_no": item.get("adTh", 0),
                            "session_order": item.get("adCha", 0),
                        }

                self._status = new_status
                self._schedule = new_schedule
                self._last_fetched = time.monotonic()

                # 변경 감지 → 구독자에게 알림
                changes = self._detect_changes()
                if changes:
                    await self._notify_subscribers(changes)

            except Exception as e:
                logger.warning("방송 상태 조회 실패: %s", e)
                # 실패 시 기존 캐시 유지, TTL만 짧게 재시도
                self._last_fetched = time.monotonic() - (CACHE_TTL_SECONDS - 1)

        return self._status

    def _detect_changes(self) -> list[dict]:
        """이전 상태와 비교하여 변경된 채널 목록을 반환합니다."""
        changes = []
        all_codes = set(self._status.keys()) | set(self._prev_status.keys())
        for code in all_codes:
            old = self._prev_status.get(code)
            new = self._status.get(code)
            if old != new:
                changes.append({
                    "code": code,
                    "old_status": old,
                    "new_status": new,
                    "old_text": get_status_text(old) if old is not None else None,
                    "new_text": get_status_text(new) if new is not None else None,
                })
        return changes

    async def _notify_subscribers(self, changes: list[dict]) -> None:
        """SSE 구독자에게 상태 변경 알림."""
        dead: list[asyncio.Queue] = []
        for queue in self._subscribers:
            try:
                queue.put_nowait(changes)
            except asyncio.QueueFull:
                dead.append(queue)
        for q in dead:
            self._subscribers.remove(q)

    def subscribe(self) -> asyncio.Queue:
        """SSE 구독 큐를 생성합니다."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=50)
        self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        """SSE 구독을 해제합니다."""
        if queue in self._subscribers:
            self._subscribers.remove(queue)

    async def get_channels_with_status(self) -> list[dict]:
        """전체 채널 목록에 방송 상태를 병합하여 반환합니다."""
        status_map = await self.fetch_status()
        result = []
        for ch in CHANNELS:
            code = ch["code"]
            livestatus = status_map.get(code, 0)
            schedule = self._schedule.get(code, {})
            has_schedule = code in self._schedule
            entry = {
                **ch,
                "livestatus": livestatus,
                "status_text": get_status_text(livestatus),
                "has_schedule": has_schedule,
            }
            if has_schedule:
                entry["session_no"] = schedule.get("session_no", 0)
                entry["session_order"] = schedule.get("session_order", 0)
            result.append(entry)
        return result


# 싱글턴 인스턴스
_service: Optional[ChannelStatusService] = None


def get_channel_status_service() -> ChannelStatusService:
    """ChannelStatusService 싱글턴을 반환합니다."""
    global _service
    if _service is None:
        _service = ChannelStatusService()
    return _service
