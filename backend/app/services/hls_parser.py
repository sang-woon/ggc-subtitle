"""HLS 플레이리스트 파서

m3u8 플레이리스트에서 TS 세그먼트 URL을 추출하고,
새로 추가된 세그먼트만 필터링합니다.

마스터 플레이리스트 (#EXT-X-STREAM-INF) 감지 시
첫 번째 미디어 플레이리스트로 자동 리다이렉트합니다.
"""

from __future__ import annotations

import logging
from urllib.parse import urljoin

import httpx

logger = logging.getLogger(__name__)


class HlsPlaylistParser:
    """m3u8 플레이리스트를 파싱하여 세그먼트 URL을 추출합니다.

    - 마스터 플레이리스트 → 미디어 플레이리스트 자동 해석
    - 상대 경로 → 절대 URL 변환
    - 이미 처리한 세그먼트 추적 (중복 방지)
    """

    def __init__(self) -> None:
        self._seen_segments: set[str] = set()
        self._client = httpx.AsyncClient(timeout=10.0)
        self._media_playlist_url: str | None = None

    async def fetch_segments(self, playlist_url: str) -> list[str]:
        """m3u8 URL을 다운로드하여 세그먼트 URL 목록을 반환합니다.

        마스터 플레이리스트인 경우 첫 번째 미디어 플레이리스트를 따라갑니다.
        """
        # 이미 미디어 플레이리스트 URL을 알고 있으면 바로 사용
        url = self._media_playlist_url or playlist_url

        response = await self._client.get(url)
        response.raise_for_status()
        text = response.text

        # 마스터 플레이리스트 감지 (#EXT-X-STREAM-INF 존재)
        if "#EXT-X-STREAM-INF" in text and self._media_playlist_url is None:
            media_url = self._extract_media_playlist(text, url)
            if media_url:
                logger.info("Master playlist detected, using media: %s", media_url)
                self._media_playlist_url = media_url
                # 미디어 플레이리스트 다시 fetch
                response = await self._client.get(media_url)
                response.raise_for_status()
                text = response.text

        return self._parse_segments(text, self._media_playlist_url or playlist_url)

    def _extract_media_playlist(self, text: str, base_url: str) -> str | None:
        """마스터 플레이리스트에서 첫 번째 미디어 플레이리스트 URL을 추출합니다."""
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # 첫 번째 비주석 라인이 미디어 플레이리스트
            return urljoin(base_url, line)
        return None

    def _parse_segments(self, text: str, base_url: str) -> list[str]:
        """미디어 플레이리스트 텍스트에서 세그먼트 URL을 추출합니다."""
        segments: list[str] = []
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # .ts 세그먼트만 필터링
            absolute_url = urljoin(base_url, line)
            segments.append(absolute_url)
        return segments

    def get_new_segments(self, all_segments: list[str]) -> list[str]:
        """이전에 처리하지 않은 새 세그먼트만 반환합니다."""
        new_segments = [s for s in all_segments if s not in self._seen_segments]
        self._seen_segments.update(new_segments)
        return new_segments

    def reset(self) -> None:
        """추적 상태를 초기화합니다."""
        self._seen_segments.clear()
        self._media_playlist_url = None

    async def close(self) -> None:
        """HTTP 클라이언트를 종료합니다."""
        await self._client.aclose()
