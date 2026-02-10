"""KMS VOD URL → MP4 직접 재생 URL 변환 및 메타데이터 추출 서비스

경기도의회 KMS(kms.ggc.go.kr) VOD 뷰어 페이지에서
직접 재생 가능한 MP4 URL과 메타데이터(제목, 날짜, 영상 길이)를 추출합니다.

사용자 URL 예시:
  https://kms.ggc.go.kr/caster/player/vodViewer.do?midx=137982

페이지 내 JS에서 추출:
  var mp4file = "/mp4media2/gihoek/20251222_gihoek.mp4";
  var vodtitle = "제389회 경기도의회 제1차 본회의 [2025.01.08]";
  var total_frame = 3600*1000;
"""

import re
import logging
from datetime import date
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

KMS_HOST = "https://kms.ggc.go.kr"
KMS_VOD_VIEWER_PATTERN = "kms.ggc.go.kr/caster/player/vodViewer.do"
MP4FILE_REGEX = re.compile(r'var\s+mp4file\s*=\s*"([^"]+)"')
VODTITLE_REGEX = re.compile(r'var\s+vodtitle\s*=\s*"([^"]+)"')
TOTAL_FRAME_REGEX = re.compile(r'var\s+total_frame\s*=\s*(\d+)\s*\*\s*1000')
DATE_PATTERN_REGEX = re.compile(r'\[(\d{4})\.(\d{2})\.(\d{2})\]')


def is_kms_vod_url(url: str) -> bool:
    """KMS VOD 뷰어 URL인지 확인합니다."""
    return KMS_VOD_VIEWER_PATTERN in url


def _title_from_url(url: str) -> str:
    """URL 경로에서 파일명 기반 제목을 생성합니다."""
    parsed = urlparse(url)
    path = parsed.path.rstrip("/")
    if path:
        filename = path.split("/")[-1]
        name = filename.rsplit(".", 1)[0] if "." in filename else filename
        return name
    return "VOD"


async def _fetch_kms_page(page_url: str) -> str:
    """KMS 페이지 HTML을 가져옵니다."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(page_url)
        response.raise_for_status()
    return response.text


async def resolve_kms_vod_metadata(page_url: str) -> dict:
    """KMS VOD 뷰어 URL에서 메타데이터를 추출합니다.

    KMS URL이 아니면 URL 기반 최소 메타데이터를 반환합니다.

    Args:
        page_url: KMS vodViewer.do URL 또는 일반 URL

    Returns:
        dict: title, meeting_date (ISO), vod_url, duration_seconds

    Raises:
        ValueError: KMS 페이지에서 MP4 경로를 찾을 수 없을 때
    """
    if not is_kms_vod_url(page_url):
        return {
            "title": _title_from_url(page_url),
            "meeting_date": date.today().isoformat(),
            "vod_url": page_url,
            "duration_seconds": None,
        }

    html = await _fetch_kms_page(page_url)

    # MP4 URL (필수)
    mp4_match = MP4FILE_REGEX.search(html)
    if not mp4_match:
        raise ValueError(
            f"KMS 페이지에서 MP4 파일 경로를 찾을 수 없습니다: {page_url}"
        )
    mp4file = mp4_match.group(1)
    vod_url = f"{KMS_HOST}/mp4/{mp4file}"

    # 제목 (선택)
    title = None
    title_match = VODTITLE_REGEX.search(html)
    if title_match:
        title = title_match.group(1)

    # 제목에서 날짜 추출 (선택)
    meeting_date = None
    if title:
        date_match = DATE_PATTERN_REGEX.search(title)
        if date_match:
            y, m, d = date_match.groups()
            meeting_date = f"{y}-{m}-{d}"

    # 영상 길이 (선택)
    duration_seconds = None
    duration_match = TOTAL_FRAME_REGEX.search(html)
    if duration_match:
        duration_seconds = int(duration_match.group(1))

    # 폴백
    if not title:
        title = _title_from_url(page_url)
    if not meeting_date:
        meeting_date = date.today().isoformat()

    logger.info(
        "KMS VOD metadata: %s -> title=%s, date=%s, url=%s, duration=%s",
        page_url, title, meeting_date, vod_url, duration_seconds,
    )
    return {
        "title": title,
        "meeting_date": meeting_date,
        "vod_url": vod_url,
        "duration_seconds": duration_seconds,
    }


async def resolve_kms_vod_url(page_url: str) -> str:
    """KMS VOD 뷰어 URL에서 직접 재생 가능한 MP4 URL을 추출합니다.

    KMS URL이 아니면 원본 URL을 그대로 반환합니다.
    내부적으로 resolve_kms_vod_metadata()를 호출합니다.

    Args:
        page_url: KMS vodViewer.do URL 또는 일반 URL

    Returns:
        직접 재생 가능한 MP4 URL

    Raises:
        ValueError: KMS 페이지에서 MP4 경로를 찾을 수 없을 때
    """
    metadata = await resolve_kms_vod_metadata(page_url)
    return metadata["vod_url"]
