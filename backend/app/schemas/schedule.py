"""Схемы для расписания и исключений."""

from datetime import date, time
from pydantic import BaseModel, Field


class ScheduleRuleCreate(BaseModel):
    student_id: int | None = None
    group_name: str | None = None
    weekday: int = Field(ge=0, le=6, description="0=Пн ... 6=Вс")
    start_time: time
    duration_minutes: int = Field(default=60, ge=15, le=480)
    effective_from: date
    effective_to: date | None = None


class ScheduleRuleResponse(BaseModel):
    id: int
    student_id: int | None
    group_name: str | None
    weekday: int
    start_time: time
    duration_minutes: int
    is_active: bool
    effective_from: date
    effective_to: date | None

    class Config:
        from_attributes = True


class ScheduleExceptionCreate(BaseModel):
    rule_id: int
    date: date
    type: str = Field(pattern="^(SKIP|ADD)$", description="SKIP или ADD")
    start_time: time | None = None
    duration_minutes: int | None = None
    note: str | None = None


class ScheduleExceptionResponse(BaseModel):
    id: int
    rule_id: int
    date: date
    type: str
    start_time: time | None
    duration_minutes: int | None
    note: str | None
    created_by: str

    class Config:
        from_attributes = True