"""Уроки: одиночные, пробные, завершение."""

import os
import uuid
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.models.tutor import Tutor
from app.models.student import Student
from app.models.parent import Parent
from app.models.lesson import Lesson, LessonStudent
from app.models.homework_attachment import HomeworkAttachment
from app.schemas.lesson import LessonCreate, LessonResponse, TrialLessonCreate
from app.services.auth import get_current_tutor
from app.services.balance_service import complete_lesson
from app.services.schedule_validator import check_lesson_time_conflict

router = APIRouter(prefix="/lessons", tags=["lessons"])

UPLOAD_DIR = Path("uploads/homework")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


# ── Хелперы ────────────────────────────────────────────────────


def _attachment_to_dict(att: HomeworkAttachment) -> dict:
    """Конвертация ORM-объекта HomeworkAttachment в словарь для схемы."""
    return {
        "id": att.id,
        "filename": att.filename,
        "original_name": att.original_name,
        "mime_type": att.mime_type,
        "size_bytes": att.size_bytes,
        "url": f"/api/lessons/attachments/{att.id}/file",
        "is_image": att.mime_type in ALLOWED_IMAGE_TYPES,
        "uploaded_at": att.uploaded_at,
    }


async def _enrich_lesson_response(lesson: Lesson, db: AsyncSession) -> LessonResponse:
    """
    Безопасная конвертация урока в схему ответа.
    Не использует model_validate напрямую, чтобы избежать конфликта
    вычисляемых полей url/is_image в homework_attachments.
    """
    lesson_dict = {
        "id": lesson.id,
        "tutor_id": lesson.tutor_id,
        "schedule_rule_id": lesson.schedule_rule_id,
        "exception_id": lesson.exception_id,
        "start_at": lesson.start_at,
        "end_at": lesson.end_at,
        "status": lesson.status,
        "meeting_url": lesson.meeting_url,
        "homework_text": lesson.homework_text,
        "tutor_notes": lesson.tutor_notes,
        "materials_url": lesson.materials_url,
        "recording_url": lesson.recording_url,
        "max_students": lesson.max_students,
        "created_at": lesson.created_at,
        "students": [
            {"student_id": ls.student_id, "student_name": "", "status": ls.status}
            for ls in lesson.lesson_students
        ],
        "homework_attachments": [
            _attachment_to_dict(att) for att in lesson.homework_attachments
        ],
    }

    data = LessonResponse(**lesson_dict)

    # Заполняем имена учеников из БД
    student_ids = [ls.student_id for ls in lesson.lesson_students]
    if student_ids:
        students_result = await db.execute(
            select(Student).where(Student.id.in_(student_ids))
        )
        students_map = {s.id: s.name for s in students_result.scalars().all()}
        for ls_resp in data.students:
            ls_resp.student_name = students_map.get(ls_resp.student_id, "Unknown")

    return data


async def _reload_lesson(db: AsyncSession, lesson_id: int) -> Lesson:
    """Перезагрузка урока с relationships."""
    result = await db.execute(
        select(Lesson)
        .where(Lesson.id == lesson_id)
        .options(
            selectinload(Lesson.lesson_students),
            selectinload(Lesson.homework_attachments),
        )
    )
    return result.scalar_one()


# ── Роуты ──────────────────────────────────────────────────────


@router.get("/", response_model=list[LessonResponse])
async def list_lessons(
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Список уроков репетитора с учениками."""
    result = await db.execute(
        select(Lesson)
        .where(Lesson.tutor_id == tutor.id)
        .options(
            selectinload(Lesson.lesson_students),
            selectinload(Lesson.homework_attachments),
        )
        .order_by(Lesson.start_at.desc())
    )
    lessons = result.scalars().all()
    return [await _enrich_lesson_response(l, db) for l in lessons]


@router.post("/", response_model=LessonResponse, status_code=201)
async def create_lesson(
    payload: LessonCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Создать одиночный урок (не привязан к расписанию)."""
    end_at = payload.start_at + timedelta(minutes=payload.duration_minutes)

    # Проверка пересечений для индивидуальных уроков
    if payload.students:
        conflict = await check_lesson_time_conflict(db, tutor.id, payload.start_at, end_at)
        if conflict:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Пересечение с уроком {conflict.id} "
                    f"({conflict.start_at.strftime('%d.%m %H:%M')}–{conflict.end_at.strftime('%H:%M')})"
                ),
            )

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

    lesson = await _reload_lesson(db, lesson.id)
    return await _enrich_lesson_response(lesson, db)


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

    # Проверка пересечений
    conflict = await check_lesson_time_conflict(db, tutor.id, payload.start_at, end_at)
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Пересечение с уроком {conflict.id} "
                f"({conflict.start_at.strftime('%d.%m %H:%M')}–{conflict.end_at.strftime('%H:%M')})"
            ),
        )

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
        tutor_notes=(
            f"Пробное занятие. Предмет: {payload.subject}"
            if payload.subject
            else "Пробное занятие"
        ),
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

    lesson = await _reload_lesson(db, lesson.id)
    lesson_data = await _enrich_lesson_response(lesson, db)

    # Для пробного урока имя ученика известно сразу
    for ls_resp in lesson_data.students:
        if not ls_resp.student_name or ls_resp.student_name == "Unknown":
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
        result = await complete_lesson(db, lesson_id, tutor.id, payload.attendance)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class LessonStatusUpdate(BaseModel):
    status: str  # SCHEDULED | COMPLETED | CANCELLED


@router.patch("/{lesson_id}/status", response_model=LessonResponse)
async def update_lesson_status(
    lesson_id: int,
    payload: LessonStatusUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Изменить статус урока."""
    valid_statuses = {"SCHEDULED", "COMPLETED", "CANCELLED"}
    if payload.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимый статус. Допустимые: {valid_statuses}",
        )

    result = await db.execute(
        select(Lesson).where(
            Lesson.id == lesson_id,
            Lesson.tutor_id == tutor.id,
        )
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")

    lesson.status = payload.status
    await db.commit()

    lesson = await _reload_lesson(db, lesson.id)
    return await _enrich_lesson_response(lesson, db)


@router.post("/{lesson_id}/attachments", status_code=201)
async def upload_homework_attachment(
    lesson_id: int,
    file: UploadFile = File(...),
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Загрузить файл домашнего задания к уроку."""
    result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.tutor_id == tutor.id)
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")

    if not file.content_type:
        raise HTTPException(status_code=400, detail="Невозможно определить тип файла")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Файл слишком большой (макс. {MAX_FILE_SIZE // 1024 // 1024} МБ)",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "file").suffix.lower()
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / unique_name

    with open(file_path, "wb") as f:
        f.write(content)

    attachment = HomeworkAttachment(
        lesson_id=lesson_id,
        filename=unique_name,
        original_name=file.filename or "file",
        file_path=str(file_path),
        mime_type=file.content_type,
        size_bytes=len(content),
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    return _attachment_to_dict(attachment)


@router.get("/attachments/{attachment_id}/file")
async def get_attachment_file(
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Отдать файл вложения (для просмотра/скачивания)."""
    result = await db.execute(
        select(HomeworkAttachment).where(HomeworkAttachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment or not os.path.exists(attachment.file_path):
        raise HTTPException(status_code=404, detail="Файл не найден")

    return FileResponse(
        path=attachment.file_path,
        media_type=attachment.mime_type,
        filename=attachment.original_name,
    )


@router.delete("/attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    attachment_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Удалить вложение домашнего задания."""
    result = await db.execute(
        select(HomeworkAttachment)
        .join(Lesson, Lesson.id == HomeworkAttachment.lesson_id)
        .where(
            HomeworkAttachment.id == attachment_id,
            Lesson.tutor_id == tutor.id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Вложение не найдено")

    if os.path.exists(attachment.file_path):
        os.remove(attachment.file_path)

    await db.delete(attachment)
    await db.commit()