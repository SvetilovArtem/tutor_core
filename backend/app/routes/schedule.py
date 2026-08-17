"""CRUD для регулярного расписания и исключений."""

import calendar
from datetime import date, time as dt_time

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
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
from app.schemas.pagination import PaginatedResponse
from app.services.auth import get_current_tutor
from app.services.schedule_service import generate_lessons
from app.services.schedule_validator import check_rule_time_conflict

router = APIRouter(prefix="/schedule", tags=["schedule"])


class GenerateRequest(BaseModel):
    date_from: date
    date_to: date


# ── МОДЕЛЬ ОТВЕТА С ПАГИНАЦИЕЙ ──────────────────────────────────

class ScheduleRulePaginatedResponse(PaginatedResponse[ScheduleRuleResponse]):
    pass


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


@router.get("/rules", response_model=ScheduleRulePaginatedResponse)
async def list_rules(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),  # Дефолт 10 для расписания
    student_id: int | None = None,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Список правил расписания репетитора."""
    # 1. Запрос для подсчета общего количества
    count_query = select(func.count(ScheduleRule.id)).where(ScheduleRule.tutor_id == tutor.id)
    
    # 2. Основной запрос для получения данных
    query = select(ScheduleRule).where(ScheduleRule.tutor_id == tutor.id)

    if student_id is not None:
        subq = select(ScheduleRuleStudent.rule_id).where(ScheduleRuleStudent.student_id == student_id)
        count_query = count_query.where(ScheduleRule.id.in_(subq))
        query = query.where(ScheduleRule.id.in_(subq))

    # 3. Считаем общее количество и страницы
    total = (await db.execute(count_query)).scalar() or 0
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    # 4. Применяем пагинацию (смещение и лимит)
    query = query.order_by(ScheduleRule.weekday, ScheduleRule.start_time).offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(query)
    items = result.scalars().all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages
    }


@router.post("/rules", response_model=ScheduleRuleResponse, status_code=201)
async def create_rule(
    payload: ScheduleRuleCreate,
    tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    """Создать правило регулярного расписания."""
    # Проверка пересечений (для любых правил: индивидуальных и групповых)
    conflict_info = await check_rule_time_conflict(
        db, tutor.id, payload.weekday, payload.start_time,
        payload.duration_minutes, payload.student_ids,
        payload.effective_from, payload.effective_to,
    )
    if conflict_info:
        raise HTTPException(
            status_code=409,
            detail=conflict_info["message"],
        )

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

    # ── АВТОГЕНЕРАЦИЯ УРОКОВ ──────────────────────────────────────
    # Генерируем уроки ровно на тот период, который задан в правиле.
    # Функция идемпотентна: дубликаты не создаст.
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

    # Определяем актуальный список учеников
    if new_student_ids is not None:
        effective_student_ids = new_student_ids
    else:
        effective_student_ids = [s.id for s in rule.students]

    # Проверка пересечений при обновлении (для любых правил)
    new_weekday = update_data.get("weekday", rule.weekday)
    new_start_time = update_data.get("start_time", rule.start_time)
    new_duration = update_data.get("duration_minutes", rule.duration_minutes)
    new_from = update_data.get("effective_from", rule.effective_from)
    new_to = update_data.get("effective_to", rule.effective_to)

    conflict_info = await check_rule_time_conflict(
        db, tutor.id, new_weekday, new_start_time,
        new_duration, effective_student_ids,
        new_from, new_to,
        exclude_rule_id=rule.id,
    )
    if conflict_info:
        raise HTTPException(
            status_code=409,
            detail=conflict_info["message"],
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