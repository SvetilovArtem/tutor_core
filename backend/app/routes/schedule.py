"""CRUD для регулярного расписания и исключений."""

import calendar
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.models.schedule import ScheduleException, ScheduleRule
from app.models.tutor import Tutor
from app.schemas.schedule import (
    ScheduleExceptionCreate,
    ScheduleExceptionResponse,
    ScheduleRuleCreate,
    ScheduleRuleResponse,
)
from app.services.auth import get_current_tutor
from app.services.schedule_service import generate_lessons

router = APIRouter(prefix="/schedule", tags=["schedule"])


# ── Схемы для генерации уроков ────────────────────────────────────

class GenerateRequest(BaseModel):
    date_from: date
    date_to: date


# ── Schedule Rules ────────────────────────────────────────────────

@router.get("/rules", response_model=list[ScheduleRuleResponse])
async def list_rules(
    student_id: int | None = None,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Список правил расписания репетитора."""
    query = select(ScheduleRule).where(ScheduleRule.tutor_id == tutor.id)
    if student_id is not None:
        query = query.where(ScheduleRule.student_id == student_id)
    query = query.order_by(ScheduleRule.weekday, ScheduleRule.start_time)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/rules", response_model=ScheduleRuleResponse, status_code=201)
async def create_rule(
    payload: ScheduleRuleCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Создать правило регулярного расписания."""
    rule = ScheduleRule(
        tutor_id=tutor.id,
        **payload.model_dump(),
    )

    # Если конец периода не указан — ставим последний день месяца от effective_from
    if not rule.effective_to:
        year = rule.effective_from.year
        month = rule.effective_from.month
        last_day = calendar.monthrange(year, month)[1]
        rule.effective_to = date(year, month, last_day)

    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch("/rules/{rule_id}", response_model=ScheduleRuleResponse)
async def update_rule(
    rule_id: int,
    payload: ScheduleRuleCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Обновить правило расписания."""
    result = await db.execute(
        select(ScheduleRule).where(
            ScheduleRule.id == rule_id,
            ScheduleRule.tutor_id == tutor.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Правило не найдено")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)

    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Удалить правило расписания (каскадно удалит исключения)."""
    result = await db.execute(
        select(ScheduleRule).where(
            ScheduleRule.id == rule_id,
            ScheduleRule.tutor_id == tutor.id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Правило не найдено")

    await db.delete(rule)
    await db.commit()


# ── Schedule Exceptions ───────────────────────────────────────────

@router.get("/exceptions", response_model=list[ScheduleExceptionResponse])
async def list_exceptions(
    rule_id: int | None = None,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Список исключений. Опциональная фильтрация по правилу."""
    query = (
        select(ScheduleException)
        .join(ScheduleRule, ScheduleRule.id == ScheduleException.rule_id)
        .where(ScheduleRule.tutor_id == tutor.id)
    )
    if rule_id is not None:
        query = query.where(ScheduleException.rule_id == rule_id)
    query = query.order_by(ScheduleException.date)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/exceptions", response_model=ScheduleExceptionResponse, status_code=201)
async def create_exception(
    payload: ScheduleExceptionCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """
    Создать исключение из расписания.
    SKIP — отменить занятие в конкретный день.
    ADD  — добавить дополнительное занятие.
    """
    result = await db.execute(
        select(ScheduleRule).where(
            ScheduleRule.id == payload.rule_id,
            ScheduleRule.tutor_id == tutor.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Правило не найдено")

    if payload.type == "ADD":
        if not payload.start_time or not payload.duration_minutes:
            raise HTTPException(
                status_code=400,
                detail="Для типа ADD обязательны start_time и duration_minutes",
            )

    exception = ScheduleException(
        created_by=f"tutor:{tutor.id}",
        **payload.model_dump(),
    )
    db.add(exception)
    await db.commit()
    await db.refresh(exception)
    return exception


@router.delete("/exceptions/{exception_id}", status_code=204)
async def delete_exception(
    exception_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Удалить исключение."""
    result = await db.execute(
        select(ScheduleException)
        .join(ScheduleRule, ScheduleRule.id == ScheduleException.rule_id)
        .where(
            ScheduleException.id == exception_id,
            ScheduleRule.tutor_id == tutor.id,
        )
    )
    exc = result.scalar_one_or_none()
    if not exc:
        raise HTTPException(status_code=404, detail="Исключение не найдено")

    await db.delete(exc)
    await db.commit()


# ── Генерация уроков ──────────────────────────────────────────────

@router.post("/generate", status_code=201)
async def generate_lessons_endpoint(
    payload: GenerateRequest,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Сгенерировать уроки из расписания на диапазон дат."""
    result = await generate_lessons(db, tutor.id, payload.date_from, payload.date_to)
    return result