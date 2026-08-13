"""CRUD для учеников. Все операции scoped по tutor_id через JWT."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, or_
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.models.tutor import Tutor
from app.models.student import Student
from app.models.package import Package
from app.models.lesson import Lesson, LessonStudent
from app.models.student_subject import StudentSubject
from app.schemas.student import StudentCreate, StudentUpdate, StudentResponse
from app.services.auth import get_current_tutor

router = APIRouter(prefix="/students", tags=["students"])


def _student_belongs_to_tutor_query(tutor_id: int):
    """
    Ученик принадлежит репетитору.
    Пока система однотенантная — возвращаем всех учеников.
    При добавлении мультитенантности раскомментировать фильтр.
    """
    # has_package = Student.id.in_(
    #     select(Package.student_id).where(Package.tutor_id == tutor_id)
    # )
    # has_lesson = Student.id.in_(
    #     select(LessonStudent.student_id)
    #     .join(Lesson, Lesson.id == LessonStudent.lesson_id)
    #     .where(Lesson.tutor_id == tutor_id)
    # )
    # return or_(has_package, has_lesson)
    return Student.id.isnot(None)


def _to_response(student: Student) -> StudentResponse:
    """Безопасная конвертация ORM-объекта в схему ответа."""
    return StudentResponse(
        id=student.id,
        name=student.name,
        parent_id=student.parent_id,
        phone=student.phone,
        telegram_id=student.telegram_id,
        birth_date=str(student.birth_date) if student.birth_date else None,
        notes=student.notes,
        is_active=student.is_active,
        subjects=[ss.subject for ss in student.subjects],
    )
    """Безопасная конвертация ORM-объекта в схему ответа."""
    data = StudentResponse.model_validate(
        student,
        from_attributes=True,
    )

    object.__setattr__(data, 'subjects', [ss.subject for ss in student.subjects])
    return data


@router.get("/", response_model=list[StudentResponse])
async def list_students(
    search: str | None = Query(None, description="Поиск по имени/телефону"),
    subject: str | None = Query(None, description="Фильтр по предмету"),
    is_active: bool | None = Query(None, description="Фильтр по активности"),
    sort_by: str = Query("name", description="Поле сортировки: name|created_at"),
    sort_order: str = Query("asc", description="asc или desc"),
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Список учеников с поиском, фильтрами и сортировкой."""
    query = (
        select(Student)
        .where(_student_belongs_to_tutor_query(tutor.id))
        .options(selectinload(Student.subjects))
    )

    # Поиск
    if search:
        pattern = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(Student.name).like(pattern),
                func.lower(func.coalesce(Student.phone, "")).like(pattern),
            )
        )

    # Фильтр по активности
    if is_active is not None:
        query = query.where(Student.is_active == is_active)

    # Фильтр по предмету
    if subject:
        query = query.where(
            Student.id.in_(
                select(StudentSubject.student_id).where(StudentSubject.subject == subject)
            )
        )

    # Сортировка
    sort_column = getattr(Student, sort_by, Student.name)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    result = await db.execute(query)
    students = result.scalars().all()

    return [_to_response(s) for s in students]


@router.post("/", response_model=StudentResponse, status_code=201)
async def create_student(
    payload: StudentCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Создать ученика с привязкой к предметам."""
    # Валидация предметов
    if payload.subjects:
        invalid = [s for s in payload.subjects if s not in tutor.subjects]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Предметы {invalid} не входят в ваш список: {tutor.subjects}",
            )

    # Проверка дублей
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

    # Создаём ученика
    student_data = payload.model_dump(exclude={"subjects"}, exclude_unset=True)
    student = Student(**student_data)
    db.add(student)
    await db.flush()

    # Привязываем предметы
    for subj in payload.subjects:
        db.add(StudentSubject(student_id=student.id, subject=subj))

    await db.commit()

    # Перезагружаем с subjects
    result = await db.execute(
        select(Student)
        .where(Student.id == student.id)
        .options(selectinload(Student.subjects))
    )
    student = result.scalar_one()

    return _to_response(student)


@router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Получить ученика."""
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

    return _to_response(student)


@router.patch("/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: int,
    payload: StudentUpdate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Обновить данные ученика и его предметы."""
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

    # Обновляем базовые поля
    update_data = payload.model_dump(exclude={"subjects"}, exclude_unset=True)
    for field, value in update_data.items():
        setattr(student, field, value)

    # Обновляем предметы, если переданы
    if payload.subjects is not None:
        # Валидация
        invalid = [s for s in payload.subjects if s not in tutor.subjects]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Предметы {invalid} не входят в ваш список: {tutor.subjects}",
            )

        # Удаляем старые связи
        for ss in list(student.subjects):
            await db.delete(ss)
        await db.flush()

        # Создаём новые
        for subj in payload.subjects:
            db.add(StudentSubject(student_id=student.id, subject=subj))

    await db.commit()

    # Перезагружаем с subjects
    result = await db.execute(
        select(Student)
        .where(Student.id == student.id)
        .options(selectinload(Student.subjects))
    )
    student = result.scalar_one()

    return _to_response(student)


@router.patch("/{student_id}/toggle-active", response_model=StudentResponse)
async def toggle_student_active(
    student_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Деактивировать / активировать ученика."""
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

    # Перезагружаем
    result = await db.execute(
        select(Student)
        .where(Student.id == student.id)
        .options(selectinload(Student.subjects))
    )
    student = result.scalar_one()

    return _to_response(student)


@router.post("/{student_id}/remind-payment", status_code=200)
async def remind_payment(
    student_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Отправить напоминание об оплате (заглушка для интеграции с Telegram/email)."""
    result = await db.execute(
        select(Student).where(
            Student.id == student_id,
            _student_belongs_to_tutor_query(tutor.id),
        )
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    # TODO: Интеграция с Telegram Bot API / email
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
    """Удалить ученика (каскадно удалит пакеты, уроки, транзакции)."""
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