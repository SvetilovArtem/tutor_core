"""Роутер дашборда — сводка и аналитика."""

from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.models.tutor import Tutor
from app.models.student import Student
from app.models.lesson import Lesson, LessonStudent
from app.models.transaction import Transaction
from app.services.auth import get_current_tutor
from app.services.balance_service import get_student_balance
from app.schemas.dashboard import (
    DashboardAnalytics, DashboardSummary, SubjectIncome, TodayLesson, Debtor, RecentTransaction,
    IncomeStats, MonthlyIncome, AttendanceStats, DebtsStats, WorkloadDay
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # 1. Уроки сегодня (безопасная загрузка, как в lessons.py)
    lessons_result = await db.execute(
        select(Lesson)
        .where(Lesson.tutor_id == tutor.id, Lesson.start_at >= today_start, Lesson.start_at < today_end)
        .order_by(Lesson.start_at.asc())
        .options(selectinload(Lesson.lesson_students))
    )
    todays_lessons = lessons_result.scalars().all()

    today_lessons_list = []
    for lesson in todays_lessons:
        student_ids = [ls.student_id for ls in lesson.lesson_students]
        if student_ids:
            students_res = await db.execute(select(Student).where(Student.id.in_(student_ids)))
            student_names = [s.name for s in students_res.scalars().all()]
        else:
            student_names = []
            
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

    # 2. Доход за месяц
    income_result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .join(Student, Student.id == Transaction.student_id)
        .where(
            Transaction.amount > 0,
            Transaction.created_at >= month_start
        )
    )
    income = Decimal(str(income_result.scalar() or 0))

    # 3. Активные ученики
    active_result = await db.execute(
        select(func.count(Student.id)).where(Student.is_active == True)
    )
    active_students = active_result.scalar() or 0

    # 4. Должники
    all_students_result = await db.execute(
        select(Student).where(Student.is_active == True)
    )
    all_students = all_students_result.scalars().all()

    debtors = []
    total_debt = Decimal("0")
    
    for student in all_students:
        balance = await get_student_balance(db, student.id)
        if balance < 0:
            debtors.append(Debtor(id=student.id, name=student.name, balance=balance, phone=student.phone))
            total_debt += abs(balance)

    debtors.sort(key=lambda d: d.balance)

    # 5. Последние 5 транзакций
    transactions_result = await db.execute(
        select(Transaction, Student.name)
        .join(Student, Student.id == Transaction.student_id)
        .order_by(Transaction.created_at.desc())
        .limit(5)
    )
    
    recent_transactions = [
        RecentTransaction(
            id=txn.id,
            student_name=student_name,
            amount=txn.amount,
            type=txn.type,
            comment=txn.comment,
            created_at=txn.created_at,
        )
        for txn, student_name in transactions_result.all()
    ]

    return DashboardSummary(
        lessons_today=len(today_lessons_list),
        income_this_month=income,
        active_students=active_students,
        total_debt=total_debt,
        today_lessons_list=today_lessons_list,
        debtors=debtors,
        recent_transactions=recent_transactions,
    )


@router.get("/income", response_model=IncomeStats)
async def get_income_stats(
    period: str = Query("month", description="period: day|week|month|year"),
    date_from: str = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: str = Query(None, description="End date (YYYY-MM-DD)"),
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Доход по выбранному периоду с date-range picker."""
    
    # Определяем максимальный диапазон для каждого периода
    max_days = {
            "day": 31,
            "week": 120,      # ~17 недель
            "month": 400,     # ~13 месяцев
            "year": 4000,     # ~11 лет
        }
        # Парсим даты
    if date_from and date_to:
        from_date = datetime.strptime(date_from, "%Y-%m-%d")
        to_date = datetime.strptime(date_to, "%Y-%m-%d")
        

        if (to_date - from_date).days > max_days.get(period, 30):
            raise HTTPException(
                status_code=400,
                detail=f"Для периода '{period}' максимальный диапазон: {max_days[period]} дней"
            )
    else:
        
        to_date = datetime.utcnow()
        from_date = to_date - timedelta(days=30)
    
    
    if period == "day":
        date_format = '%Y-%m-%d'
    elif period == "week":
        date_format = '%Y-%W'  
    elif period == "year":
        date_format = '%Y'
    else:  
        date_format = '%Y-%m'
    
    query = (
        select(
            func.strftime(date_format, Transaction.created_at).label('period'),
            func.coalesce(func.sum(Transaction.amount), 0).label('amount')
        )
        .join(Student, Student.id == Transaction.student_id)
        .where(
            Transaction.amount > 0,
            Transaction.created_at >= from_date,
            Transaction.created_at <= to_date
        )
        .group_by(func.strftime(date_format, Transaction.created_at))
        .order_by(func.strftime(date_format, Transaction.created_at).asc())
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    data = [MonthlyIncome(month=row.period, amount=float(row.amount)) for row in rows]
    total = sum(row.amount for row in data)
    
    return IncomeStats(data=data, total=total)

@router.get("/attendance", response_model=AttendanceStats)
async def get_attendance_stats(
    days: int = 30,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    # Группируем по дате и статусу
    query = (
        select(
            func.strftime('%Y-%m-%d', Lesson.start_at).label('date'),
            LessonStudent.status,
            func.count(LessonStudent.student_id)
        )
        .join(Lesson, Lesson.id == LessonStudent.lesson_id)
        .where(
            Lesson.tutor_id == tutor.id,
            Lesson.start_at >= cutoff_date,
            Lesson.status == "COMPLETED"
        )
        .group_by(func.strftime('%Y-%m-%d', Lesson.start_at), LessonStudent.status)
        .order_by(func.strftime('%Y-%m-%d', Lesson.start_at).asc())
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    trend_dict = {}
    total_present = 0
    total_absent = 0
    total_cancelled = 0
    
    for row in rows:
        date_str = row[0]
        status = row[1] if row[1] else "UNKNOWN"
        count = int(row[2])
        
        if date_str not in trend_dict:
            trend_dict[date_str] = {"date": date_str, "present": 0, "absent": 0, "cancelled": 0}
        
        if status == "PRESENT":
            trend_dict[date_str]["present"] += count
            total_present += count
        elif status == "ABSENT":
            trend_dict[date_str]["absent"] += count
            total_absent += count
        elif status == "CANCELLED":
            trend_dict[date_str]["cancelled"] += count
            total_cancelled += count
            
    trend = sorted(trend_dict.values(), key=lambda x: x["date"])
    
    return AttendanceStats(
        trend=trend,
        total_present=total_present,
        total_absent=total_absent,
        total_cancelled=total_cancelled
    )

@router.get("/debts", response_model=DebtsStats)
async def get_debts_stats(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    students_result = await db.execute(
        select(Student).where(Student.is_active == True)
    )
    students = students_result.scalars().all()
    
    debtors = []
    total_debt = Decimal("0")
    
    for student in students:
        balance = await get_student_balance(db, student.id)
        if balance < 0:
            debtors.append(Debtor(id=student.id, name=student.name, balance=balance, phone=student.phone))
            total_debt += abs(balance)
            
    debtors.sort(key=lambda d: d.balance)
    
    return DebtsStats(
        total_debt=float(total_debt),
        debtors_count=len(debtors),
        top_debtors=debtors[:10]
    )

@router.get("/analytics", response_model=DashboardAnalytics)
async def get_dashboard_analytics(
    period: str = Query("month", description="period: week|month|all"),
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    cutoff_date = None
    if period == "week":
        cutoff_date = datetime.utcnow() - timedelta(days=7)
    elif period == "month":
        cutoff_date = datetime.utcnow() - timedelta(days=30)
    # Если "all" — cutoff_date остаётся None (берём всё)

    # 1. Доход по месяцам (последние 6 месяцев фиксировано)
    income_cutoff = datetime.utcnow() - timedelta(days=180)
    income_query = (
        select(
            func.strftime('%Y-%m', Transaction.created_at).label('month'),
            func.coalesce(func.sum(Transaction.amount), 0).label('amount')
        )
        .join(Student, Student.id == Transaction.student_id)
        .where(Transaction.amount > 0, Transaction.created_at >= income_cutoff)
        .group_by(func.strftime('%Y-%m', Transaction.created_at))
        .order_by(func.strftime('%Y-%m', Transaction.created_at).asc())
    )
    income_rows = (await db.execute(income_query)).all()
    income_trend = [MonthlyIncome(month=row.month, amount=float(row.amount)) for row in income_rows]

    # 2. Посещаемость (последние 30 дней фиксировано)
    att_cutoff = datetime.utcnow() - timedelta(days=30)
    att_query = (
        select(
            func.strftime('%Y-%m-%d', Lesson.start_at).label('date'),
            LessonStudent.status,
            func.count(LessonStudent.student_id)
        )
        .join(Lesson, Lesson.id == LessonStudent.lesson_id)
        .where(Lesson.tutor_id == tutor.id, Lesson.start_at >= att_cutoff, Lesson.status == "COMPLETED")
        .group_by(func.strftime('%Y-%m-%d', Lesson.start_at), LessonStudent.status)
        .order_by(func.strftime('%Y-%m-%d', Lesson.start_at).asc())
    )
    att_rows = (await db.execute(att_query)).all()
    
    att_dict = {}
    for row in att_rows:
        date_str = row[0]
        status = row[1] if row[1] else "UNKNOWN"
        count = int(row[2])
        if date_str not in att_dict:
            att_dict[date_str] = {"date": date_str, "present": 0, "absent": 0, "cancelled": 0}
        
        if status == "PRESENT": att_dict[date_str]["present"] += count
        elif status == "ABSENT": att_dict[date_str]["absent"] += count
        elif status == "CANCELLED": att_dict[date_str]["cancelled"] += count
        
    attendance_trend = sorted(att_dict.values(), key=lambda x: x["date"])

    # 3. Доход по предметам (за выбранный период)
    subject_query = (
        select(Lesson.subject, func.coalesce(func.sum(LessonStudent.price_charged), 0))
        .join(LessonStudent, Lesson.id == LessonStudent.lesson_id)
        .where(Lesson.tutor_id == tutor.id, Lesson.status == "COMPLETED", Lesson.subject.isnot(None))
    )
    if cutoff_date:
        subject_query = subject_query.where(Lesson.start_at >= cutoff_date)
    subject_query = subject_query.group_by(Lesson.subject).order_by(func.sum(LessonStudent.price_charged).desc())
    
    subject_rows = (await db.execute(subject_query)).all()
    income_by_subject = [SubjectIncome(subject=row[0], amount=float(row[1])) for row in subject_rows]

    # 4. Загрузка по дням недели (за выбранный период)
    day_names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
    workload_query = (
        select(func.strftime('%w', Lesson.start_at), func.count(Lesson.id))
        .where(Lesson.tutor_id == tutor.id, Lesson.status == "COMPLETED")
    )
    if cutoff_date:
        workload_query = workload_query.where(Lesson.start_at >= cutoff_date)
    workload_query = workload_query.group_by(func.strftime('%w', Lesson.start_at))
    
    workload_rows = (await db.execute(workload_query)).all()
    
    workload_dict = {str(i): 0 for i in range(7)}
    for row in workload_rows:
        workload_dict[str(row[0])] = int(row[1])
        
    ordered_days = ["1", "2", "3", "4", "5", "6", "0"]
    workload_by_day = [WorkloadDay(day=day_names[int(d)], lessons=workload_dict[d]) for d in ordered_days]

    return DashboardAnalytics(
        income_trend=income_trend,
        attendance_trend=attendance_trend,
        income_by_subject=income_by_subject,
        workload_by_day=workload_by_day
    )