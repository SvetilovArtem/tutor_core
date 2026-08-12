"""Завершение урока и списание баланса."""

from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.lesson import Lesson, LessonStudent
from app.models.transaction import Transaction, TransactionType
from app.models.balance_audit import BalanceAuditLog
from app.models.package import Package
from app.models.tutor import Tutor


async def get_student_balance(db: AsyncSession, student_id: int) -> Decimal:
    """Текущий баланс ученика."""
    result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .where(Transaction.student_id == student_id)
    )
    return result.scalar() or Decimal("0")


async def complete_lesson(
    db: AsyncSession,
    lesson_id: int,
    tutor_id: int,
    attendance: dict[int, str],
    default_price: Decimal = Decimal("25"),
) -> dict:
    """
    Завершить урок.
    attendance = {student_id: "PRESENT"|"ABSENT"|"EXCUSED"|"CANCELLED"}
    """
    result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.tutor_id == tutor_id)
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise ValueError("Урок не найден")

    if lesson.status == "COMPLETED":
        raise ValueError("Урок уже завершён")

    lesson.status = "COMPLETED"
    processed = 0

    for ls in lesson.lesson_students:
        status = attendance.get(ls.student_id, "ABSENT")
        ls.status = status

        if status in ("PRESENT", "ABSENT"):
            # Определяем цену
            price = default_price
            pkg = None
            if ls.package_id:
                pkg_result = await db.execute(
                    select(Package).where(Package.id == ls.package_id)
                )
                pkg = pkg_result.scalar_one_or_none()
                if pkg and pkg.remaining_lessons > 0:
                    price = pkg.price_per_lesson
                    pkg.remaining_lessons -= 1

            ls.price_charged = price

            # Текущий баланс
            current_balance = await get_student_balance(db, ls.student_id)
            new_balance = current_balance - price

            # Транзакция списания
            txn = Transaction(
                student_id=ls.student_id,
                package_id=ls.package_id,
                lesson_id=lesson.id,
                amount=-price,
                type=TransactionType.LESSON_DEBIT,
                balance_after=new_balance,
                comment=f"Урок {lesson.start_at.strftime('%d.%m %H:%M')}",
                created_by=f"tutor:{tutor_id}",
            )
            db.add(txn)
            await db.flush()
            ls.transaction_id = txn.id

            # Аудит баланса
            audit = BalanceAuditLog(
                student_id=ls.student_id,
                old_balance=current_balance,
                new_balance=new_balance,
                delta=-price,
                reason="lesson_completed",
                related_entity_type="lesson",
                related_entity_id=lesson.id,
                created_by=f"tutor:{tutor_id}",
            )
            db.add(audit)
            processed += 1

        elif status == "CANCELLED":
            ls.price_charged = Decimal("0")

    await db.commit()
    return {"processed": processed, "lesson_status": "COMPLETED"}