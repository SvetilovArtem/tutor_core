"""Уроки: одиночные, пробные, завершение, разовые."""

import os
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal 
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.models.tutor import Tutor
from app.models.student import Student
from app.models.parent import Parent
from app.models.lesson import Lesson, LessonStudent
from app.models.homework_attachment import HomeworkAttachment
from app.schemas.lesson import LessonCreate, LessonResponse, TrialLessonCreate
from app.schemas.pagination import PaginatedResponse
from app.services.auth import get_current_tutor
from app.services.balance_service import complete_lesson, revert_lesson_completion, mark_lesson_students_paid
from app.services.schedule_validator import check_lesson_time_conflict

router = APIRouter(prefix="/lessons", tags=["lessons"])

UPLOAD_DIR = Path("uploads/homework")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

class LessonPaginatedResponse(PaginatedResponse[LessonResponse]):
    pass

class QuickLessonCreate(BaseModel):
    student_ids: list[int] = Field(..., min_length=1)
    subject: str | None = Field(None, max_length=100)
    start_at: datetime
    duration_minutes: int = Field(default=60, ge=15, le=240)
    notes: str | None = Field(None, max_length=500)

def _attachment_to_dict(att: HomeworkAttachment) -> dict:
    return {
        "id": att.id,
        "filename": att.filename,
        "original_name": att.original_name,
        "mime_type": att.mime_type,
        "size_bytes": att.size_bytes,
        "url": f"/api/lessons/attachments/{att.id}/file",
        "is_image": att.mime_type in ALLOWED_IMAGE_TYPES,
        "uploaded_at": att.uploaded_at.isoformat() if att.uploaded_at else None,
    }

async def _enrich_lesson_response(lesson: Lesson, db: AsyncSession) -> LessonResponse:
    lesson_dict = {
        "id": lesson.id,
        "tutor_id": lesson.tutor_id,
        "schedule_rule_id": lesson.schedule_rule_id,
        "exception_id": lesson.exception_id,
        "start_at": lesson.start_at,
        "end_at": lesson.end_at,
        "status": lesson.status,
        "subject": getattr(lesson, 'subject', None),
        "meeting_url": lesson.meeting_url,
        "homework_text": lesson.homework_text,
        "tutor_notes": lesson.tutor_notes,
        "materials_url": lesson.materials_url,
        "recording_url": lesson.recording_url,
        "max_students": lesson.max_students,
        "created_at": lesson.created_at,
        "students": [
            {
                "student_id": ls.student_id, 
                "student_name": "", 
                "status": ls.status, 
                "is_paid": getattr(ls, 'is_paid', False),
                "price_charged": float(ls.price_charged) if getattr(ls, 'price_charged', None) is not None else None
            }
            for ls in lesson.lesson_students
        ],
        "homework_attachments": [_attachment_to_dict(att) for att in lesson.homework_attachments],
    }

    data = LessonResponse(**lesson_dict)

    student_ids = [ls.student_id for ls in lesson.lesson_students]
    if student_ids:
        students_result = await db.execute(select(Student).where(Student.id.in_(student_ids)))
        students_map = {s.id: s.name for s in students_result.scalars().all()}
        for ls_resp in data.students:
            ls_resp.student_name = students_map.get(ls_resp.student_id, "Unknown")

    return data

async def _reload_lesson(db: AsyncSession, lesson_id: int) -> Lesson:
    result = await db.execute(
        select(Lesson)
        .where(Lesson.id == lesson_id)
        .options(selectinload(Lesson.lesson_students), selectinload(Lesson.homework_attachments))
    )
    return result.scalar_one()


@router.get("/", response_model=LessonPaginatedResponse)
async def list_lessons(
    page: int = Query(1, ge=1),
     limit: int = Query(100, ge=1, le=1000), # Дефолт 15 для уроков
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
    student_ids: str | None = None,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    count_query = select(func.count(Lesson.id)).where(Lesson.tutor_id == tutor.id)
    query = (
        select(Lesson)
        .where(Lesson.tutor_id == tutor.id)
        .options(selectinload(Lesson.lesson_students), selectinload(Lesson.homework_attachments))
    )

    if date_from:
        count_query = count_query.where(Lesson.start_at >= datetime.combine(date_from, datetime.min.time()))
        query = query.where(Lesson.start_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        count_query = count_query.where(Lesson.start_at <= datetime.combine(date_to, datetime.max.time()))
        query = query.where(Lesson.start_at <= datetime.combine(date_to, datetime.max.time()))
    if status:
        count_query = count_query.where(Lesson.status == status)
        query = query.where(Lesson.status == status)

    if student_ids:
        try:
            ids = [int(x.strip()) for x in student_ids.split(",") if x.strip()]
            if ids:
                subq = select(LessonStudent.lesson_id).where(LessonStudent.student_id.in_(ids))
                count_query = count_query.where(Lesson.id.in_(subq))
                query = query.where(Lesson.id.in_(subq))
        except ValueError:
            pass

    total = (await db.execute(count_query)).scalar() or 0
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    query = query.order_by(Lesson.start_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    lessons = result.scalars().all()
    
    items = [await _enrich_lesson_response(l, db) for l in lessons]
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }


@router.post("/quick", response_model=LessonResponse, status_code=201)
async def create_quick_lesson(
    payload: QuickLessonCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    students_result = await db.execute(select(Student).where(Student.id.in_(payload.student_ids)))
    students = students_result.scalars().all()
    
    if len(students) != len(payload.student_ids):
        raise HTTPException(status_code=404, detail="Один или несколько учеников не найдены")

    if payload.subject and payload.subject not in tutor.subjects:
        raise HTTPException(status_code=400, detail=f"Предмет '{payload.subject}' не входит в ваш список")

    end_at = payload.start_at + timedelta(minutes=payload.duration_minutes)

    conflict = await check_lesson_time_conflict(db, tutor.id, payload.start_at, end_at)
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=f"Пересечение с уроком {conflict.id} ({conflict.start_at.strftime('%d.%m %H:%M')}–{conflict.end_at.strftime('%H:%M')})"
        )

    lesson = Lesson(
        tutor_id=tutor.id,
        start_at=payload.start_at,
        end_at=end_at,
        subject=payload.subject,
        status="SCHEDULED",
        tutor_notes=payload.notes,
        max_students=len(students),
    )
    db.add(lesson)
    await db.flush()

    for student in students:
        db.add(LessonStudent(
            lesson_id=lesson.id,
            student_id=student.id,
            status="SCHEDULED",
            is_paid=False,
        ))

    await db.commit()
    lesson = await _reload_lesson(db, lesson.id)
    return await _enrich_lesson_response(lesson, db)


@router.post("/", response_model=LessonResponse, status_code=201)
async def create_lesson(
    payload: LessonCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    end_at = payload.start_at + timedelta(minutes=payload.duration_minutes)

    conflict = await check_lesson_time_conflict(db, tutor.id, payload.start_at, end_at)
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=f"Пересечение с уроком {conflict.id} ({conflict.start_at.strftime('%d.%m %H:%M')}–{conflict.end_at.strftime('%H:%M')})"
        )

    lesson = Lesson(
        tutor_id=tutor.id,
        start_at=payload.start_at,
        end_at=end_at,
        subject=payload.subject,
        status="SCHEDULED",
        meeting_url=payload.meeting_url,
        homework_text=payload.homework_text,
        max_students=payload.max_students or len(payload.students),
    )
    db.add(lesson)
    await db.flush()

    for s in payload.students:
        db.add(LessonStudent(
            lesson_id=lesson.id,
            student_id=s.student_id,
            package_id=s.package_id,
            status="SCHEDULED",
            is_paid=False,
        ))

    await db.commit()
    lesson = await _reload_lesson(db, lesson.id)
    return await _enrich_lesson_response(lesson, db)


@router.post("/trial", response_model=LessonResponse, status_code=201)
async def create_trial_lesson(
    payload: TrialLessonCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    end_at = payload.start_at + timedelta(minutes=payload.duration_minutes)

    conflict = await check_lesson_time_conflict(db, tutor.id, payload.start_at, end_at)
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=f"Пересечение с уроком {conflict.id} ({conflict.start_at.strftime('%d.%m %H:%M')}–{conflict.end_at.strftime('%H:%M')})"
        )

    parent_id = None
    if payload.parent_name:
        parent = Parent(name=payload.parent_name.strip(), phone=payload.parent_phone, telegram_id=payload.parent_telegram_id)
        db.add(parent)
        await db.flush()
        parent_id = parent.id

    student = Student(name=payload.student_name.strip(), parent_id=parent_id, notes=payload.notes)
    db.add(student)
    await db.flush()

    lesson = Lesson(
        tutor_id=tutor.id,
        start_at=payload.start_at,
        end_at=end_at,
        subject=payload.subject,
        status="SCHEDULED",
        meeting_url=payload.meeting_url,
        max_students=1,
        tutor_notes=f"Пробное занятие. Предмет: {payload.subject}" if payload.subject else "Пробное занятие",
    )
    db.add(lesson)
    await db.flush()

    db.add(LessonStudent(lesson_id=lesson.id, student_id=student.id, package_id=None, status="SCHEDULED", is_paid=False))

    await db.commit()
    lesson = await _reload_lesson(db, lesson.id)
    lesson_data = await _enrich_lesson_response(lesson, db)

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
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id, Lesson.tutor_id == tutor.id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")

    await db.delete(lesson)
    await db.commit()


class CompleteLessonRequest(BaseModel):
    attendance: dict[int, str]
    lesson_summary: str | None = None
    next_homework: str | None = None

@router.post("/{lesson_id}/complete", response_model=LessonResponse, status_code=200)
async def complete_lesson_endpoint(
    lesson_id: int,
    payload: CompleteLessonRequest,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    try:
        first_student_id = list(payload.attendance.keys())[0] if payload.attendance else None
        default_price = Decimal("25")
        if first_student_id:
            student_result = await db.execute(select(Student).where(Student.id == first_student_id))
            student = student_result.scalar_one_or_none()
            if student:
                default_price = student.base_price

        await complete_lesson(
            db=db, lesson_id=lesson_id, tutor_id=tutor.id, attendance=payload.attendance, default_price=default_price
        )
        
        lesson = await _reload_lesson(db, lesson_id)
        if payload.lesson_summary:
            lesson.tutor_notes = payload.lesson_summary
        if payload.next_homework:
            lesson.homework_text = payload.next_homework
            
        await db.commit()
        lesson = await _reload_lesson(db, lesson.id)
        return await _enrich_lesson_response(lesson, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class LessonStatusUpdate(BaseModel):
    status: str

@router.patch("/{lesson_id}/status", response_model=LessonResponse)
async def update_lesson_status(
    lesson_id: int,
    payload: LessonStatusUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    valid_statuses = {"SCHEDULED", "COMPLETED", "CANCELLED"}
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Недопустимый статус. Допустимые: {valid_statuses}")

    result = await db.execute(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.tutor_id == tutor.id).options(selectinload(Lesson.lesson_students))
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")

    old_status = lesson.status
    new_status = payload.status

    if old_status == "COMPLETED" and new_status != "COMPLETED":
        for ls in lesson.lesson_students:
            await revert_lesson_completion(db, lesson.id, ls.student_id, new_status)
    elif old_status != "COMPLETED" and new_status == "COMPLETED":
        attendance = {ls.student_id: "PRESENT" for ls in lesson.lesson_students}
        first_student_id = lesson.lesson_students[0].student_id if lesson.lesson_students else None
        default_price = Decimal("25")
        if first_student_id:
            student_result = await db.execute(select(Student).where(Student.id == first_student_id))
            student = student_result.scalar_one_or_none()
            if student:
                default_price = student.base_price
        
        await complete_lesson(db=db, lesson_id=lesson.id, tutor_id=tutor.id, attendance=attendance, default_price=default_price)

    lesson.status = new_status
    await db.commit()
    lesson = await _reload_lesson(db, lesson.id)
    return await _enrich_lesson_response(lesson, db)


class LessonTimeUpdate(BaseModel):
    start_at: datetime
    end_at: datetime

@router.patch("/{lesson_id}/time", response_model=LessonResponse)
async def update_lesson_time(
    lesson_id: int,
    payload: LessonTimeUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    if payload.start_at >= payload.end_at:
        raise HTTPException(status_code=400, detail="Время начала должно быть раньше времени окончания")

    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id, Lesson.tutor_id == tutor.id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")

    if lesson.status != "SCHEDULED":
        raise HTTPException(status_code=400, detail="Можно переносить только запланированные уроки")

    conflict = await db.execute(
        select(Lesson).where(
            Lesson.tutor_id == tutor.id,
            Lesson.id != lesson_id,
            Lesson.status == "SCHEDULED",
            Lesson.start_at < payload.end_at,
            Lesson.end_at > payload.start_at,
        )
    )
    if conflict.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="В это время уже есть другой урок")

    lesson.start_at = payload.start_at
    lesson.end_at = payload.end_at
    await db.commit()
    await db.refresh(lesson)

    return await _enrich_lesson_response(lesson, db)


class LessonPaymentRequest(BaseModel):
    student_ids: list[int]
    amount: Decimal = Field(..., gt=0)
    comment: str | None = None

@router.post("/{lesson_id}/pay", status_code=200)
async def pay_lesson(
    lesson_id: int,
    payload: LessonPaymentRequest,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id, Lesson.tutor_id == tutor.id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")
    
    if lesson.status != "COMPLETED":
        raise HTTPException(status_code=400, detail="Оплачивать можно только проведённые уроки")
    
    return await mark_lesson_students_paid(db, lesson_id, payload.student_ids, tutor.id, payload.amount, payload.comment)


@router.post("/{lesson_id}/attachments", status_code=201)
async def upload_homework_attachment(
    lesson_id: int,
    file: UploadFile = File(...),
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id, Lesson.tutor_id == tutor.id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")

    if not file.content_type:
        raise HTTPException(status_code=400, detail="Невозможно определить тип файла")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"Файл слишком большой (макс. {MAX_FILE_SIZE // 1024 // 1024} МБ)")

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
async def get_attachment_file(attachment_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(HomeworkAttachment).where(HomeworkAttachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if not attachment or not os.path.exists(attachment.file_path):
        raise HTTPException(status_code=404, detail="Файл не найден")

    return FileResponse(path=attachment.file_path, media_type=attachment.mime_type, filename=attachment.original_name)


@router.delete("/attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    attachment_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(HomeworkAttachment)
        .join(Lesson, Lesson.id == HomeworkAttachment.lesson_id)
        .where(HomeworkAttachment.id == attachment_id, Lesson.tutor_id == tutor.id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Вложение не найдено")

    if os.path.exists(attachment.file_path):
        os.remove(attachment.file_path)

    await db.delete(attachment)
    await db.commit()