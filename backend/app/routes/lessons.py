"""Уроки: одиночные, пробные, завершение."""

from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.models.tutor import Tutor
from app.models.student import Student
from app.models.parent import Parent
from app.models.lesson import Lesson, LessonStudent
from app.schemas.lesson import (
    LessonCreate, LessonResponse,
    TrialLessonCreate, LessonStudentResponse,
)
from app.services.auth import get_current_tutor

router = APIRouter(prefix="/lessons", tags=["lessons"])


@router.get("/", response_model=list[LessonResponse])
async def list_lessons(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Список уроков репетитора с учениками."""
    result = await db.execute(
        select(Lesson)
        .where(Lesson.tutor_id == tutor.id)
        .options(selectinload(Lesson.lesson_students))
        .order_by(Lesson.start_at.desc())
    )
    lessons = result.scalars().all()

    response = []
    for lesson in lessons:
        lesson_data = LessonResponse.model_validate(lesson)
        student_ids = [ls.student_id for ls in lesson.lesson_students]
        if student_ids:
            students_result = await db.execute(
                select(Student).where(Student.id.in_(student_ids))
            )
            students_map = {s.id: s.name for s in students_result.scalars().all()}
            for ls_resp in lesson_data.students:
                ls_resp.student_name = students_map.get(ls_resp.student_id, "Unknown")
        response.append(lesson_data)

    return response


@router.post("/", response_model=LessonResponse, status_code=201)
async def create_lesson(
    payload: LessonCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Создать одиночный урок (не привязан к расписанию)."""
    end_at = payload.start_at + timedelta(minutes=payload.duration_minutes)

    lesson = Lesson(
        tutor_id=tutor.id,
        start_at=payload.start_at,
        end_at=end_at,
        status="SCHEDULED",
        meeting_url=payload.meeting_url,
        homework_text=payload.homework_text,
        max_students=payload.max_students or len(payload.students),
    )
    db.add(lesson)
    await db.flush()

    for s in payload.students:
        ls = LessonStudent(
            lesson_id=lesson.id,
            student_id=s.student_id,
            package_id=s.package_id,
            status="SCHEDULED",
        )
        db.add(ls)

    await db.commit()
    await db.refresh(lesson)

    result = await db.execute(
        select(Lesson)
        .where(Lesson.id == lesson.id)
        .options(selectinload(Lesson.lesson_students))
    )
    lesson = result.scalar_one()

    lesson_data = LessonResponse.model_validate(lesson)
    student_ids = [ls.student_id for ls in lesson.lesson_students]
    if student_ids:
        students_result = await db.execute(
            select(Student).where(Student.id.in_(student_ids))
        )
        students_map = {s.id: s.name for s in students_result.scalars().all()}
        for ls_resp in lesson_data.students:
            ls_resp.student_name = students_map.get(ls_resp.student_id, "Unknown")

    return lesson_data


@router.post("/trial", response_model=LessonResponse, status_code=201)
async def create_trial_lesson(
    payload: TrialLessonCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """
    Создать пробное занятие.
    Автоматически создаёт Parent + Student + Lesson.
    Ученик не привязан к пакету (пробный урок бесплатный или оплачивается отдельно).
    """
    end_at = payload.start_at + timedelta(minutes=payload.duration_minutes)

    parent_id = None
    if payload.parent_name:
        parent = Parent(
            name=payload.parent_name.strip(),
            phone=payload.parent_phone,
            telegram_id=payload.parent_telegram_id,
        )
        db.add(parent)
        await db.flush()
        parent_id = parent.id

    student = Student(
        name=payload.student_name.strip(),
        parent_id=parent_id,
        notes=payload.notes,
    )
    db.add(student)
    await db.flush()

    lesson = Lesson(
        tutor_id=tutor.id,
        start_at=payload.start_at,
        end_at=end_at,
        status="SCHEDULED",
        meeting_url=payload.meeting_url,
        max_students=1,
        tutor_notes=f"Пробное занятие. Предмет: {payload.subject}" if payload.subject else "Пробное занятие",
    )
    db.add(lesson)
    await db.flush()


    ls = LessonStudent(
        lesson_id=lesson.id,
        student_id=student.id,
        package_id=None,
        status="SCHEDULED",
    )
    db.add(ls)

    await db.commit()

    # Перезагружаем
    result = await db.execute(
        select(Lesson)
        .where(Lesson.id == lesson.id)
        .options(selectinload(Lesson.lesson_students))
    )
    lesson = result.scalar_one()

    lesson_data = LessonResponse.model_validate(lesson)
    for ls_resp in lesson_data.students:
        ls_resp.student_name = student.name

    return lesson_data


@router.delete("/{lesson_id}", status_code=204)
async def delete_lesson(
    lesson_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Удалить урок (каскадно удалит lesson_students)."""
    result = await db.execute(
        select(Lesson).where(
            Lesson.id == lesson_id,
            Lesson.tutor_id == tutor.id,
        )
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")

    await db.delete(lesson)
    await db.commit()

from decimal import Decimal
from pydantic import BaseModel
from app.services.balance_service import complete_lesson


class CompleteLessonRequest(BaseModel):
    attendance: dict[int, str]  # {student_id: "PRESENT"|"ABSENT"|"EXCUSED"|"CANCELLED"}


@router.post("/{lesson_id}/complete", status_code=200)
async def complete_lesson_endpoint(
    lesson_id: int,
    payload: CompleteLessonRequest,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Завершить урок и списать баланс."""
    try:
        result = await complete_lesson(
            db, lesson_id, tutor.id, payload.attendance
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))