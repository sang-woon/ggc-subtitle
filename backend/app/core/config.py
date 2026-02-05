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

    # OpenAI
    openai_api_key: str = ""

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    # 서버
    debug: bool = True


settings = Settings()
