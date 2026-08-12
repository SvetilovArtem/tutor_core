"""CRUD для пакетов занятий + оплата пакета."""

from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database.session import get_db
from app.models.tutor import Tutor
from app.models.package import Package
from app.models.transaction import Transaction, TransactionType
from app.models.balance_audit import BalanceAuditLog
from app.schemas.package import PackageCreate, PackageUpdate, PackageResponse
from app.services.auth import get_current_tutor

router = APIRouter(prefix="/packages", tags=["packages"])


async def _get_student_balance(db: AsyncSession, student_id: int) -> Decimal:
    """Текущий баланс ученика = сумма всех транзакций."""
    result = await db.execute(
        select(Transaction.amount).where(Transaction.student_id == student_id)
    )
    amounts = [row[0] for row in result.all()]
    return sum(amounts, Decimal("0"))


@router.get("/", response_model=list[PackageResponse])
async def list_packages(
    student_id: int | None = None,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Список пакетов репетитора. Опциональная фильтрация по ученику."""
    query = select(Package).where(Package.tutor_id == tutor.id)
    if student_id:
        query = query.where(Package.student_id == student_id)
    query = query.order_by(Package.purchased_at.desc())

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=PackageResponse, status_code=201)
async def create_package(
    payload: PackageCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """
    Создать пакет занятий.
    Если payment_status == 'paid' → автоматически создаёт транзакцию PACKAGE_PAYMENT.
    """
    package = Package(
        tutor_id=tutor.id,
        student_id=payload.student_id,
        name=payload.name.strip(),
        total_lessons=payload.total_lessons,
        remaining_lessons=payload.total_lessons,
        price_per_lesson=payload.price_per_lesson,
        duration_minutes=payload.duration_minutes,
        expires_at=payload.expires_at,
        payment_status=payload.payment_status,
    )
    db.add(package)
    await db.flush()

    # Если пакет оплачен — создаём транзакцию и аудит баланса
    if payload.payment_status == "paid":
        current_balance = await _get_student_balance(db, payload.student_id)
        total_amount = payload.price_per_lesson * payload.total_lessons
        new_balance = current_balance + total_amount

        txn = Transaction(
            student_id=payload.student_id,
            package_id=package.id,
            amount=total_amount,
            type=TransactionType.PACKAGE_PAYMENT,
            balance_after=new_balance,
            comment=f"Оплата пакета «{package.name}»",
            created_by=f"tutor:{tutor.id}",
        )
        db.add(txn)

        audit = BalanceAuditLog(
            student_id=payload.student_id,
            old_balance=current_balance,
            new_balance=new_balance,
            delta=total_amount,
            reason="package_purchased",
            related_entity_type="package",
            related_entity_id=package.id,
            created_by=f"tutor:{tutor.id}",
        )
        db.add(audit)

    await db.commit()
    await db.refresh(package)
    return package


@router.get("/{package_id}", response_model=PackageResponse)
async def get_package(
    package_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Package).where(Package.id == package_id, Package.tutor_id == tutor.id)
    )
    package = result.scalar_one_or_none()
    if not package:
        raise HTTPException(status_code=404, detail="Пакет не найден")
    return package


@router.patch("/{package_id}", response_model=PackageResponse)
async def update_package(
    package_id: int,
    payload: PackageUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Package).where(Package.id == package_id, Package.tutor_id == tutor.id)
    )
    package = result.scalar_one_or_none()
    if not package:
        raise HTTPException(status_code=404, detail="Пакет не найден")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(package, field, value)

    await db.commit()
    await db.refresh(package)
    return package


@router.delete("/{package_id}", status_code=204)
async def delete_package(
    package_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Package).where(Package.id == package_id, Package.tutor_id == tutor.id)
    )
    package = result.scalar_one_or_none()
    if not package:
        raise HTTPException(status_code=404, detail="Пакет не найден")

    await db.delete(package)
    await db.commit()