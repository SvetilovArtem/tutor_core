"""Завершение урока, списание баланса, возвраты и приёмы оплат."""

from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.lesson import Lesson, LessonStudent
from app.models.transaction import Transaction, TransactionType
from app.models.balance_audit import BalanceAuditLog
from app.models.package import Package
from app.models.student import Student
from app.models.student_subject import StudentSubject


async def get_student_balance(db: AsyncSession, student_id: int) -> Decimal:
    """Текущий баланс ученика (сумма всех транзакций)."""
    result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .where(Transaction.student_id == student_id)
    )
    return Decimal(str(result.scalar() or 0))


async def complete_lesson(
    db: AsyncSession,
    lesson_id: int,
    tutor_id: int,
    attendance: dict[int, str],
    default_price: Decimal = Decimal("0"),
) -> dict:
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
    lesson_subject = getattr(lesson, 'subject', None)

    for ls in lesson.lesson_students:
        status = attendance.get(ls.student_id, "ABSENT")
        ls.status = status

        if status in ("PRESENT", "ABSENT"):
            # 1. Определяем цену урока для этого ученика
            final_price = default_price
            
            if lesson_subject:
                subj_result = await db.execute(
                    select(StudentSubject.price_per_lesson).where(
                        StudentSubject.student_id == ls.student_id,
                        StudentSubject.subject == lesson_subject
                    )
                )
                found_price = subj_result.scalar_one_or_none()
                if found_price is not None:
                    final_price = Decimal(str(found_price))

            # 2. Ищем активный пакет ученика по предмету урока
            pkg = None
            if ls.package_id:
                pkg_result = await db.execute(select(Package).where(Package.id == ls.package_id))
                pkg = pkg_result.scalar_one_or_none()
            
            if (not pkg or (lesson_subject and pkg.subject != lesson_subject)) and lesson_subject:
                pkg_result = await db.execute(
                    select(Package).where(
                        Package.student_id == ls.student_id,
                        Package.subject == lesson_subject,
                        Package.is_active == True,
                        Package.remaining_lessons > 0
                    ).order_by(Package.purchased_at.asc())
                )
                pkg = pkg_result.scalar_one_or_none()
                if pkg:
                    ls.package_id = pkg.id

            # 3. Расчет цены и определение статуса оплаты
            if pkg and pkg.remaining_lessons > 0:
                # Оплачено пакетом
                price = pkg.price_per_lesson
                pkg.remaining_lessons -= 1
                if pkg.remaining_lessons == 0:
                    pkg.is_active = False
                ls.is_paid = True
            else:
                # Списание с баланса
                price = final_price
                ls.is_paid = False

            ls.price_charged = price
            
            # 4. Создаем транзакцию списания
            current_balance = await get_student_balance(db, ls.student_id)
            new_balance = current_balance - price

            txn = Transaction(
                student_id=ls.student_id,
                package_id=ls.package_id,
                lesson_id=lesson.id,
                amount=-price,
                type=TransactionType.LESSON_DEBIT,
                balance_after=new_balance,
                comment=f"Урок {lesson.start_at.strftime('%d.%m %H:%M')} ({lesson_subject or 'без предмета'})",
                created_by=f"tutor:{tutor_id}",
            )
            db.add(txn)
            await db.flush()
            ls.transaction_id = txn.id

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

        elif status in ("CANCELLED", "EXCUSED"):
            ls.price_charged = Decimal("0")
            ls.is_paid = False

    await db.commit()
    return {"processed": processed, "lesson_status": "COMPLETED"}


async def revert_lesson_completion(
    db: AsyncSession,
    lesson_id: int,
    student_id: int,
    new_status: str,
) -> None:
    result = await db.execute(
        select(LessonStudent).where(
            LessonStudent.lesson_id == lesson_id,
            LessonStudent.student_id == student_id
        )
    )
    ls_result = result.scalar_one_or_none()

    if not ls_result or ls_result.status not in ("PRESENT", "ABSENT"):
        if ls_result:
            ls_result.status = new_status
        return

    if ls_result.transaction_id:
        txn_result = await db.execute(
            select(Transaction).where(Transaction.id == ls_result.transaction_id)
        )
        txn = txn_result.scalar_one_or_none()

        if txn and txn.type == TransactionType.LESSON_DEBIT:
            if ls_result.package_id:
                pkg_result = await db.execute(
                    select(Package).where(Package.id == ls_result.package_id)
                )
                pkg = pkg_result.scalar_one_or_none()
                if pkg:
                    pkg.remaining_lessons += 1
                    pkg.is_active = True

            current_balance = await get_student_balance(db, student_id)
            refund_amount = abs(txn.amount)
            new_balance = current_balance + refund_amount

            refund_txn = Transaction(
                student_id=student_id,
                package_id=ls_result.package_id,
                lesson_id=lesson_id,
                amount=refund_amount,
                type=TransactionType.LESSON_REFUND,
                balance_after=new_balance,
                comment=f"Возврат за урок (статус изменен на {new_status})",
                created_by="system:auto_revert",
            )
            db.add(refund_txn)
            await db.flush()

            ls_result.price_charged = Decimal("0")
            ls_result.transaction_id = refund_txn.id
            ls_result.is_paid = False

    ls_result.status = new_status


async def mark_package_as_paid(
    db: AsyncSession,
    package_id: int,
    tutor_id: int,
) -> dict:
    pkg_result = await db.execute(select(Package).where(Package.id == package_id))
    package = pkg_result.scalar_one_or_none()
    if not package:
        raise ValueError("Пакет не найден")

    if package.payment_status == "paid":
        raise ValueError("Пакет уже оплачен")

    total_amount = package.price_per_lesson * package.total_lessons
    current_balance = await get_student_balance(db, package.student_id)
    new_balance = current_balance + total_amount

    txn = Transaction(
        student_id=package.student_id,
        package_id=package.id,
        amount=total_amount,
        type=TransactionType.PACKAGE_PAYMENT,
        balance_after=new_balance,
        comment=f"Оплата пакета «{package.name}»",
        created_by=f"tutor:{tutor_id}",
    )
    db.add(txn)

    audit = BalanceAuditLog(
        student_id=package.student_id,
        old_balance=current_balance,
        new_balance=new_balance,
        delta=total_amount,
        reason="package_paid",
        related_entity_type="package",
        related_entity_id=package.id,
        created_by=f"tutor:{tutor_id}",
    )
    db.add(audit)

    package.payment_status = "paid"
    await db.commit()

    return {
        "package_id": package.id,
        "amount": float(total_amount),
        "new_balance": float(new_balance),
    }


async def record_student_payment(
    db: AsyncSession,
    student_id: int,
    tutor_id: int,
    amount: Decimal,
    comment: str | None = None,
) -> dict:
    if amount <= 0:
        raise ValueError("Сумма должна быть положительной")

    student_result = await db.execute(select(Student).where(Student.id == student_id))
    student = student_result.scalar_one_or_none()
    if not student:
        raise ValueError("Ученик не найден")

    current_balance = await get_student_balance(db, student_id)
    new_balance = current_balance + amount

    txn = Transaction(
        student_id=student_id,
        package_id=None,
        lesson_id=None,
        amount=amount,
        type=TransactionType.MANUAL_ADJUSTMENT,
        balance_after=new_balance,
        comment=comment or "Оплата от ученика",
        created_by=f"tutor:{tutor_id}",
    )
    db.add(txn)

    audit = BalanceAuditLog(
        student_id=student_id,
        old_balance=current_balance,
        new_balance=new_balance,
        delta=amount,
        reason="manual_payment",
        related_entity_type="manual_payment",
        related_entity_id=0,
        created_by=f"tutor:{tutor_id}",
    )
    db.add(audit)

    await db.commit()

    return {
        "student_id": student_id,
        "amount": float(amount),
        "new_balance": float(new_balance),
    }


async def adjust_student_balance(
    db: AsyncSession,
    student_id: int,
    tutor_id: int,
    amount: Decimal,
    comment: str | None = None,
) -> dict:
    if amount == 0:
        raise ValueError("Сумма корректировки не может быть равна 0")

    student_result = await db.execute(select(Student).where(Student.id == student_id))
    student = student_result.scalar_one_or_none()
    if not student:
        raise ValueError("Ученик не найден")

    current_balance = await get_student_balance(db, student_id)
    new_balance = current_balance + amount

    txn_type = TransactionType.MANUAL_ADJUSTMENT if amount > 0 else TransactionType.MANUAL_DEDUCTION

    txn = Transaction(
        student_id=student_id,
        package_id=None,
        lesson_id=None,
        amount=amount,
        type=txn_type,
        balance_after=new_balance,
        comment=comment or "Корректировка баланса",
        created_by=f"tutor:{tutor_id}",
    )
    db.add(txn)

    audit = BalanceAuditLog(
        student_id=student_id,
        old_balance=current_balance,
        new_balance=new_balance,
        delta=amount,
        reason="manual_adjustment",
        related_entity_type="manual_adjustment",
        related_entity_id=0,
        created_by=f"tutor:{tutor_id}",
    )
    db.add(audit)

    await db.commit()

    return {
        "student_id": student_id,
        "amount": float(amount),
        "new_balance": float(new_balance),
    }


async def mark_lesson_students_paid(
    db: AsyncSession,
    lesson_id: int,
    student_ids: list[int],
    tutor_id: int,
    amount_per_student: Decimal,
    comment: str | None = None,
) -> dict:
    paid_students = []
    
    for student_id in student_ids:
        ls_result = await db.execute(
            select(LessonStudent).where(
                LessonStudent.lesson_id == lesson_id,
                LessonStudent.student_id == student_id,
            )
        )
        ls = ls_result.scalar_one_or_none()
        if not ls:
            continue
        
        if ls.is_paid:
            continue
        
        current_balance = await get_student_balance(db, student_id)
        new_balance = current_balance + amount_per_student
        
        txn = Transaction(
            student_id=student_id,
            package_id=None,
            lesson_id=lesson_id,
            amount=amount_per_student,
            type=TransactionType.MANUAL_ADJUSTMENT,
            balance_after=new_balance,
            comment=comment or f"Оплата за урок #{lesson_id}",
            created_by=f"tutor:{tutor_id}",
        )
        db.add(txn)
        
        audit = BalanceAuditLog(
            student_id=student_id,
            old_balance=current_balance,
            new_balance=new_balance,
            delta=amount_per_student,
            reason="lesson_payment",
            related_entity_type="lesson",
            related_entity_id=lesson_id,
            created_by=f"tutor:{tutor_id}",
        )
        db.add(audit)
        
        ls.is_paid = True
        ls.transaction_id = txn.id
        
        paid_students.append(student_id)
    
    await db.commit()
    
    return {
        "lesson_id": lesson_id,
        "paid_students": paid_students,
        "amount_per_student": float(amount_per_student),
    }