"""Схемы для уроков."""

from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field


class LessonStudentCreate(BaseModel):
    student_id: int
    package_id: int | None = None


class HomeworkAttachmentResponse(BaseModel):
    id: int
    filename: str
    original_name: str
    mime_type: str
    size_bytes: int
    url: str
    is_image: bool
    uploaded_at: str | None = None

    class Config:
        from_attributes = True


class LessonStudentResponse(BaseModel):
    student_id: int
    student_name: str
    status: str
    package_id: int | None = None
    is_paid: bool = False
    price_charged: float | None = None

    class Config:
        from_attributes = True


class LessonCreate(BaseModel):
    start_at: datetime
    duration_minutes: int = Field(default=60, ge=15, le=240)
    subject: str | None = Field(None, max_length=100, description="Предмет урока")
    students: list[LessonStudentCreate]
    meeting_url: str | None = None
    homework_text: str | None = None
    max_students: int | None = None


class LessonResponse(BaseModel):
    id: int
    tutor_id: int
    schedule_rule_id: int | None = None
    exception_id: int | None = None
    start_at: datetime
    end_at: datetime
    status: str
    subject: str | None = None
    meeting_url: str | None = None
    homework_text: str | None = None
    tutor_notes: str | None = None
    materials_url: str | None = None
    recording_url: str | None = None
    max_students: int | None = None
    created_at: datetime
    students: list[LessonStudentResponse]
    homework_attachments: list[HomeworkAttachmentResponse] = []

    class Config:
        from_attributes = True


class TrialLessonCreate(BaseModel):
    student_name: str
    parent_name: str | None = None
    parent_phone: str | None = None
    parent_telegram_id: int | None = None
    subject: str | None = Field(None, max_length=100)
    start_at: datetime
    duration_minutes: int = Field(default=60, ge=15, le=240)
    meeting_url: str | None = None
    notes: str | None = None