from datetime import datetime
from pydantic import BaseModel, Field


class CancellationRequestCreate(BaseModel):
    """Запрос от ученика на отмену урока."""
    lesson_id: int
    student_id: int
    reason: str | None = Field(None, max_length=500)


class CancellationRequestResponse(BaseModel):
    id: int
    lesson_id: int
    student_id: int
    student_name: str | None = None
    lesson_start_at: datetime | None = None
    reason: str | None
    status: str
    requested_at: datetime
    resolved_at: datetime | None
    tutor_comment: str | None

    class Config:
        from_attributes = True


class CancellationResolve(BaseModel):
    """Решение репетитора по запросу."""
    approve: bool
    comment: str | None = Field(None, max_length=500)