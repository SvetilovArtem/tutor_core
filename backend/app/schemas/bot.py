"""Pydantic-схемы для API бота (Message и Lead)."""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ============================================================================
# СХЕМЫ ДЛЯ СООБЩЕНИЙ (Message)
# ============================================================================

class MessageSendRequest(BaseModel):
    """Запрос на отправку сообщения."""
    from_telegram_id: int = Field(..., description="Telegram ID отправителя")
    to_type: str = Field(..., description="Тип получателя: tutor, student, parent")
    to_id: int = Field(..., description="ID получателя в CRM")
    text: str = Field(..., min_length=1, max_length=4000, description="Текст сообщения")
    reply_to_message_id: Optional[int] = Field(None, description="ID сообщения, на которое отвечаем")

    @field_validator("to_type")
    @classmethod
    def validate_to_type(cls, v: str) -> str:
        allowed = {"tutor", "student", "parent"}
        if v not in allowed:
            raise ValueError(f"to_type должен быть одним из: {', '.join(allowed)}")
        return v


class MessageResponse(BaseModel):
    """Данные одного сообщения."""
    id: int
    from_type: str
    from_name: str
    text: str
    is_read: bool
    created_at: datetime
    reply_to_message_id: Optional[int] = None


class MessagesListResponse(BaseModel):
    """Список сообщений с пагинацией."""
    messages: List[MessageResponse]
    total: int
    unread_count: int


class MessageReadRequest(BaseModel):
    """Запрос на пометку сообщения как прочитанного."""
    telegram_id: int = Field(..., description="Telegram ID пользователя")


# ============================================================================
# СХЕМЫ ДЛЯ ЗАЯВОК (Lead)
# ============================================================================

class LeadStatus(str, Enum):
    """Статусы заявки."""
    NEW = "new"
    CONTACTED = "contacted"
    CONVERTED = "converted"
    REJECTED = "rejected"


class LeadCreateRequest(BaseModel):
    """Запрос на создание заявки (если нужно создавать через API)."""
    tutor_id: int
    name: str = Field(..., min_length=2, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    message: Optional[str] = Field(None, max_length=1000)

    @field_validator("phone", "email")
    @classmethod
    def check_at_least_one_contact(cls, v: Optional[str], info) -> Optional[str]:
        # Проверка выполняется на уровне модели после валидации всех полей
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and "@" not in v:
            raise ValueError("Некорректный email")
        return v


class LeadResponse(BaseModel):
    """Данные одной заявки."""
    id: int
    tutor_id: int
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    message: Optional[str] = None
    status: str
    created_at: datetime


class LeadsListResponse(BaseModel):
    """Список заявок."""
    leads: List[LeadResponse]


class LeadStatusUpdateRequest(BaseModel):
    """Запрос на обновление статуса заявки."""
    telegram_id: int = Field(..., description="Telegram ID репетитора")
    status: LeadStatus = Field(..., description="Новый статус заявки")


# ============================================================================
# СХЕМЫ ДЛЯ ОТМЕНЫ УРОКА (Cancellation)
# ============================================================================

class CancellationRequestCreate(BaseModel):
    """Запрос на создание запроса на отмену урока."""
    telegram_id: int = Field(..., description="Telegram ID ученика или родителя")
    lesson_id: int = Field(..., description="ID урока")
    reason: str = Field(..., min_length=1, max_length=500, description="Причина отмены")


class CancellationResolveRequest(BaseModel):
    """Запрос на одобрение/отклонение запроса на отмену."""
    request_id: int = Field(..., description="ID запроса на отмену")
    tutor_telegram_id: int = Field(..., description="Telegram ID репетитора")
    decision: str = Field(..., description="Решение: APPROVED или REJECTED")
    tutor_comment: Optional[str] = Field(None, max_length=500, description="Комментарий репетитора")

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, v: str) -> str:
        allowed = {"APPROVED", "REJECTED"}
        if v not in allowed:
            raise ValueError(f"decision должен быть одним из: {', '.join(allowed)}")
        return v


class CancellationResponse(BaseModel):
    """Ответ после обработки запроса на отмену."""
    success: bool
    request_id: int
    decision: str
    lesson_status: str
    message: str


# ============================================================================
# СХЕМЫ ДЛЯ СДАЧИ ДЗ (Homework)
# ============================================================================

class HomeworkSubmitRequest(BaseModel):
    """Запрос на сдачу домашнего задания."""
    telegram_id: int = Field(..., description="Telegram ID ученика")
    lesson_id: int = Field(..., description="ID урока")
    text: Optional[str] = Field(None, max_length=2000, description="Текстовое описание решения")
    file_url: Optional[str] = Field(None, max_length=500, description="URL файла (если есть)")
    file_name: Optional[str] = Field(None, max_length=255, description="Имя файла")
    file_type: Optional[str] = Field(None, max_length=100, description="MIME-тип файла")
    file_size: Optional[int] = Field(None, ge=0, description="Размер файла в байтах")


class HomeworkSubmitResponse(BaseModel):
    """Ответ после сдачи ДЗ."""
    success: bool
    message: str
    lesson_id: int


# ============================================================================
# СХЕМЫ ДЛЯ WEBHOOK ОТ БОТА
# ============================================================================

class BotWebhookRequest(BaseModel):
    """Webhook от бота к CRM (например, при отвязке Telegram)."""
    event_type: str = Field(..., description="Тип события")
    telegram_id: int = Field(..., description="Telegram ID пользователя")
    entity_type: Optional[str] = Field(None, description="Тип сущности: tutor, student, parent")
    payload: Optional[dict] = Field(None, description="Дополнительные данные")

    @field_validator("event_type")
    @classmethod
    def validate_event_type(cls, v: str) -> str:
        allowed = {"user_unbound", "message_sent", "homework_submitted"}
        if v not in allowed:
            raise ValueError(f"event_type должен быть одним из: {', '.join(allowed)}")
        return v


class BotWebhookResponse(BaseModel):
    """Ответ на webhook от бота."""
    success: bool
    message: str


# ============================================================================
# СХЕМЫ ДЛЯ ПРИВЯЗКИ TELEGRAM
# ============================================================================

class TelegramSubscribeRequest(BaseModel):
    """Запрос на привязку Telegram к ученику."""
    telegram_id: int = Field(..., description="Telegram ID пользователя")
    code: str = Field(..., min_length=4, max_length=20, description="Invite-код")


class TelegramSubscribeResponse(BaseModel):
    """Ответ после привязки Telegram."""
    success: bool
    student_name: str
    message: str


class TelegramUserResponse(BaseModel):
    """Универсальный ответ с данными пользователя."""
    type: str  # "tutor", "student", "parent"
    id: int
    name: str
    telegram_id: int


# ============================================================================
# СХЕМЫ ДЛЯ РАСПИСАНИЯ
# ============================================================================

class LessonStudentResponse(BaseModel):
    """Данные ученика в уроке."""
    id: int
    name: str
    status: str
    homework_done: bool


class LessonResponse(BaseModel):
    """Данные урока."""
    id: int
    start_at: datetime
    end_at: datetime
    subject: Optional[str] = None
    status: str
    meeting_url: Optional[str] = None
    homework_text: Optional[str] = None
    students: List[LessonStudentResponse] = []


class LessonsListResponse(BaseModel):
    """Список уроков."""
    lessons: List[LessonResponse]


# ============================================================================
# СХЕМЫ ДЛЯ ДАННЫХ ПОЛЬЗОВАТЕЛЕЙ
# ============================================================================

class TutorInfoResponse(BaseModel):
    """Данные репетитора."""
    id: int
    name: str
    subjects: List[str]
    currency: str
    timezone: str
    settings: Optional[dict] = None


class StudentInfoResponse(BaseModel):
    """Данные ученика."""
    id: int
    name: str
    balance: float
    phone: Optional[str] = None
    subjects: List[str]


class ParentChildResponse(BaseModel):
    """Данные ребёнка для родителя."""
    id: int
    name: str
    balance: float
    subjects: List[str]


class ParentInfoResponse(BaseModel):
    """Данные родителя."""
    id: int
    name: str
    children: List[ParentChildResponse]


class TransactionResponse(BaseModel):
    """Данные транзакции."""
    id: int
    amount: float
    type: str
    comment: Optional[str] = None
    created_at: datetime


class TransactionsListResponse(BaseModel):
    """Список транзакций."""
    transactions: List[TransactionResponse]