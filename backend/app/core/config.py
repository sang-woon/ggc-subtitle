"""애플리케이션 설정"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """환경변수 기반 설정"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # 데이터베이스
    database_url: str = "postgresql://localhost:5432/ggc_subtitle"

    # Supabase
    supabase_url: str = ""
    supabase_key: str = ""

    # OpenAI Whisper
    openai_api_key: str = ""

    # Deepgram STT (Nova-3)
    deepgram_api_key: str = ""

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:3004",
        "http://localhost:3005",
    ]
    cors_origin_regex: str = r"https://.*\.vercel\.app"

    # STT 자동 시작 (방송중 채널 감지 시 자동 STT)
    stt_auto_start: bool = True

    # 서버
    debug: bool = False


settings = Settings()
