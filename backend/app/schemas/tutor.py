"""Схемы для регистрации и профиля репетитора."""

from pydantic import BaseModel, Field


class TutorRegisterRequest(BaseModel):
    telegram_id: int = Field(description="Telegram ID репетитора")
    name: str = Field(min_length=2, max_length=100)
    phone: str | None = None
    subjects: list[str] = Field(default_factory=list)
    timezone: str = "Europe/Minsk"


class TutorResponse(BaseModel):
    id: int
    name: str
    telegram_id: int | None = None  
    email: str | None = None         
    phone: str | None
    subjects: list[str]
    timezone: str
    is_active: bool

    class Config:
        from_attributes = True
    id: int
    name: str
    telegram_id: int
    phone: str | None
    subjects: list[str]
    timezone: str
    is_active: bool

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tutor: TutorResponse


class TutorRegisterRequest(BaseModel):
    telegram_id: int | None = None
    email: str | None = None
    password: str | None = None
    name: str = Field(min_length=2, max_length=100)
    phone: str | None = None
    subjects: list[str] = Field(default_factory=list)
    timezone: str = "Europe/Minsk"


class PasswordLoginRequest(BaseModel):
    email: str
    password: str