"""Запросы на отмену занятий."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.models.cancellation_request import CancellationRequest
from app.models.lesson import Lesson, LessonStudent
from app.models.student import Student
from app.models.tutor import Tutor
from app.schemas.cancellation import (
    CancellationRequestCreate,
    CancellationRequestResponse,
    CancellationResolve,
)
from app.services.auth import get_current_tutor

router = APIRouter(prefix="/cancellations", tags=["cancellations"])


@router.post("/", response_model=CancellationRequestResponse, status_code=201)
async def create_cancellation_request(
    payload: CancellationRequestCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Создать запрос на отмену урока (вызывается учеником через бота или ЛК).
    Урок должен быть в статусе SCHEDULED и не начаться.
    """
    # Проверяем урок
    result = await db.execute(
        select(Lesson).where(Lesson.id == payload.lesson_id)
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")

    if lesson.status != "SCHEDULED":
        raise HTTPException(
            status_code=400,
            detail=f"Нельзя отменить урок в статусе {lesson.status}"
        )

    if lesson.start_at <= datetime.utcnow():
        raise HTTPException(
            status_code=400,
            detail="Нельзя отменить урок, который уже начался"
        )

    # Проверяем, что ученик записан на урок
    result = await db.execute(
        select(LessonStudent).where(
            LessonStudent.lesson_id == payload.lesson_id,
            LessonStudent.student_id == payload.student_id,
        )
    )
    ls = result.scalar_one_or_none()
    if not ls:
        raise HTTPException(status_code=400, detail="Ученик не записан на этот урок")

    # Проверяем, нет ли уже активного запроса
    result = await db.execute(
        select(CancellationRequest).where(
            CancellationRequest.lesson_id == payload.lesson_id,
            CancellationRequest.student_id == payload.student_id,
            CancellationRequest.status == "PENDING",
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Запрос на отмену уже существует и ожидает подтверждения"
        )

    # Создаём запрос
    request = CancellationRequest(
        lesson_id=payload.lesson_id,
        student_id=payload.student_id,
        reason=payload.reason,
        status="PENDING",
    )
    db.add(request)
    await db.commit()
    await db.refresh(request)

    # TODO: отправить уведомление репетитору через Telegram-бот

    return await _enrich_request_response(request, db)


@router.get("/", response_model=list[CancellationRequestResponse])
async def list_cancellation_requests(
    status: str | None = None,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Список запросов на отмену для репетитора."""
    query = (
        select(CancellationRequest)
        .join(Lesson, Lesson.id == CancellationRequest.lesson_id)
        .where(Lesson.tutor_id == tutor.id)
    )
    if status:
        query = query.where(CancellationRequest.status == status)
    query = query.order_by(CancellationRequest.requested_at.desc())

    result = await db.execute(query)
    requests = result.scalars().all()

    return [await _enrich_request_response(r, db) for r in requests]


@router.post("/{request_id}/resolve", response_model=CancellationRequestResponse)
async def resolve_cancellation_request(
    request_id: int,
    payload: CancellationResolve,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """
    Репетитор подтверждает или отклоняет запрос на отмену.
    Если подтверждает → урок отменяется, баланс НЕ списывается.
    Если отклоняет → урок остаётся запланированным.
    """
    result = await db.execute(
        select(CancellationRequest).where(CancellationRequest.id == request_id)
    )
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Запрос не найден")

    if request.status != "PENDING":
        raise HTTPException(status_code=400, detail="Запрос уже обработан")

    # Проверяем, что урок принадлежит этому репетитору
    result = await db.execute(
        select(Lesson).where(
            Lesson.id == request.lesson_id,
            Lesson.tutor_id == tutor.id,
        )
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Урок не найден")

    request.resolved_at = datetime.utcnow()
    request.resolved_by = tutor.id
    request.tutor_comment = payload.comment

    if payload.approve:
        # Подтверждаем отмену
        request.status = "APPROVED"
        lesson.status = "CANCELLED"

        # Обновляем статус ученика на уроке
        result = await db.execute(
            select(LessonStudent).where(
                LessonStudent.lesson_id == lesson.id,
                LessonStudent.student_id == request.student_id,
            )
        )
        ls = result.scalar_one_or_none()
        if ls:
            ls.status = "CANCELLED"

        # Баланс НЕ списывается — урок отменён по запросу ученика

    else:
        # Отклоняем запрос
        request.status = "REJECTED"
        # Урок остаётся SCHEDULED

    await db.commit()
    await db.refresh(request)

    # TODO: отправить уведомление ученику через Telegram-бот

    return await _enrich_request_response(request, db)


async def _enrich_request_response(
    request: CancellationRequest, db: AsyncSession
) -> CancellationRequestResponse:
    """Добавляем имена и даты в ответ."""
    # Имя ученика
    result = await db.execute(
        select(Student).where(Student.id == request.student_id)
    )
    student = result.scalar_one_or_none()

    # Дата урока
    result = await db.execute(
        select(Lesson).where(Lesson.id == request.lesson_id)
    )
    lesson = result.scalar_one_or_none()

    return CancellationRequestResponse(
        id=request.id,
        lesson_id=request.lesson_id,
        student_id=request.student_id,
        student_name=student.name if student else None,
        lesson_start_at=lesson.start_at if lesson else None,
        reason=request.reason,
        status=request.status,
        requested_at=request.requested_at,
        resolved_at=request.resolved_at,
        tutor_comment=request.tutor_comment,
    )