"""FastAPI 애플리케이션 진입점"""

import logging
from contextlib import asynccontextmanager

# 애플리케이션 로거 설정 (uvicorn 기본 로깅에 app.* 포함)
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.channels import router as channels_router
from app.api.meetings import router as meetings_router
from app.api.search import router as search_router
from app.api.subtitles import router as subtitles_router
from app.api.websocket import router as websocket_router
from app.core.config import settings
from app.services.auto_stt import get_auto_stt_manager

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 수명주기 관리 (startup/shutdown)."""
    # --- Startup ---
    auto_stt = get_auto_stt_manager()
    await auto_stt.start()
    logger.info("Application startup complete (auto_stt enabled=%s)", auto_stt.enabled)

    yield

    # --- Shutdown ---
    await auto_stt.stop()
    logger.info("Application shutdown complete")


app = FastAPI(
    title="경기도의회 실시간 자막 서비스",
    description="경기도의회 회의 영상에 실시간/VOD 자막을 제공하는 API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 설정 (라우터 등록 전에 추가)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 등록
app.include_router(channels_router)
app.include_router(meetings_router)
app.include_router(search_router)
app.include_router(subtitles_router)
app.include_router(websocket_router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """미처리 예외를 잡아 CORS 헤더가 포함된 JSON 응답을 반환합니다."""
    logger.error("Unhandled error: %s %s - %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.get("/")
async def root() -> dict[str, str]:
    """루트 엔드포인트 - 서비스 상태 확인"""
    return {"message": "경기도의회 실시간 자막 서비스 API", "status": "running"}


@app.get("/health")
async def health_check() -> dict[str, str]:
    """헬스체크 엔드포인트"""
    return {"status": "healthy"}
