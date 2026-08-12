from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # База данных
    DATABASE_URL: str = "sqlite+aiosqlite:///./tutor_core.db"

    # JWT
    SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 часа

    # Приложение
    APP_NAME: str = "Tutor Core API"
    DEBUG: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()