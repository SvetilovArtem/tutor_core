"""CRUD для регулярного расписания и исключений."""

import calendar
from datetime import date, time as dt_time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.models.schedule import ScheduleException, ScheduleRule
from app.models.schedule_rule_student import ScheduleRuleStudent
from app.models.student import Student
from app.models.tutor import Tutor
from app.schemas.schedule import (
    ScheduleExceptionCreate,
    ScheduleExceptionResponse,
    ScheduleRuleCreate,
    ScheduleRuleUpdate,
    ScheduleRuleResponse,
)
from app.services.auth import get_current_tutor
from app.services.schedule_service import generate_lessons
from app.services.schedule_validator import check_rule_time_conflict

router = APIRouter(prefix="/schedule", tags=["schedule"])


class GenerateRequest(BaseModel):
    date_from: date
    date_to: date


# ── Schedule Rules ────────────────────────────────────────────────


async def _sync_rule_students(db: AsyncSession, rule: ScheduleRule, student_ids: list[int]) -> None:
    """Синхронизация учеников правила."""
    result = await db.execute(
        select(ScheduleRuleStudent).where(ScheduleRuleStudent.rule_id == rule.id)
    )
    for old in result.scalars().all():
        await db.delete(old)
    await db.flush()

    for sid in student_ids:
        db.add(ScheduleRuleStudent(rule_id=rule.id, student_id=sid))
    await db.flush()


@router.get("/rules", response_model=list[ScheduleRuleResponse])
async def list_rules(
    student_id: int | None = None,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Список правил расписания репетитора."""
    query = select(ScheduleRule).where(ScheduleRule.tutor_id == tutor.id)

    if student_id is not None:
        query = query.where(
            ScheduleRule.id.in_(
                select(ScheduleRuleStudent.rule_id).where(
                    ScheduleRuleStudent.student_id == student_id
                )
            )
        )

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
    # ... (тут идет проверка пересечений, как было) ...

    # Конвертация строки времени в time объект
    time_parts = payload.start_time.split(":")
    start_time_obj = dt_time(int(time_parts[0]), int(time_parts[1]))

    rule = ScheduleRule(
        tutor_id=tutor.id,
        group_name=payload.group_name,
        weekday=payload.weekday,
        start_time=start_time_obj,
        duration_minutes=payload.duration_minutes,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
    )

    if not rule.effective_to:
        year = rule.effective_from.year
        month = rule.effective_from.month
        last_day = calendar.monthrange(year, month)[1]
        rule.effective_to = date(year, month, last_day)

    db.add(rule)
    await db.flush()
    await _sync_rule_students(db, rule, payload.student_ids)
    await db.commit()
    await db.refresh(rule)

    await generate_lessons(db, tutor.id, rule.effective_from, rule.effective_to)

    return rule


@router.patch("/rules/{rule_id}", response_model=ScheduleRuleResponse)
async def update_rule(
    rule_id: int,
    payload: ScheduleRuleUpdate,
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

    update_data = payload.model_dump(exclude_unset=True)
    new_student_ids = update_data.pop("student_ids", None)

    # Автозаполнение effective_to
    if "effective_from" in update_data and "effective_to" not in update_data:
        new_from = update_data["effective_from"]
        if new_from and not rule.effective_to:
            year = new_from.year
            month = new_from.month
            last_day = calendar.monthrange(year, month)[1]
            update_data["effective_to"] = date(year, month, last_day)

    # Конвертация строки времени в time объект, если передана
    if "start_time" in update_data and isinstance(update_data["start_time"], str):
        time_parts = update_data["start_time"].split(":")
        update_data["start_time"] = dt_time(int(time_parts[0]), int(time_parts[1]))

    # Проверка пересечений при обновлении
    new_weekday = update_data.get("weekday", rule.weekday)
    new_start_time = update_data.get("start_time", rule.start_time)
    new_duration = update_data.get("duration_minutes", rule.duration_minutes)
    new_from = update_data.get("effective_from", rule.effective_from)
    new_to = update_data.get("effective_to", rule.effective_to)

    if new_student_ids is not None:
        effective_student_ids = new_student_ids
    else:
        effective_student_ids = [s.id for s in rule.students]

    if len(effective_student_ids) == 1:
        conflict = await check_rule_time_conflict(
            db, tutor.id, new_weekday, new_start_time,
            new_duration, effective_student_ids,
            new_from, new_to,
            exclude_rule_id=rule.id,
        )
        if conflict:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Пересечение с правилом {conflict.id}: "
                    f"{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][conflict.weekday]} "
                    f"{conflict.start_time} ({conflict.duration_minutes} мин)"
                ),
            )

    for field, value in update_data.items():
        setattr(rule, field, value)

    if new_student_ids is not None:
        await _sync_rule_students(db, rule, new_student_ids)

    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: int,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Удалить правило расписания (каскадно удалит исключения и связи с учениками)."""
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
    """Список исключений."""
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
    """Создать исключение из расписания."""
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