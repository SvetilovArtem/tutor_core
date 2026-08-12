"""CRUD для учеников. Все операции scoped по tutor_id через JWT."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select

from app.database.session import get_db
from app.models.tutor import Tutor
from app.models.student import Student
from app.models.package import Package
from app.schemas.student import StudentCreate, StudentUpdate, StudentResponse
from app.services.auth import get_current_tutor

router = APIRouter(prefix="/students", tags=["students"])


@router.get("/", response_model=list[StudentResponse])
async def list_students(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Список учеников репетитора (через пакеты)."""
    result = await db.execute(
        select(Student)
        .join(Package, Package.student_id == Student.id)
        .where(Package.tutor_id == tutor.id)
        .distinct()
        .order_by(Student.name)
    )
    return result.scalars().all()


@router.post("/", response_model=StudentResponse, status_code=201)
async def create_student(
    payload: StudentCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Создать ученика. Проверка дублей по (name + parent_id) в рамках репетитора."""
    query = (
        select(Student)
        .join(Package, Package.student_id == Student.id)
        .where(
            Package.tutor_id == tutor.id,
            func.lower(func.trim(Student.name)) == payload.name.strip().lower(),
        )
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
            detail=f"Ученик «{existing.name}» уже существует (ID: {existing.id})"
        )

    student = Student(**payload.model_dump(exclude_unset=True))
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return student


@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Получить ученика (проверка принадлежности через пакеты)."""
    result = await db.execute(
        select(Student)
        .join(Package, Package.student_id == Student.id)
        .where(Package.tutor_id == tutor.id, Student.id == student_id)
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    return student


@router.patch("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: int,
    payload: StudentUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Обновить данные ученика."""
    result = await db.execute(
        select(Student)
        .join(Package, Package.student_id == Student.id)
        .where(Package.tutor_id == tutor.id, Student.id == student_id)
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(student, field, value)

    await db.commit()
    await db.refresh(student)
    return student


@router.delete("/{student_id}", status_code=204)
async def delete_student(
    student_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Удалить ученика (каскадно удалит пакеты, уроки, транзакции)."""
    result = await db.execute(
        select(Student)
        .join(Package, Package.student_id == Student.id)
        .where(Package.tutor_id == tutor.id, Student.id == student_id)
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    await db.delete(student)
    await db.commit()