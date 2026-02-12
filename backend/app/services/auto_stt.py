"""STT 자동 시작/중지 매니저

방송 상태 변경을 감지하여 STT를 자동으로 시작/중지합니다.

동작 방식:
- 서버 시작 시: 현재 방송중(livestatus=1)인 채널에 STT 자동 시작
- SSE 상태 변경 감지 시: 방송 시작 → STT 시작, 방송 종료 → STT 중지
- GET /api/channels/status 호출 시: 방송중인데 STT가 꺼진 채널 보정

안전장치:
- Deepgram API 키 미설정 시 비활성화
- stt_auto_start 설정으로 on/off 제어
- 이미 실행 중인 채널은 중복 시작 방지
"""

from __future__ import annotations

import asyncio
import logging

from app.core.channels import CHANNELS, get_channel_by_code
from app.core.config import settings
from app.services.channel_status import ChannelStatusService, get_channel_status_service
from app.services.channel_stt import ChannelSttService, get_channel_stt_service

logger = logging.getLogger(__name__)

# 방송중 상태 코드
LIVESTATUS_BROADCASTING = 1


class AutoSttManager:
    """방송 상태에 따라 STT를 자동 시작/중지하는 매니저.

    두 가지 메커니즘으로 동작합니다:
    1. SSE 구독을 통한 상태 변경 감지 (실시간 반응)
    2. ensure_stt_for_live_channels() 호출을 통한 보정 (폴링 호출 시)
    """

    def __init__(
        self,
        status_service: ChannelStatusService,
        stt_service: ChannelSttService,
    ) -> None:
        self._status_service = status_service
        self._stt_service = stt_service
        self._monitor_task: asyncio.Task | None = None  # type: ignore[type-arg]
        self._enabled = settings.stt_auto_start and bool(settings.deepgram_api_key)

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def start(self) -> None:
        """자동 STT 매니저를 시작합니다.

        1. 현재 방송중인 채널에 STT 자동 시작
        2. SSE 구독으로 상태 변경 모니터링 시작
        """
        if not self._enabled:
            if not settings.deepgram_api_key:
                logger.warning("AutoSttManager disabled: Deepgram API key not configured")
            elif not settings.stt_auto_start:
                logger.info("AutoSttManager disabled: stt_auto_start=False")
            return

        logger.info("AutoSttManager starting: auto-start STT for broadcasting channels")

        # 1. 현재 방송중인 채널에 STT 시작
        await self._start_stt_for_live_channels()

        # 2. SSE 구독으로 상태 변경 모니터링
        self._monitor_task = asyncio.create_task(
            self._monitor_status_changes(),
            name="auto-stt-monitor",
        )

    async def stop(self) -> None:
        """자동 STT 매니저를 중지합니다."""
        if self._monitor_task and not self._monitor_task.done():
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
        # 모든 활성 채널 STT 정리
        await self._stt_service.stop_all()
        logger.info("AutoSttManager stopped (all channel STT cleaned up)")

    async def ensure_stt_for_live_channels(self) -> list[str]:
        """방송중인데 STT가 꺼진 채널을 보정합니다.

        GET /api/channels/status 호출 시 부수효과로 실행됩니다.
        이미 실행 중인 채널은 무시합니다.

        Returns:
            새로 STT를 시작한 채널 ID 목록
        """
        if not self._enabled:
            return []

        started = []
        status_map = await self._status_service.fetch_status()

        for ch in CHANNELS:
            code = ch["code"]
            channel_id = ch["id"]
            livestatus = status_map.get(code, 0)

            if livestatus == LIVESTATUS_BROADCASTING and not self._stt_service.is_running(channel_id):
                logger.info(
                    "AutoSTT: starting STT for live channel %s (%s) - detected via polling",
                    channel_id,
                    ch["name"],
                )
                await self._stt_service.start(channel_id, ch["stream_url"])
                started.append(channel_id)

        return started

    async def _start_stt_for_live_channels(self) -> None:
        """현재 방송중인 모든 채널에 STT를 시작합니다."""
        try:
            status_map = await self._status_service.fetch_status()

            started_count = 0
            for ch in CHANNELS:
                code = ch["code"]
                channel_id = ch["id"]
                livestatus = status_map.get(code, 0)

                if livestatus == LIVESTATUS_BROADCASTING:
                    if not self._stt_service.is_running(channel_id):
                        logger.info(
                            "AutoSTT: starting STT for live channel %s (%s)",
                            channel_id,
                            ch["name"],
                        )
                        await self._stt_service.start(channel_id, ch["stream_url"])
                        started_count += 1
                    else:
                        logger.debug(
                            "AutoSTT: channel %s already running", channel_id
                        )

            if started_count > 0:
                logger.info("AutoSTT: started STT for %d broadcasting channels", started_count)
            else:
                logger.info("AutoSTT: no broadcasting channels found at startup")

        except Exception as e:
            logger.error("AutoSTT: failed to start STT for live channels: %s", e)

    async def _monitor_status_changes(self) -> None:
        """SSE 구독을 통해 상태 변경을 감지하고 STT를 자동 시작/중지합니다."""
        queue = self._status_service.subscribe()
        try:
            while True:
                changes = await queue.get()
                await self._handle_status_changes(changes)
        except asyncio.CancelledError:
            pass
        finally:
            self._status_service.unsubscribe(queue)

    async def _handle_status_changes(self, changes: list[dict]) -> None:
        """상태 변경 이벤트를 처리합니다.

        - 방송 시작 (new_status=1): STT 자동 시작
        - 방송 종료 (old_status=1, new_status!=1): STT 자동 중지
        """
        for change in changes:
            code = change.get("code", "")
            old_status = change.get("old_status")
            new_status = change.get("new_status")

            channel = get_channel_by_code(code)
            if channel is None:
                continue

            channel_id = channel["id"]
            channel_name = channel["name"]

            # 방송 시작 → STT 시작
            if new_status == LIVESTATUS_BROADCASTING and old_status != LIVESTATUS_BROADCASTING:
                if not self._stt_service.is_running(channel_id):
                    logger.info(
                        "AutoSTT: channel %s (%s) started broadcasting -> starting STT",
                        channel_id,
                        channel_name,
                    )
                    try:
                        await self._stt_service.start(channel_id, channel["stream_url"])
                    except Exception as e:
                        logger.error(
                            "AutoSTT: failed to start STT for %s: %s", channel_id, e
                        )

            # 방송 종료 → STT 중지
            elif old_status == LIVESTATUS_BROADCASTING and new_status != LIVESTATUS_BROADCASTING:
                if self._stt_service.is_running(channel_id):
                    logger.info(
                        "AutoSTT: channel %s (%s) stopped broadcasting (status=%s) -> stopping STT",
                        channel_id,
                        channel_name,
                        change.get("new_text", new_status),
                    )
                    try:
                        await self._stt_service.stop(channel_id)
                    except Exception as e:
                        logger.error(
                            "AutoSTT: failed to stop STT for %s: %s", channel_id, e
                        )


# 싱글톤 인스턴스
_auto_stt_manager: AutoSttManager | None = None


def get_auto_stt_manager() -> AutoSttManager:
    """AutoSttManager 싱글톤을 반환합니다."""
    global _auto_stt_manager
    if _auto_stt_manager is None:
        _auto_stt_manager = AutoSttManager(
            status_service=get_channel_status_service(),
            stt_service=get_channel_stt_service(),
        )
    return _auto_stt_manager
