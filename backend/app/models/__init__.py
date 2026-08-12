"""Экспорт всех моделей для Alembic."""

from app.models.tutor import Tutor, TutorSettings
from app.models.parent import Parent
from app.models.student import Student
from app.models.package import Package
from app.models.schedule import ScheduleRule, ScheduleException
from app.models.lesson import Lesson, LessonStudent
from app.models.transaction import Transaction, TransactionType
from app.models.balance_audit import BalanceAuditLog
from app.models.message_template import MessageTemplate

__all__ = [
    "Tutor", "TutorSettings",
    "Parent",
    "Student",
    "Package",
    "ScheduleRule", "ScheduleException",
    "Lesson", "LessonStudent",
    "Transaction", "TransactionType",
    "BalanceAuditLog",
    "MessageTemplate",
]