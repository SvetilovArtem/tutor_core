"""Схемы для уроков."""

from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field


class LessonStudentCreate(BaseModel):
    student_id: int
    package_id: int | None = None


class LessonCreate(BaseModel):
    """Создание одиночного урока (не из расписания)."""
    start_at: datetime
    duration_minutes: int = Field(default=60, ge=15, le=480)
    students: list[LessonStudentCreate] = Field(min_length=1)
    meeting_url: str | None = None
    homework_text: str | None = None
    max_students: int | None = None


class TrialLessonCreate(BaseModel):
    """Пробное занятие для нового ученика."""
    student_name: str = Field(min_length=2, max_length=100)
    parent_name: str | None = None
    parent_phone: str | None = None
    parent_telegram_id: int | None = None
    start_at: datetime
    duration_minutes: int = Field(default=60, ge=15, le=480)
    subject: str | None = None
    notes: str | None = None
    meeting_url: str | None = None


class LessonStudentResponse(BaseModel):
    student_id: int
    student_name: str
    package_id: int | None
    status: str
    homework_done: bool
    price_charged: Decimal | None

    class Config:
        from_attributes = True


class LessonResponse(BaseModel):
    id: int
    tutor_id: int
    schedule_rule_id: int | None
    exception_id: int | None
    start_at: datetime
    end_at: datetime
    status: str
    meeting_url: str | None
    homework_text: str | None
    tutor_notes: str | None
    materials_url: str | None
    recording_url: str | None
    max_students: int | None
    students: list[LessonStudentResponse] = []

    class Config:
        from_attributes = True