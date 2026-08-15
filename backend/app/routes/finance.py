from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, distinct

from app.database.session import get_db
from app.models.tutor import Tutor
from app.models.student import Student
from app.models.transaction import Transaction
from app.models.package import Package
from app.services.auth import get_current_tutor
from app.services.balance_service import get_student_balance

router = APIRouter(prefix="/finance", tags=["finance"])


@router.get("/overview")
async def get_finance_overview(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Сводка по финансам: доход за месяц, долги, активные пакеты."""
    # 1. Доход за текущий месяц (транзакции, созданные этим репетитором)
    now = datetime.utcnow()
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    tutor_prefix = f"tutor:{tutor.id}"
    
    income_result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .where(
            Transaction.created_at >= start_of_month,
            Transaction.amount > 0,
            Transaction.created_by == tutor_prefix
        )
    )
    monthly_income = float(income_result.scalar() or 0)

    # 2. Общая задолженность и список должников
    # Берём учеников, у которых есть транзакции от этого репетитора
    students_result = await db.execute(
        select(distinct(Transaction.student_id))
        .where(Transaction.created_by == tutor_prefix)
    )
    student_ids = [row[0] for row in students_result.all()]
    
    debtors = []
    total_debt = 0.0
    
    if student_ids:
        students_data = await db.execute(
            select(Student).where(Student.id.in_(student_ids), Student.is_active == True)
        )
        students = students_data.scalars().all()
        
        for s in students:
            balance = await get_student_balance(db, s.id)
            if balance < 0:
                debtors.append({
                    "student_id": s.id,
                    "student_name": s.name,
                    "balance": float(balance)
                })
                total_debt += abs(float(balance))

    # 3. Активные пакеты (у Package есть tutor_id)
    active_packages_result = await db.execute(
        select(func.count(Package.id))
        .where(
            Package.tutor_id == tutor.id,
            Package.is_active == True,
            Package.remaining_lessons > 0
        )
    )
    active_packages_count = active_packages_result.scalar() or 0

    return {
        "monthly_income": monthly_income,
        "total_debt": total_debt,
        "debtors_count": len(debtors),
        "debtors": debtors,
        "active_packages_count": active_packages_count,
    }


@router.get("/transactions")
async def get_transactions(
    student_id: int | None = Query(None),
    type: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """История транзакций с фильтрами."""
    tutor_prefix = f"tutor:{tutor.id}"
    
    query = (
        select(Transaction, Student.name)
        .join(Student, Student.id == Transaction.student_id)
        .where(Transaction.created_by == tutor_prefix)
    )

    if student_id:
        query = query.where(Transaction.student_id == student_id)
    if type:
        query = query.where(Transaction.type == type)
    if date_from:
        query = query.where(Transaction.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.where(Transaction.created_at <= datetime.fromisoformat(date_to + "T23:59:59"))

    query = query.order_by(Transaction.created_at.desc()).limit(200)

    result = await db.execute(query)
    rows = result.all()

    transactions = []
    for txn, student_name in rows:
        transactions.append({
            "id": txn.id,
            "student_id": txn.student_id,
            "student_name": student_name,
            "amount": float(txn.amount),
            "type": txn.type.value,
            "balance_after": float(txn.balance_after),
            "comment": txn.comment,
            "created_at": txn.created_at.isoformat(),
        })

    return transactions