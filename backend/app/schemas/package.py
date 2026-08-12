"""Схемы для пакетов занятий."""

from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field


class PackageCreate(BaseModel):
    student_id: int
    name: str = Field(min_length=2, max_length=200)
    total_lessons: int = Field(gt=0)
    price_per_lesson: Decimal = Field(gt=0)
    duration_minutes: int = Field(default=60, ge=15, le=480)
    expires_at: datetime | None = None
    payment_status: str = "paid"


class PackageUpdate(BaseModel):
    name: str | None = None
    remaining_lessons: int | None = None
    is_active: bool | None = None
    payment_status: str | None = None


class PackageResponse(BaseModel):
    id: int
    student_id: int
    name: str
    total_lessons: int
    remaining_lessons: int
    price_per_lesson: Decimal
    duration_minutes: int
    purchased_at: datetime
    expires_at: datetime | None
    is_active: bool
    payment_status: str

    class Config:
        from_attributes = True