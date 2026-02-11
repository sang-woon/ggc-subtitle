"""VOD STT 처리 서비스 (Supabase REST 기반, ffmpeg 불필요)

MP4 파일을 Deepgram Pre-recorded API에 직접 전달하여 자막을 생성합니다.
ffmpeg 없이 동작하며, Deepgram이 오디오 추출/변환을 처리합니다.

인메모리 태스크 상태 관리를 포함합니다.
"""

from __future__ import annotations

import logging
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
import httpx
from supabase import Client

from app.core.config import settings
from app.services.dictionary import get_default_dictionary
from app.services.vod_processor import VodDownloadError

logger = logging.getLogger(__name__)

DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen"


# ============================================================================
# Task Status (인메모리)
# ============================================================================


@dataclass
class SttTaskStatus:
    """STT 태스크 상태"""

    task_id: str
    meeting_id: str
    status: str = "pending"  # pending | running | completed | failed
    progress: float = 0.0  # 0.0 ~ 1.0
    message: str = ""
    error: str | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# 인메모리 태스크 저장소: meeting_id → SttTaskStatus
_tasks: dict[str, SttTaskStatus] = {}


def get_task_by_meeting(meeting_id: str) -> SttTaskStatus | None:
    """meeting_id로 태스크 상태 조회"""
    return _tasks.get(meeting_id)


def get_task_by_id(task_id: str) -> SttTaskStatus | None:
    """task_id로 태스크 상태 조회"""
    for task in _tasks.values():
        if task.task_id == task_id:
            return task
    return None


def is_processing(meeting_id: str) -> bool:
    """해당 meeting이 현재 처리 중인지 확인"""
    task = _tasks.get(meeting_id)
    return task is not None and task.status in ("pending", "running")


# ============================================================================
# VOD STT Service
# ============================================================================


class VodSttService:
    """VOD STT 처리 서비스 (ffmpeg 불필요)

    MP4를 Deepgram Pre-recorded API에 직접 전달합니다.
    Deepgram이 오디오 추출, 변환, 화자 분리를 모두 처리합니다.
    """

    async def process(
        self,
        meeting_id: str,
        vod_url: str,
        supabase: Client,
    ) -> None:
        """VOD STT 전체 파이프라인 실행

        파이프라인:
        1. KMS에서 MP4 다운로드 → 임시 파일
        2. 임시 파일 → Deepgram API (MP4 직접 전송)
        3. Deepgram 응답 → 자막 파싱
        4. 자막 DB 저장
        """
        # 태스크 생성/등록
        task_id = str(uuid.uuid4())
        task = SttTaskStatus(
            task_id=task_id,
            meeting_id=meeting_id,
            status="running",
            message="처리 시작",
        )
        _tasks[meeting_id] = task

        mp4_path: Path | None = None

        try:
            # 1. meeting 상태 → processing
            self._update_task(task, 0.05, "회의 상태 업데이트 중")
            await self._update_meeting_status(supabase, meeting_id, "processing")

            # 2. VOD 다운로드 → 임시 파일
            self._update_task(task, 0.06, "VOD 다운로드 시작")
            mp4_path = await self._download_to_file(vod_url, task)
            file_mb = mp4_path.stat().st_size / (1024 * 1024)
            logger.info(f"VOD 다운로드 완료: {file_mb:.0f} MB")

            # 3. MP4 → Deepgram API 직접 전송 (ffmpeg 불필요)
            self._update_task(task, 0.2, "Deepgram 전송 시작")
            dg_result = await self._send_to_deepgram(mp4_path, task)

            # 임시 파일 즉시 삭제
            mp4_path.unlink(missing_ok=True)
            mp4_path = None

            # 4. Deepgram 응답 → 자막 파싱
            self._update_task(task, 0.92, "자막 데이터 변환 중")
            dictionary = get_default_dictionary()
            all_subtitles = self._parse_deepgram_response(
                meeting_id, dg_result, dictionary
            )
            logger.info(f"{len(all_subtitles)}개 자막 생성")

            # duration 추출 (Deepgram 메타데이터)
            duration = dg_result.get("metadata", {}).get("duration", 0)

            # 5. 자막 DB 저장
            self._update_task(task, 0.95, "자막 저장 중")
            if all_subtitles:
                await self._insert_subtitles(supabase, all_subtitles)

            # 6. meeting 상태 → ended + duration
            await self._update_meeting_status(
                supabase,
                meeting_id,
                "ended",
                duration_seconds=int(duration) if duration else None,
            )

            # 완료
            task.status = "completed"
            task.progress = 1.0
            task.message = f"완료 - {len(all_subtitles)}개 자막 생성"
            logger.info(f"VOD STT 완료: {len(all_subtitles)}개 자막")

        except Exception as e:
            logger.exception(f"VOD STT 처리 실패: {e}")
            task.status = "failed"
            task.error = str(e) or type(e).__name__
            task.message = "처리 실패"

            # 에러 시에도 meeting 상태 복원 시도
            try:
                await self._update_meeting_status(supabase, meeting_id, "ended")
            except Exception:
                pass

        finally:
            # 임시 파일 정리
            if mp4_path and mp4_path.exists():
                mp4_path.unlink(missing_ok=True)

    # ─── Deepgram 통신 ───

    @staticmethod
    async def _send_to_deepgram(
        mp4_path: Path,
        task: SttTaskStatus,
    ) -> dict:
        """MP4 파일을 Deepgram Pre-recorded API에 직접 전송

        Deepgram이 MP4에서 오디오를 추출하고 변환/분석합니다.
        ffmpeg가 필요 없습니다.

        Returns:
            Deepgram API 응답 JSON
        """
        file_size = mp4_path.stat().st_size

        params = {
            "model": "nova-3",
            "language": "ko",
            "smart_format": "true",
            "punctuate": "true",
            "diarize": "true",
            "utterances": "true",
        }

        headers = {
            "Authorization": f"Token {settings.deepgram_api_key}",
            "Content-Type": "video/mp4",
            "Content-Length": str(file_size),
        }

        # 파일을 청크 단위로 스트리밍 전송 (메모리 절약)
        uploaded = 0

        async def stream_file():
            nonlocal uploaded
            with open(mp4_path, "rb") as f:
                while True:
                    chunk = f.read(1024 * 1024)  # 1 MB
                    if not chunk:
                        break
                    uploaded += len(chunk)
                    # 전송 진행률: 20% → 40%
                    progress = 0.20 + (0.20 * uploaded / file_size)
                    mb_done = uploaded / (1024 * 1024)
                    mb_total = file_size / (1024 * 1024)
                    task.progress = progress
                    task.message = f"Deepgram 전송 중 ({mb_done:.0f}/{mb_total:.0f} MB)"
                    yield chunk

        logger.info(f"Deepgram API 전송 시작: {file_size / (1024*1024):.0f} MB")

        # 긴 타임아웃: 전송 + Deepgram 서버 처리 시간
        timeout = httpx.Timeout(
            connect=60.0,
            read=3600.0,    # 1시간 (Deepgram 처리 대기)
            write=1800.0,   # 30분 (대용량 파일 전송)
            pool=60.0,
        )

        async with httpx.AsyncClient(timeout=timeout) as client:
            task.progress = 0.40
            task.message = "Deepgram 분석 중 (대기)..."

            response = await client.post(
                DEEPGRAM_API_URL,
                params=params,
                headers=headers,
                content=stream_file(),
            )

            if response.status_code == 429:
                raise Exception("Deepgram API rate limit 초과. 잠시 후 다시 시도해 주세요.")
            if response.status_code != 200:
                error_text = response.text[:500]
                raise Exception(f"Deepgram API 오류 (HTTP {response.status_code}): {error_text}")

            result = response.json()
            logger.info("Deepgram API 응답 수신 완료")
            return result

    @staticmethod
    def _parse_deepgram_response(
        meeting_id: str,
        dg_result: dict,
        dictionary=None,
    ) -> list[dict]:
        """Deepgram utterances 응답을 자막 데이터로 변환

        utterances는 자연스러운 발화 단위로 분할되어 있어
        자막으로 바로 사용하기 적합합니다.
        """
        utterances = dg_result.get("results", {}).get("utterances", [])

        if not utterances:
            # utterances가 없으면 channels에서 대체
            channels = dg_result.get("results", {}).get("channels", [])
            if channels:
                alt = channels[0].get("alternatives", [{}])[0]
                words = alt.get("words", [])
                if words:
                    return VodSttService._words_to_subtitles(meeting_id, words, dictionary)
            return []

        subtitles = []
        for utt in utterances:
            text = utt.get("transcript", "").strip()
            if not text:
                continue

            # 사전 보정
            if dictionary:
                text = dictionary.correct(text)

            speaker_idx = utt.get("speaker")
            speaker_label = (
                f"화자 {speaker_idx + 1}" if speaker_idx is not None else None
            )

            subtitles.append({
                "meeting_id": meeting_id,
                "text": text,
                "start_time": utt.get("start", 0),
                "end_time": utt.get("end", 0),
                "confidence": utt.get("confidence", 0),
                "speaker": speaker_label,
            })

        return subtitles

    @staticmethod
    def _words_to_subtitles(
        meeting_id: str,
        words: list[dict],
        dictionary=None,
        max_segment_duration: float = 10.0,
    ) -> list[dict]:
        """Deepgram words 배열을 자막 세그먼트로 그룹핑 (fallback)"""
        if not words:
            return []

        subtitles = []
        current_words = []
        current_speaker = words[0].get("speaker")
        segment_start = words[0].get("start", 0)

        for word in words:
            speaker = word.get("speaker")
            word_start = word.get("start", 0)

            # 화자 변경 또는 세그먼트가 너무 길면 분할
            if (
                speaker != current_speaker
                or (word_start - segment_start) > max_segment_duration
            ):
                if current_words:
                    text = " ".join(w.get("punctuated_word", w.get("word", "")) for w in current_words).strip()
                    if text and dictionary:
                        text = dictionary.correct(text)
                    if text:
                        speaker_label = (
                            f"화자 {current_speaker + 1}"
                            if current_speaker is not None
                            else None
                        )
                        subtitles.append({
                            "meeting_id": meeting_id,
                            "text": text,
                            "start_time": segment_start,
                            "end_time": current_words[-1].get("end", segment_start),
                            "confidence": sum(w.get("confidence", 0) for w in current_words) / len(current_words),
                            "speaker": speaker_label,
                        })

                current_words = []
                current_speaker = speaker
                segment_start = word_start

            current_words.append(word)

        # 마지막 세그먼트
        if current_words:
            text = " ".join(w.get("punctuated_word", w.get("word", "")) for w in current_words).strip()
            if text and dictionary:
                text = dictionary.correct(text)
            if text:
                speaker_label = (
                    f"화자 {current_speaker + 1}"
                    if current_speaker is not None
                    else None
                )
                subtitles.append({
                    "meeting_id": meeting_id,
                    "text": text,
                    "start_time": segment_start,
                    "end_time": current_words[-1].get("end", segment_start),
                    "confidence": sum(w.get("confidence", 0) for w in current_words) / len(current_words),
                    "speaker": speaker_label,
                })

        return subtitles

    # ─── 다운로드 ───

    @staticmethod
    async def _download_to_file(
        vod_url: str,
        task: SttTaskStatus,
        timeout_seconds: float = 1800.0,
    ) -> Path:
        """VOD를 임시 파일에 스트리밍 다운로드 (메모리 절약)

        다운로드 진행률을 6%~18% 구간에 매핑합니다.

        Returns:
            다운로드된 임시 파일 경로
        """
        timeout = aiohttp.ClientTimeout(total=timeout_seconds)
        # KMS 서버는 Referer 헤더 필수
        headers = {"Referer": "https://kms.ggc.go.kr/"}

        tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
        tmp_path = Path(tmp.name)

        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(vod_url, headers=headers) as response:
                    if response.status != 200:
                        raise VodDownloadError(
                            f"VOD 다운로드 실패: HTTP {response.status}"
                        )

                    total_size = response.content_length or 0
                    downloaded = 0

                    async for chunk in response.content.iter_chunked(512 * 1024):
                        tmp.write(chunk)
                        downloaded += len(chunk)

                        if total_size > 0:
                            dl_ratio = downloaded / total_size
                            progress = 0.06 + (0.12 * dl_ratio)
                            mb_done = downloaded / (1024 * 1024)
                            mb_total = total_size / (1024 * 1024)
                            task.progress = progress
                            task.message = f"VOD 다운로드 중 ({mb_done:.0f}/{mb_total:.0f} MB)"
                        else:
                            mb_done = downloaded / (1024 * 1024)
                            task.progress = 0.1
                            task.message = f"VOD 다운로드 중 ({mb_done:.0f} MB)"

                    tmp.close()
                    return tmp_path

        except Exception:
            tmp.close()
            tmp_path.unlink(missing_ok=True)
            raise

    # ─── 유틸 ───

    @staticmethod
    def _update_task(task: SttTaskStatus, progress: float, message: str) -> None:
        """태스크 진행률 업데이트"""
        task.progress = progress
        task.message = message
        logger.info(f"[{task.meeting_id}] {progress:.0%} - {message}")

    @staticmethod
    async def _update_meeting_status(
        supabase: Client,
        meeting_id: str,
        status: str,
        *,
        duration_seconds: int | None = None,
    ) -> None:
        """Supabase REST로 meeting 상태 업데이트"""
        data: dict = {
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if duration_seconds is not None:
            data["duration_seconds"] = duration_seconds

        supabase.table("meetings").update(data).eq("id", meeting_id).execute()

    @staticmethod
    async def _insert_subtitles(
        supabase: Client,
        subtitles: list[dict],
    ) -> None:
        """Supabase REST로 자막 배치 삽입"""
        supabase.table("subtitles").insert(subtitles).execute()
