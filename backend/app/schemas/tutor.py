"""Схемы для регистрации и профиля репетитора."""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
from datetime import datetime
import re


# ── Регистрация и авторизация ─────────────────────────────────────

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


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tutor: "TutorResponse"


# ── Настройки репетитора ──────────────────────────────────────────

class TutorSettingsUpdate(BaseModel):
    working_hours: Optional[Dict[str, Any]] = None


class TutorSettingsResponse(BaseModel):
    working_hours: dict = {}

    class Config:
        from_attributes = True


# ── Профиль репетитора ────────────────────────────────────────────

class TutorResponse(BaseModel):
    id: int
    name: str
    telegram_id: int | None = None
    email: str | None = None
    phone: str | None = None
    subjects: list[str]
    timezone: str
    currency: str = "BYN"
    is_active: bool
    created_at: datetime | None = None

    # Лендинг
    slug: str | None = None
    landing_headline: str | None = None
    landing_bio: str | None = None
    photo_url: str | None = None
    landing_theme: str = "classic"
    is_landing_published: bool = False

    # Контент и счётчики
    experience_years: int = 0
    students_count: int = 0
    success_rate: int = 0
    services: list = []
    testimonials: list = []
    faq: list = []

    # Настройки
    settings: TutorSettingsResponse | None = None

    class Config:
        from_attributes = True


class TutorProfileUpdate(BaseModel):
    # Базовые данные
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    subjects: Optional[List[str]] = None
    timezone: Optional[str] = Field(None, max_length=50)
    currency: Optional[str] = Field(None, pattern="^[A-Z]{3}$")

    # Лендинг
    slug: Optional[str] = Field(None, min_length=3, max_length=30)
    landing_headline: Optional[str] = Field(None, max_length=200)
    landing_bio: Optional[str] = None
    photo_url: Optional[str] = Field(None, max_length=500)
    landing_theme: Optional[str] = None
    is_landing_published: Optional[bool] = None

    # Контент и счётчики
    services: Optional[List[Dict[str, Any]]] = None
    testimonials: Optional[List[Dict[str, Any]]] = None
    faq: Optional[List[Dict[str, Any]]] = None

    # Настройки
    settings: Optional[TutorSettingsUpdate] = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str | None) -> str | None:
        if v is not None and not re.match(r"^[a-z0-9-]+$", v):
            raise ValueError("Slug может содержать только строчные латинские буквы, цифры и дефисы")
        return v

    @field_validator("landing_theme")
    @classmethod
    def validate_theme(cls, v: str | None) -> str | None:
        allowed = {"classic", "modern", "minimal", "friendly", "premium"}
        if v is not None and v not in allowed:
            raise ValueError(f"Тема должна быть одной из: {', '.join(sorted(allowed))}")
        return v


# ── Публичный профиль ─────────────────────────────────────────────

class PublicTutorProfile(BaseModel):
    name: str
    subjects: list[str]
    slug: str
    landing_headline: str | None = None
    landing_bio: str | None = None
    photo_url: str | None = None
    landing_theme: str = "classic"
    currency: str = "BYN"

    class Config:
        from_attributes = True


# Разрешаем циклическую ссылку
TutorResponse.model_rebuild()
TokenResponse.model_rebuild()