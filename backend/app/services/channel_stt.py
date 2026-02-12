"""채널 실시간 자막 STT 서비스 (Deepgram Streaming WebSocket)

채널별 HLS 스트림을 모니터링하며 Deepgram 스트리밍 API로 실시간 자막을 생성하고
WebSocket으로 브라우저에 브로드캐스트합니다.

파이프라인:
  m3u8 fetch → 새 세그먼트 감지 → TS 다운로드
       → Deepgram WebSocket으로 바이트 스트리밍 → 실시간 텍스트 수신
       → 브라우저 WebSocket broadcast
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import sys
import time
import uuid
from datetime import datetime, timezone

import httpx
import websockets

from kiwipiepy import Kiwi

from app.api.websocket import manager
from app.core.config import settings
from app.services.dictionary import get_default_dictionary
from app.services.subtitle_corrector import get_subtitle_corrector
from app.services.hls_parser import HlsPlaylistParser
from app.services.speaker_utils import group_words_by_speaker

logger = logging.getLogger(__name__)


def _create_kiwi() -> Kiwi:
    """Kiwi 인스턴스를 생성합니다.

    Windows에서 사용자명에 한글 등 비ASCII 문자가 포함된 경우
    kiwipiepy C++ 엔진이 모델 파일을 열지 못하는 문제를 우회합니다.
    기본 경로로 먼저 시도하고, 실패 시 모델을 ASCII-safe 경로로 복사합니다.
    """
    try:
        return Kiwi()
    except Exception:
        logger.warning("Kiwi default init failed (non-ASCII path?), copying model to safe path")

    try:
        import kiwipiepy_model

        src = os.path.dirname(kiwipiepy_model.__file__)
        # Windows의 %TEMP%도 비ASCII 경로일 수 있으므로 ASCII-safe 경로 사용
        if sys.platform == "win32":
            safe_dir = os.path.join("C:\\", "tmp", "kiwi_model")
        else:
            safe_dir = os.path.join("/tmp", "kiwi_model")
        if not os.path.exists(safe_dir):
            os.makedirs(os.path.dirname(safe_dir), exist_ok=True)
            shutil.copytree(src, safe_dir)
        return Kiwi(model_path=safe_dir)
    except Exception:
        logger.error("Kiwi init failed even with safe path, spacing will be disabled")
        return None  # type: ignore[return-value]


# 한국어 띄어쓰기 교정을 위한 Kiwi 싱글톤 인스턴스
_kiwi: Kiwi | None = _create_kiwi()

# 의회 용어 사전 (STT 오인식 보정)
_dictionary = get_default_dictionary()

# m3u8 폴링 간격 (초) - 낮을수록 자막 지연 감소 (최소 HLS 세그먼트 주기 이상 권장)
POLL_INTERVAL = 2.0
# Deepgram KeepAlive 간격 (초)
KEEPALIVE_INTERVAL = 8.0
# Deepgram WebSocket URL
DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"
# 자동 재연결 최대 대기 (초)
MAX_RECONNECT_DELAY = 30.0
# STT 무응답 감지 타임아웃 (초) - 이 시간 동안 Deepgram 응답이 없으면 강제 재연결
STALL_TIMEOUT = 60.0


class _SentenceBuffer:
    """is_final 프래그먼트를 문장 단위로 축적합니다."""

    def __init__(self) -> None:
        self.parts: list[str] = []
        self.speaker: int | None = None
        self.start_time: float = 0.0
        self.end_time: float = 0.0
        self.conf_sum: float = 0.0
        self.conf_count: int = 0

    @property
    def text(self) -> str:
        return " ".join(self.parts)

    @property
    def avg_confidence(self) -> float:
        return self.conf_sum / self.conf_count if self.conf_count else 0.0

    def add(
        self, text: str, speaker: int | None, confidence: float, start: float, end: float
    ) -> None:
        if not self.parts:
            self.start_time = start
        self.parts.append(text)
        self.end_time = end
        if speaker is not None:
            self.speaker = speaker
        self.conf_sum += confidence
        self.conf_count += 1

    def should_flush(self) -> bool:
        text = self.text
        if not text:
            return False
        # 문장 종료 부호
        stripped = text.rstrip()
        if not stripped:
            return False
        last_char = stripped[-1]
        if last_char in ".?!":
            return True
        # 쉼표도 플러시 트리거
        if last_char == ",":
            return True
        # 한국어 문장 종결 어미 패턴
        if stripped.endswith(("니다", "습니다", "까")):
            return True
        if last_char in ("요", "다"):
            return True
        # 너무 긴 경우 (40자 초과 시 빠르게 플러시)
        if len(text) > 40:
            return True
        return False

    def clear(self) -> None:
        self.parts.clear()
        self.speaker = None
        self.start_time = 0.0
        self.end_time = 0.0
        self.conf_sum = 0.0
        self.conf_count = 0


class ChannelSttService:
    """채널 HLS 스트림을 모니터링하며 실시간 자막을 생성합니다.

    Deepgram 스트리밍 WebSocket API를 사용하여:
    - HLS 세그먼트를 다운로드 후 바이트를 스트리밍 전송
    - Deepgram이 오디오를 디코딩하고 텍스트를 반환
    - 문장 단위로 축적하여 브라우저에 브로드캐스트
    - 화자 구분 (diarize) 지원
    - 연결 실패 시 자동 재연결 (exponential backoff)
    """

    def __init__(self) -> None:
        self._active_tasks: dict[str, asyncio.Task] = {}  # type: ignore[type-arg]
        self._parsers: dict[str, HlsPlaylistParser] = {}
        self._subtitle_counter: dict[str, int] = {}
        self._sentence_buffers: dict[str, _SentenceBuffer] = {}
        self._last_receive_time: dict[str, float] = {}
        self._last_error: dict[str, str] = {}
        self._reconnect_count: dict[str, int] = {}

    async def start(self, channel_id: str, stream_url: str) -> None:
        """채널 STT 처리를 시작합니다.

        이미 실행 중이면 기존 태스크를 중지 후 재시작합니다.
        """
        if channel_id in self._active_tasks:
            await self.stop(channel_id)

        if not settings.deepgram_api_key:
            logger.error("Channel %s: Deepgram API key not configured", channel_id)
            return

        logger.info("Starting STT for channel %s: %s", channel_id, stream_url)

        parser = HlsPlaylistParser()
        self._parsers[channel_id] = parser
        self._subtitle_counter[channel_id] = 0
        self._last_receive_time[channel_id] = time.monotonic()

        task = asyncio.create_task(
            self._run_with_reconnect(channel_id, stream_url, parser),
            name=f"stt-{channel_id}",
        )
        self._active_tasks[channel_id] = task

    async def stop(self, channel_id: str) -> None:
        """채널 STT 처리를 중지합니다."""
        task = self._active_tasks.pop(channel_id, None)
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        parser = self._parsers.pop(channel_id, None)
        if parser:
            await parser.close()

        self._subtitle_counter.pop(channel_id, None)
        self._last_receive_time.pop(channel_id, None)
        buf = self._sentence_buffers.pop(channel_id, None)
        if buf:
            buf.clear()
        # 자막 히스토리 정리 (방송 종료 시 이전 자막 초기화)
        manager.clear_history(channel_id)
        logger.info("Stopped STT for channel %s", channel_id)

    async def stop_all(self) -> None:
        """모든 활성 채널 STT를 중지합니다."""
        channel_ids = list(self._active_tasks.keys())
        for channel_id in channel_ids:
            await self.stop(channel_id)
        logger.info("Stopped all STT channels (%d)", len(channel_ids))

    def is_running(self, channel_id: str) -> bool:
        """채널 STT가 실행 중인지 확인합니다."""
        task = self._active_tasks.get(channel_id)
        return task is not None and not task.done()

    def get_debug_info(self, channel_id: str) -> dict:
        """채널 STT 디버그 정보를 반환합니다."""
        task = self._active_tasks.get(channel_id)
        last_recv = self._last_receive_time.get(channel_id)
        elapsed = None
        if last_recv is not None:
            elapsed = round(time.monotonic() - last_recv, 1)
        subtitle_count = self._subtitle_counter.get(channel_id, 0)
        buf = self._sentence_buffers.get(channel_id)
        return {
            "channel_id": channel_id,
            "task_exists": task is not None,
            "task_done": task.done() if task else None,
            "task_exception": str(task.exception()) if task and task.done() and task.exception() else None,
            "last_deepgram_recv_secs_ago": elapsed,
            "subtitle_count": subtitle_count,
            "buffer_text": buf.text[:100] if buf and buf.parts else None,
            "active_ws_rooms": list(manager.active_connections.keys()),
            "last_error": self._last_error.get(channel_id),
            "reconnect_count": self._reconnect_count.get(channel_id, 0),
        }

    async def _run_with_reconnect(
        self,
        channel_id: str,
        stream_url: str,
        parser: HlsPlaylistParser,
    ) -> None:
        """Deepgram WebSocket 자동 재연결 루프."""
        delay = 1.0
        while True:
            try:
                await self._run(channel_id, stream_url, parser)
                # 정상 종료 시 재연결
                logger.info("Channel %s: STT session ended, reconnecting...", channel_id)
                self._last_error[channel_id] = "session_ended_normally"
                delay = 1.0
            except asyncio.CancelledError:
                logger.info("Channel %s: STT cancelled", channel_id)
                return
            except Exception as e:
                self._last_error[channel_id] = f"{type(e).__name__}: {e}"
                self._reconnect_count[channel_id] = self._reconnect_count.get(channel_id, 0) + 1
                logger.error("Channel %s: STT failed: %s, retrying in %.0fs", channel_id, e, delay)

            await asyncio.sleep(delay)
            delay = min(delay * 2, MAX_RECONNECT_DELAY)

    async def _run(
        self,
        channel_id: str,
        stream_url: str,
        parser: HlsPlaylistParser,
    ) -> None:
        """Deepgram WebSocket에 연결하고 HLS 세그먼트를 스트리밍합니다."""
        # NOTE: 키워드 부스팅은 Deepgram Streaming WebSocket에서
        # 한국어 인코딩 이슈(HTTP 400)가 있어 비활성화.
        # 용어 보정은 _dictionary.correct()에서 후처리로 수행.
        ws_url = (
            f"{DEEPGRAM_WS_URL}"
            f"?model=nova-3"
            f"&language=ko"
            f"&smart_format=true"
            f"&punctuate=true"
            f"&interim_results=true"
            f"&vad_events=true"
            f"&endpointing=300"
            f"&diarize=true"
        )
        headers = {"Authorization": f"Token {settings.deepgram_api_key}"}
        http_client = httpx.AsyncClient(timeout=30.0)

        try:
            async with websockets.connect(ws_url, additional_headers=headers) as dg_ws:
                logger.info("Channel %s: Deepgram WebSocket connected", channel_id)

                # 4개의 동시 태스크 실행 (watchdog 포함)
                sender_task = asyncio.create_task(
                    self._send_segments(channel_id, stream_url, parser, http_client, dg_ws)
                )
                receiver_task = asyncio.create_task(
                    self._receive_transcripts(channel_id, dg_ws)
                )
                keepalive_task = asyncio.create_task(
                    self._send_keepalive(dg_ws)
                )
                watchdog_task = asyncio.create_task(
                    self._watchdog(channel_id, dg_ws)
                )

                # 하나라도 끝나면 나머지도 정리
                done, pending = await asyncio.wait(
                    [sender_task, receiver_task, keepalive_task, watchdog_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for t in pending:
                    t.cancel()
                # 에러 확인
                for t in done:
                    if t.exception():
                        logger.error(
                            "Channel %s: task error: %s", channel_id, t.exception()
                        )
        finally:
            await http_client.aclose()

    async def _send_segments(
        self,
        channel_id: str,
        stream_url: str,
        parser: HlsPlaylistParser,
        http_client: httpx.AsyncClient,
        dg_ws: websockets.ClientConnection,
    ) -> None:
        """HLS 세그먼트를 다운로드하여 Deepgram WebSocket에 전송합니다."""
        while True:
            try:
                all_segments = await parser.fetch_segments(stream_url)
                new_segments = parser.get_new_segments(all_segments)

                for segment_url in new_segments:
                    try:
                        response = await http_client.get(segment_url)
                        response.raise_for_status()
                        ts_bytes = response.content

                        logger.info(
                            "Channel %s: sending segment %s (%d bytes)",
                            channel_id,
                            segment_url.split("/")[-1],
                            len(ts_bytes),
                        )

                        # TS 바이트를 Deepgram WebSocket에 전송
                        await dg_ws.send(ts_bytes)

                    except Exception as e:
                        logger.warning(
                            "Channel %s: segment download/send failed: %s",
                            channel_id,
                            e,
                        )

            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning("Channel %s: poll failed: %s", channel_id, e)

            await asyncio.sleep(POLL_INTERVAL)

    async def _receive_transcripts(
        self,
        channel_id: str,
        dg_ws: websockets.ClientConnection,
    ) -> None:
        """Deepgram WebSocket에서 텍스트 결과를 수신하여 문장 단위로 브로드캐스트합니다.

        - words 배열에서 띄어쓰기가 포함된 텍스트를 재구성
        - diarize를 통해 화자 정보 추출
        - 문장 종결 부호(. ? !)가 나올 때까지 프래그먼트를 축적
        """
        buffer = self._sentence_buffers.setdefault(channel_id, _SentenceBuffer())
        buffer.clear()

        async for message in dg_ws:
            try:
                # Deepgram으로부터 메시지 수신 → 활성 상태 갱신
                self._last_receive_time[channel_id] = time.monotonic()

                data = json.loads(message)
                msg_type = data.get("type", "")

                # Results 타입만 처리
                if msg_type != "Results":
                    if msg_type == "SpeechStarted":
                        logger.debug("Channel %s: speech detected", channel_id)
                    continue

                ch_data = data.get("channel", {})
                alternatives = ch_data.get("alternatives", [])
                if not alternatives:
                    continue

                # 인터림 결과 처리 (확정 전 미리보기 자막)
                if not data.get("is_final", False):
                    alt_interim = alternatives[0]
                    interim_transcript = alt_interim.get("transcript", "").strip()
                    logger.debug(
                        "Channel %s: INTERIM raw=%r len=%d",
                        channel_id, interim_transcript[:60], len(interim_transcript),
                    )
                    if interim_transcript and len(interim_transcript) > 2:
                        # 한국어 띄어쓰기 교정 적용
                        if _kiwi is not None:
                            try:
                                interim_transcript = _kiwi.space(interim_transcript)
                                interim_transcript = re.sub(r"\s{2,}", " ", interim_transcript).strip()
                            except Exception:
                                pass
                        # 의회 용어 사전 보정
                        interim_transcript = _dictionary.correct(interim_transcript)
                        await manager.broadcast_interim_subtitle(channel_id, {
                            "text": interim_transcript,
                            "channel_id": channel_id,
                        })
                    continue

                alt = alternatives[0]

                # words 배열에서 화자 경계별로 분할하여 처리
                words = alt.get("words", [])
                if words:
                    speaker_groups = group_words_by_speaker(words)
                else:
                    # words가 없는 경우 폴백
                    transcript = alt.get("transcript", "").strip()
                    if not transcript:
                        continue
                    start_time = data.get("start", 0.0)
                    duration = data.get("duration", 5.0)
                    speaker_groups = [{
                        "speaker": None,
                        "text": transcript,
                        "confidence": alt.get("confidence", 0.0),
                        "start": start_time,
                        "end": start_time + duration,
                    }]

                for group in speaker_groups:
                    transcript = group["text"]
                    speaker = group["speaker"]
                    confidence = group["confidence"]
                    start_time = group["start"]
                    end_time = group["end"]

                    if not transcript:
                        continue

                    logger.debug(
                        "Channel %s: fragment '%s' (%.2f) speaker=%s",
                        channel_id, transcript[:60], confidence, speaker,
                    )

                    # 화자 변경 시 기존 버퍼 즉시 플러시
                    if (
                        buffer.parts
                        and speaker is not None
                        and buffer.speaker is not None
                        and speaker != buffer.speaker
                    ):
                        await self._emit_subtitle(channel_id, buffer)
                        buffer.clear()

                    buffer.add(transcript, speaker, confidence, start_time, end_time)

                    if buffer.should_flush():
                        await self._emit_subtitle(channel_id, buffer)
                        buffer.clear()

            except json.JSONDecodeError:
                logger.warning("Channel %s: invalid JSON from Deepgram", channel_id)

        # 연결 종료 시 남은 버퍼 플러시
        if buffer.parts:
            await self._emit_subtitle(channel_id, buffer)
            buffer.clear()

    async def _emit_subtitle(
        self, channel_id: str, buffer: _SentenceBuffer
    ) -> None:
        """축적된 문장 버퍼를 자막으로 브로드캐스트합니다.

        kiwipiepy를 사용하여 한국어 띄어쓰기를 교정한 후 전송합니다.
        """
        counter = self._subtitle_counter.get(channel_id, 0)
        self._subtitle_counter[channel_id] = counter + 1

        speaker_label = (
            f"화자 {buffer.speaker + 1}" if buffer.speaker is not None else None
        )

        # 한국어 띄어쓰기 교정 (Deepgram 한국어 스트리밍에서 띄어쓰기가 누락되는 문제 해결)
        raw_text = buffer.text
        if _kiwi is not None:
            try:
                spaced_text = _kiwi.space(raw_text)
                # 연속 공백 정리 (kiwi가 과도한 공백을 삽입할 수 있음)
                spaced_text = re.sub(r"\s{2,}", " ", spaced_text).strip()
            except Exception:
                logger.warning("Channel %s: kiwi.space() failed, using raw text", channel_id)
                spaced_text = raw_text
        else:
            spaced_text = raw_text

        # 의회 용어 사전 보정 (STT 오인식 교정)
        spaced_text = _dictionary.correct(spaced_text)

        subtitle_data = {
            "subtitle": {
                "id": str(uuid.uuid4()),
                "meeting_id": channel_id,
                "text": spaced_text,
                "start_time": buffer.start_time,
                "end_time": buffer.end_time,
                "confidence": buffer.avg_confidence,
                "speaker": speaker_label,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        }

        logger.info(
            "Channel %s: [STT] %s (%.2f) [%s]",
            channel_id,
            spaced_text[:80],
            buffer.avg_confidence,
            speaker_label or "?",
        )

        await manager.broadcast_subtitle(channel_id, subtitle_data)

        # OpenAI 자막 교정 큐에 추가 (비동기, 논블로킹)
        corrector = get_subtitle_corrector()
        if corrector.enabled:
            await corrector.enqueue(
                subtitle_id=subtitle_data["subtitle"]["id"],
                channel_id=channel_id,
                text=spaced_text,
                speaker=speaker_label,
            )

    async def _send_keepalive(
        self,
        dg_ws: websockets.ClientConnection,
    ) -> None:
        """Deepgram WebSocket에 KeepAlive 메시지를 주기적으로 전송합니다."""
        while True:
            await asyncio.sleep(KEEPALIVE_INTERVAL)
            try:
                await dg_ws.send(json.dumps({"type": "KeepAlive"}))
            except Exception:
                return

    async def _watchdog(
        self,
        channel_id: str,
        dg_ws: websockets.ClientConnection,
    ) -> None:
        """Deepgram 무응답 감지 워치독.

        STALL_TIMEOUT 동안 Deepgram으로부터 아무 메시지도 수신하지 못하면
        WebSocket을 강제로 닫아 자동 재연결을 트리거합니다.
        """
        while True:
            await asyncio.sleep(STALL_TIMEOUT / 2)
            last = self._last_receive_time.get(channel_id, time.monotonic())
            elapsed = time.monotonic() - last
            if elapsed > STALL_TIMEOUT:
                logger.warning(
                    "Channel %s: STT stalled (no Deepgram response for %.0fs), forcing reconnect",
                    channel_id,
                    elapsed,
                )
                await dg_ws.close()
                return


# 전역 싱글톤 인스턴스
_channel_stt_service: ChannelSttService | None = None


def get_channel_stt_service() -> ChannelSttService:
    """ChannelSttService 싱글톤 인스턴스를 반환합니다."""
    global _channel_stt_service
    if _channel_stt_service is None:
        _channel_stt_service = ChannelSttService()
    return _channel_stt_service
