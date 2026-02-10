"""KMS VOD URL → MP4 직접 재생 URL 변환 서비스

경기도의회 KMS(kms.ggc.go.kr) VOD 뷰어 페이지에서
직접 재생 가능한 MP4 URL을 추출합니다.

사용자 URL 예시:
  https://kms.ggc.go.kr/caster/player/vodViewer.do?midx=137982

페이지 내 JS에서 추출:
  var mp4file = "/mp4media2/gihoek/20251222_gihoek.mp4";

결과 MP4 URL:
  https://kms.ggc.go.kr/mp4//mp4media2/gihoek/20251222_gihoek.mp4
"""

import re
import logging

import httpx

logger = logging.getLogger(__name__)

KMS_HOST = "https://kms.ggc.go.kr"
KMS_VOD_VIEWER_PATTERN = "kms.ggc.go.kr/caster/player/vodViewer.do"
MP4FILE_REGEX = re.compile(r'var\s+mp4file\s*=\s*"([^"]+)"')


def is_kms_vod_url(url: str) -> bool:
    """KMS VOD 뷰어 URL인지 확인합니다."""
    return KMS_VOD_VIEWER_PATTERN in url


async def resolve_kms_vod_url(page_url: str) -> str:
    """KMS VOD 뷰어 URL에서 직접 재생 가능한 MP4 URL을 추출합니다.

    KMS URL이 아니면 원본 URL을 그대로 반환합니다.

    Args:
        page_url: KMS vodViewer.do URL 또는 일반 URL

    Returns:
        직접 재생 가능한 MP4 URL

    Raises:
        ValueError: KMS 페이지에서 MP4 경로를 찾을 수 없을 때
    """
    if not is_kms_vod_url(page_url):
        return page_url

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(page_url)
        response.raise_for_status()

    match = MP4FILE_REGEX.search(response.text)
    if not match:
        raise ValueError(
            f"KMS 페이지에서 MP4 파일 경로를 찾을 수 없습니다: {page_url}"
        )

    mp4file = match.group(1)
    mp4_url = f"{KMS_HOST}/mp4/{mp4file}"
    logger.info("KMS VOD resolved: %s -> %s", page_url, mp4_url)
    return mp4_url
