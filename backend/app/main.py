"""FastAPI 애플리케이션 진입점"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(
    title="경기도의회 실시간 자막 서비스",
    description="경기도의회 회의 영상에 실시간/VOD 자막을 제공하는 API",
    version="0.1.0",
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> dict[str, str]:
    """루트 엔드포인트 - 서비스 상태 확인"""
    return {"message": "경기도의회 실시간 자막 서비스 API", "status": "running"}


@app.get("/health")
async def health_check() -> dict[str, str]:
    """헬스체크 엔드포인트"""
    return {"status": "healthy"}
