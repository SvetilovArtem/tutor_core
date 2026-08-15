from datetime import datetime
from pydantic import BaseModel


class LessonStudentCreate(BaseModel):
    student_id: int
    package_id: int | None = None


class LessonCreate(BaseModel):
    start_at: datetime
    duration_minutes: int
    students: list[LessonStudentCreate]
    meeting_url: str | None = None
    homework_text: str | None = None
    max_students: int | None = None


class TrialLessonCreate(BaseModel):
    student_name: str
    parent_name: str | None = None
    parent_phone: str | None = None
    parent_telegram_id: int | None = None
    subject: str | None = None
    start_at: datetime
    duration_minutes: int
    meeting_url: str | None = None
    notes: str | None = None


class LessonStudentResponse(BaseModel):
    student_id: int
    student_name: str
    status: str
    is_paid: bool = False

    class Config:
        from_attributes = True


class HomeworkAttachmentResponse(BaseModel):
    id: int
    filename: str
    original_name: str
    mime_type: str
    size_bytes: int
    url: str
    is_image: bool
    uploaded_at: datetime

    class Config:
        from_attributes = True


class LessonResponse(BaseModel):
    id: int
    tutor_id: int
    schedule_rule_id: int | None = None
    exception_id: int | None = None
    start_at: datetime
    end_at: datetime
    status: str
    meeting_url: str | None = None
    homework_text: str | None = None
    tutor_notes: str | None = None
    materials_url: str | None = None
    recording_url: str | None = None
    max_students: int | None = None
    created_at: datetime
    students: list[LessonStudentResponse] = []
    homework_attachments: list[HomeworkAttachmentResponse] = []

    class Config:
        from_attributes = True


class LessonStatusUpdate(BaseModel):
    status: str