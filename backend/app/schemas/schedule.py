from datetime import date, time
from pydantic import BaseModel, Field, field_serializer


class StudentBrief(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class ScheduleRuleCreate(BaseModel):
    student_ids: list[int] = Field(default_factory=list, description="Список ID учеников. Пустой список = групповое")
    group_name: str | None = None
    weekday: int = Field(ge=0, le=6)
    start_time: str  # Фронтенд отправляет строку "HH:MM" или "HH:MM:SS"
    duration_minutes: int = Field(ge=15, le=480)
    effective_from: date
    effective_to: date | None = None


class ScheduleRuleUpdate(BaseModel):
    student_ids: list[int] | None = None
    group_name: str | None = None
    weekday: int | None = Field(None, ge=0, le=6)
    start_time: str | None = None
    duration_minutes: int | None = Field(None, ge=15, le=480)
    effective_from: date | None = None
    effective_to: date | None = None
    is_active: bool | None = None


class ScheduleRuleResponse(BaseModel):
    id: int
    tutor_id: int
    group_name: str | None
    weekday: int
    start_time: time  # В БД это time, мы его сериализуем в строку ниже
    duration_minutes: int
    effective_from: date
    effective_to: date | None
    is_active: bool
    students: list[StudentBrief] = []

    @field_serializer('start_time')
    def serialize_start_time(self, value: time) -> str:
        """Преобразует datetime.time в строку формата 'HH:MM' для фронтенда."""
        return value.strftime("%H:%M")

    class Config:
        from_attributes = True


class ScheduleExceptionCreate(BaseModel):
    rule_id: int
    type: str  # SKIP | ADD
    date: date
    start_time: str | None = None
    duration_minutes: int | None = None


class ScheduleExceptionResponse(BaseModel):
    id: int
    rule_id: int
    type: str
    date: date
    start_time: str | None
    duration_minutes: int | None
    created_by: str

    class Config:
        from_attributes = True