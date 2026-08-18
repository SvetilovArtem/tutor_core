"""CRUD для учеников. Все операции scoped по tutor_id через JWT."""

from decimal import Decimal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, or_
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.models.tutor import Tutor
from app.models.student import Student
from app.models.student_subject import StudentSubject
from app.schemas.student import StudentCreate, StudentUpdate, StudentResponse
from app.schemas.pagination import PaginatedResponse
from app.services.auth import get_current_tutor
from app.services.balance_service import get_student_balance, record_student_payment, adjust_student_balance

router = APIRouter(prefix="/students", tags=["students"])

class StudentPaginatedResponse(PaginatedResponse[StudentResponse]):
    pass

def _student_belongs_to_tutor_query(tutor_id: int):
    return Student.id.isnot(None)

async def _to_response(db: AsyncSession, student: Student) -> StudentResponse:
    balance = await get_student_balance(db, student.id)
    
    return StudentResponse(
        id=student.id,
        name=student.name,
        parent_id=student.parent_id,
        phone=student.phone,
        email=student.email,
        telegram_id=student.telegram_id,
        birth_date=str(student.birth_date) if student.birth_date else None,
        notes=student.notes,
        is_active=student.is_active,
        subjects=[{"subject": ss.subject, "price_per_lesson": ss.price_per_lesson} for ss in student.subjects],
        balance=balance,
        invite_code=student.invite_code,
    )

@router.get("/", response_model=StudentPaginatedResponse)
async def list_students(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    search: str | None = Query(None, description="Поиск по имени/телефону"),
    subject: str | None = Query(None, description="Фильтр по предмету"),
    is_active: bool | None = Query(None, description="Фильтр по активности"),
    sort_by: str = Query("name", description="Поле сортировки: name|created_at"),
    sort_order: str = Query("asc", description="asc или desc"),
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    count_query = select(func.count(Student.id)).where(_student_belongs_to_tutor_query(tutor.id))
    query = (
        select(Student)
        .where(_student_belongs_to_tutor_query(tutor.id))
        .options(selectinload(Student.subjects))
    )

    if search:
        pattern = f"%{search.strip().lower()}%"
        count_query = count_query.where(
            or_(
                func.lower(Student.name).like(pattern),
                func.lower(func.coalesce(Student.phone, "")).like(pattern),
            )
        )
        query = query.where(
            or_(
                func.lower(Student.name).like(pattern),
                func.lower(func.coalesce(Student.phone, "")).like(pattern),
            )
        )

    if is_active is not None:
        count_query = count_query.where(Student.is_active == is_active)
        query = query.where(Student.is_active == is_active)

    if subject:
        subq = select(StudentSubject.student_id).where(StudentSubject.subject == subject)
        count_query = count_query.where(Student.id.in_(subq))
        query = query.where(Student.id.in_(subq))

    total = (await db.execute(count_query)).scalar() or 0
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    sort_column = getattr(Student, sort_by, Student.name)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    students = result.scalars().all()

    items = [await _to_response(db, s) for s in students]
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }

@router.post("/", response_model=StudentResponse, status_code=201)
async def create_student(
    payload: StudentCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    if payload.subjects:
        invalid = [s.subject for s in payload.subjects if s.subject not in tutor.subjects]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Предметы {invalid} не входят в ваш список: {tutor.subjects}",
            )

    query = select(Student).where(
        func.lower(func.trim(Student.name)) == payload.name.strip().lower(),
    )
    if payload.parent_id:
        query = query.where(Student.parent_id == payload.parent_id)
    else:
        query = query.where(Student.parent_id.is_(None))

    result = await db.execute(query)
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Ученик «{existing.name}» уже существует",
        )

    student_data = payload.model_dump(exclude={"subjects"}, exclude_unset=True)
    student = Student(**student_data)
    db.add(student)
    await db.flush()

    for subj_data in payload.subjects:
        db.add(StudentSubject(
            student_id=student.id, 
            subject=subj_data.subject, 
            price_per_lesson=subj_data.price_per_lesson
        ))

    await db.commit()

    result = await db.execute(
        select(Student)
        .where(Student.id == student.id)
        .options(selectinload(Student.subjects))
    )
    student = result.scalar_one()

    return await _to_response(db, student)

@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Student)
        .where(
            Student.id == student_id,
            _student_belongs_to_tutor_query(tutor.id),
        )
        .options(selectinload(Student.subjects))
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    return await _to_response(db, student)

@router.patch("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: int,
    payload: StudentUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Student)
        .where(
            Student.id == student_id,
            _student_belongs_to_tutor_query(tutor.id),
        )
        .options(selectinload(Student.subjects))
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    update_data = payload.model_dump(exclude={"subjects"}, exclude_unset=True)
    for field, value in update_data.items():
        setattr(student, field, value)

    if payload.subjects is not None:
        invalid = [s.subject for s in payload.subjects if s.subject not in tutor.subjects]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Предметы {invalid} не входят в ваш список: {tutor.subjects}",
            )

        for ss in list(student.subjects):
            await db.delete(ss)
        await db.flush()

        for subj_data in payload.subjects:
            db.add(StudentSubject(
                student_id=student.id, 
                subject=subj_data.subject, 
                price_per_lesson=subj_data.price_per_lesson
            ))

    await db.commit()

    result = await db.execute(
        select(Student)
        .where(Student.id == student.id)
        .options(selectinload(Student.subjects))
    )
    student = result.scalar_one()

    return await _to_response(db, student)

@router.patch("/{student_id}/toggle-active", response_model=StudentResponse)
async def toggle_student_active(
    student_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Student)
        .where(
            Student.id == student_id,
            _student_belongs_to_tutor_query(tutor.id),
        )
        .options(selectinload(Student.subjects))
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    student.is_active = not student.is_active
    await db.commit()

    result = await db.execute(
        select(Student)
        .where(Student.id == student.id)
        .options(selectinload(Student.subjects))
    )
    student = result.scalar_one()

    return await _to_response(db, student)

@router.post("/{student_id}/remind-payment", status_code=200)
async def remind_payment(
    student_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Student).where(
            Student.id == student_id,
            _student_belongs_to_tutor_query(tutor.id),
        )
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    return {
        "message": f"Напоминание отправлено ученику «{student.name}»",
        "student_id": student.id,
    }

@router.delete("/{student_id}", status_code=204)
async def delete_student(
    student_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Student).where(
            Student.id == student_id,
            _student_belongs_to_tutor_query(tutor.id),
        )
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    await db.delete(student)
    await db.commit()

class StudentPaymentRequest(BaseModel):
    amount: Decimal = Field(..., gt=0, description="Сумма оплаты (положительная)")
    comment: str | None = Field(None, max_length=200)

@router.post("/{student_id}/payment", status_code=200)
async def accept_student_payment(
    student_id: int,
    payload: StudentPaymentRequest,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Student).where(
            Student.id == student_id,
            _student_belongs_to_tutor_query(tutor.id),
        )
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    try:
        return await record_student_payment(
            db, student_id, tutor.id, payload.amount, payload.comment
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{student_id}/balance")
async def get_student_balance_endpoint(
    student_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Student).where(
            Student.id == student_id,
            _student_belongs_to_tutor_query(tutor.id),
        )
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    balance = await get_student_balance(db, student_id)
    return {"student_id": student_id, "balance": float(balance)}

class BalanceAdjustmentRequest(BaseModel):
    amount: Decimal = Field(..., description="Сумма корректировки (может быть отрицательной)")
    comment: str | None = Field(None, max_length=200)

@router.post("/{student_id}/adjust", status_code=200)
async def adjust_balance_endpoint(
    student_id: int,
    payload: BalanceAdjustmentRequest,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Student).where(
            Student.id == student_id,
            _student_belongs_to_tutor_query(tutor.id),
        )
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    try:
        return await adjust_student_balance(db, student_id, tutor.id, payload.amount, payload.comment)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{student_id}/invite-code", status_code=200)
async def generate_invite_code(
    student_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Student).where(
            Student.id == student_id,
            _student_belongs_to_tutor_query(tutor.id),
        )
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    new_code = str(uuid.uuid4()).replace('-', '')[:8].upper()
    student.invite_code = new_code
    await db.commit()

    return {"code": new_code}