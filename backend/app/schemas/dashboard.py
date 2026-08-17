"""Схемы для дашборда."""

from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class TodayLesson(BaseModel):
    id: int
    start_at: datetime
    end_at: datetime
    subject: str | None
    status: str
    students: list[str]  


class Debtor(BaseModel):
    id: int
    name: str
    balance: Decimal
    phone: str | None = None


class RecentTransaction(BaseModel):
    id: int
    student_name: str
    amount: Decimal
    type: str
    comment: str | None
    created_at: datetime


class DashboardSummary(BaseModel):
    lessons_today: int
    income_this_month: Decimal
    active_students: int
    total_debt: Decimal
    today_lessons_list: list[TodayLesson]
    debtors: list[Debtor]
    recent_transactions: list[RecentTransaction]