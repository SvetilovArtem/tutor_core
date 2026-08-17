"""Роутер дашборда — сводка для главной страницы."""

from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.models.tutor import Tutor
from app.models.student import Student
from app.models.lesson import Lesson
from app.models.transaction import Transaction
from app.services.auth import get_current_tutor
from app.services.balance_service import get_student_balance
from app.schemas.dashboard import (
    DashboardSummary,
    TodayLesson,
    Debtor,
    RecentTransaction,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Возвращает полную сводку для дашборда."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # ── 1. Уроки сегодня ──────────────────────────────────────
    lessons_result = await db.execute(
        select(Lesson)
        .where(
            Lesson.tutor_id == tutor.id,
            Lesson.start_at >= today_start,
            Lesson.start_at < today_end,
        )
        .order_by(Lesson.start_at.asc())
        .options(selectinload(Lesson.lesson_students))
    )
    todays_lessons = lessons_result.scalars().all()

    today_lessons_list = []
    for lesson in todays_lessons:
        student_names = []
        for ls in lesson.lesson_students:
            student_result = await db.execute(
                select(Student).where(Student.id == ls.student_id)
            )
            student = student_result.scalar_one_or_none()
            if student:
                student_names.append(student.name)
        
        today_lessons_list.append(
            TodayLesson(
                id=lesson.id,
                start_at=lesson.start_at,
                end_at=lesson.end_at,
                subject=getattr(lesson, 'subject', None),
                status=lesson.status,
                students=student_names,
            )
        )

    # ── 2. Доход за месяц ─────────────────────────────────────
    income_result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .where(
            Transaction.student_id.in_(
                select(Student.id).where(Student.parent_id.isnot(None) | Student.parent_id.is_(None))
            ),
            Transaction.amount > 0,
            Transaction.created_at >= month_start,
        )
    )

    students_result = await db.execute(
        select(Student.id).where(Student.parent_id.isnot(None) | Student.parent_id.is_(None))
    )


    income_result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .join(Student, Student.id == Transaction.student_id)
        .where(
            Transaction.amount > 0,
            Transaction.created_at >= month_start,
            Student.id.in_(
                select(Student.id)  
            )
        )
    )
    income = Decimal(str(income_result.scalar() or 0))

    # ── 3. Активные ученики ───────────────────────────────────
    active_result = await db.execute(
        select(func.count(Student.id))
        .where(Student.is_active == True)
    )
    active_students = active_result.scalar() or 0

    # ── 4. Должники и общая задолженность ─────────────────────
    all_students_result = await db.execute(select(Student).where(Student.is_active == True))
    all_students = all_students_result.scalars().all()

    debtors = []
    total_debt = Decimal("0")
    
    for student in all_students:
        balance = await get_student_balance(db, student.id)
        if balance < 0:
            debtors.append(
                Debtor(
                    id=student.id,
                    name=student.name,
                    balance=balance,
                    phone=student.phone,
                )
            )
            total_debt += abs(balance)

  
    debtors.sort(key=lambda d: d.balance)

    # ── 5. Последние транзакции ───────────────────────────────
    transactions_result = await db.execute(
        select(Transaction)
        .order_by(Transaction.created_at.desc())
        .limit(5)
    )
    transactions = transactions_result.scalars().all()

    recent_transactions = []
    for txn in transactions:
        student_result = await db.execute(
            select(Student).where(Student.id == txn.student_id)
        )
        student = student_result.scalar_one_or_none()
        recent_transactions.append(
            RecentTransaction(
                id=txn.id,
                student_name=student.name if student else "Неизвестный",
                amount=txn.amount,
                type=txn.type,
                comment=txn.comment,
                created_at=txn.created_at,
            )
        )

    return DashboardSummary(
        lessons_today=len(today_lessons_list),
        income_this_month=income,
        active_students=active_students,
        total_debt=total_debt,
        today_lessons_list=today_lessons_list,
        debtors=debtors,
        recent_transactions=recent_transactions,
    )