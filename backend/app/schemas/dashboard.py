from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel
from typing import List, Optional

class TodayLesson(BaseModel):
    id: int
    start_at: datetime
    end_at: datetime
    subject: Optional[str]
    status: str
    students: List[str]

class Debtor(BaseModel):
    id: int
    name: str
    balance: Decimal
    phone: Optional[str]

class RecentTransaction(BaseModel):
    id: int
    student_name: str
    amount: Decimal
    type: str
    comment: Optional[str]
    created_at: datetime

class DashboardSummary(BaseModel):
    lessons_today: int
    income_this_month: Decimal
    active_students: int
    total_debt: Decimal
    today_lessons_list: List[TodayLesson]
    debtors: List[Debtor]
    recent_transactions: List[RecentTransaction]


class MonthlyIncome(BaseModel):
    month: str  
    amount: float

class IncomeStats(BaseModel):
    data: List[MonthlyIncome]
    total: float

class AttendanceTrendItem(BaseModel):
    date: str  # формат "YYYY-MM-DD"
    present: int
    absent: int
    cancelled: int
class AttendanceStats(BaseModel):
    trend: List[AttendanceTrendItem]
    total_present: int
    total_absent: int
    total_cancelled: int

class DebtsStats(BaseModel):
    total_debt: float
    debtors_count: int
    top_debtors: List[Debtor]

class SubjectIncome(BaseModel):
    subject: str
    amount: float

class WorkloadDay(BaseModel):
    day: str  # "Пн", "Вт", etc.
    lessons: int

class DashboardAnalytics(BaseModel):
    # Для графика дохода
    income_trend: List[MonthlyIncome]
    # Для графика посещаемости
    attendance_trend: List[AttendanceTrendItem]
    # Новые метрики
    income_by_subject: List[SubjectIncome]
    workload_by_day: List[WorkloadDay]