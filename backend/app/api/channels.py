"""Channels API 라우터"""

import asyncio
import json
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse

from app.core.channels import get_all_channels, get_channel
from app.services.auto_stt import get_auto_stt_manager
from app.services.channel_status import get_channel_status_service
from app.services.channel_stt import get_channel_stt_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/channels", tags=["channels"])


@router.get("")
async def list_channels() -> list[dict]:
    """전체 채널 목록을 반환합니다."""
    return get_all_channels()


@router.get("/status")
async def get_channels_status(background_tasks: BackgroundTasks) -> list[dict]:
    """전체 채널 + 실시간 방송 상태를 반환합니다.

    부수효과: 방송중인데 STT가 꺼진 채널이 있으면 백그라운드에서 자동 시작합니다.
    """
    service = get_channel_status_service()
    channels = await service.get_channels_with_status()

    # 각 채널에 STT 실행 상태 추가
    stt_service = get_channel_stt_service()
    for ch in channels:
        ch["stt_running"] = stt_service.is_running(ch["id"])

    # 방송중인데 STT가 실행되지 않은 채널을 백그라운드에서 보정
    auto_stt = get_auto_stt_manager()
    if auto_stt.enabled:
        background_tasks.add_task(auto_stt.ensure_stt_for_live_channels)

    return channels


@router.get("/status/stream")
async def stream_channel_status() -> StreamingResponse:
    """SSE 스트림으로 채널 방송 상태 변경을 실시간 전송합니다."""
    service = get_channel_status_service()
    queue = service.subscribe()

    async def event_generator():
        try:
            # 초기 상태 전송
            channels = await service.get_channels_with_status()
            yield f"data: {json.dumps(channels, ensure_ascii=False)}\n\n"

            # 백그라운드 폴링 + 변경 이벤트 대기
            while True:
                try:
                    # 5초마다 폴링 트리거 (캐시 TTL과 동일)
                    changes = await asyncio.wait_for(queue.get(), timeout=5.0)
                    # 변경 발생 시 전체 상태 재전송
                    channels = await service.get_channels_with_status()
                    yield f"event: status_change\ndata: {json.dumps({'channels': channels, 'changes': changes}, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    # 타임아웃: 폴링 트리거 + keepalive
                    await service.fetch_status()
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            service.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{channel_id}/stt/start")
async def start_channel_stt(channel_id: str) -> dict:
    """채널 STT 처리를 시작합니다."""
    channel = get_channel(channel_id)
    if channel is None:
        raise HTTPException(status_code=404, detail=f"Channel {channel_id} not found")

    service = get_channel_stt_service()

    if service.is_running(channel_id):
        logger.info("STT start requested for %s: already running", channel_id)
        return {"status": "already_running", "channel_id": channel_id}

    logger.info("STT start requested for %s: starting...", channel_id)
    await service.start(channel_id, channel["stream_url"])
    return {"status": "started", "channel_id": channel_id}


@router.post("/{channel_id}/stt/stop")
async def stop_channel_stt(channel_id: str) -> dict:
    """채널 STT 처리를 중지합니다.

    NOTE: AutoSttManager가 활성화되어 있으면 방송중인 채널의 STT를
    자동으로 재시작합니다. 클라이언트가 stop을 호출해도 방송중이면
    다음 폴링 시 보정됩니다.
    """
    channel = get_channel(channel_id)
    if channel is None:
        raise HTTPException(status_code=404, detail=f"Channel {channel_id} not found")

    service = get_channel_stt_service()

    if not service.is_running(channel_id):
        logger.info("STT stop requested for %s: not running", channel_id)
        return {"status": "not_running", "channel_id": channel_id}

    logger.info("STT stop requested for %s: stopping...", channel_id)
    await service.stop(channel_id)
    return {"status": "stopped", "channel_id": channel_id}


@router.get("/{channel_id}/stt/status")
async def get_channel_stt_status(channel_id: str) -> dict:
    """채널 STT 실행 상태를 확인합니다."""
    channel = get_channel(channel_id)
    if channel is None:
        raise HTTPException(status_code=404, detail=f"Channel {channel_id} not found")

    service = get_channel_stt_service()
    return {"running": service.is_running(channel_id), "channel_id": channel_id}


@router.get("/{channel_id}")
async def get_channel_by_id(channel_id: str) -> dict:
    """채널 ID로 채널을 조회합니다."""
    channel = get_channel(channel_id)
    if channel is None:
        raise HTTPException(status_code=404, detail=f"Channel {channel_id} not found")
    return channel
