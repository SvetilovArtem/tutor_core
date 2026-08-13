"""Валидация пересечений расписания."""

from datetime import date, time as dt_time

from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.lesson import Lesson
from app.models.schedule import ScheduleRule
from app.models.schedule_rule_student import ScheduleRuleStudent


async def check_lesson_time_conflict(
    db: AsyncSession,
    tutor_id: int,
    start_at,
    end_at,
    exclude_lesson_id: int | None = None,
) -> Lesson | None:
    """
    Проверить пересечение по времени для индивидуальных занятий.
    Групповые уроки (>1 ученика) не считаются конфликтом.
    Отменённые уроки не учитываются.
    """
    query = (
        select(Lesson)
        .where(
            Lesson.tutor_id == tutor_id,
            Lesson.start_at < end_at,
            Lesson.end_at > start_at,
            Lesson.status != "CANCELLED",
        )
        .options(selectinload(Lesson.lesson_students))
    )
    if exclude_lesson_id:
        query = query.where(Lesson.id != exclude_lesson_id)

    result = await db.execute(query)
    conflicts = result.scalars().all()

    for conflict in conflicts:
        # Индивидуальный урок (ровно 1 ученик) — конфликт
        if len(conflict.lesson_students) == 1:
            return conflict

    return None


def _parse_time_to_minutes(t) -> int:
    """Парсит время (str, time, timedelta) в минуты от начала дня."""
    if isinstance(t, str):
        parts = t.split(":")
        return int(parts[0]) * 60 + int(parts[1])
    elif isinstance(t, dt_time):
        return t.hour * 60 + t.minute
    elif hasattr(t, "seconds"):
        return t.seconds // 60
    else:
        return int(t)


async def check_rule_time_conflict(
    db: AsyncSession,
    tutor_id: int,
    weekday: int,
    start_time,
    duration_minutes: int,
    student_ids: list[int],
    effective_from: date | None,
    effective_to: date | None,
    exclude_rule_id: int | None = None,
) -> ScheduleRule | None:
    """
    Проверить пересечение правил расписания.
    Конфликт только если ОБА правила индивидуальные (ровно 1 ученик).
    Групповые (>1 ученика) могут пересекаться с чем угодно.
    """
    # Если новое правило — групповое, конфликтов нет
    if len(student_ids) != 1:
        return None

    new_start_minutes = _parse_time_to_minutes(start_time)
    new_end_minutes = new_start_minutes + duration_minutes

    query = select(ScheduleRule).where(
        ScheduleRule.tutor_id == tutor_id,
        ScheduleRule.weekday == weekday,
    )
    if exclude_rule_id:
        query = query.where(ScheduleRule.id != exclude_rule_id)

    if effective_from and effective_to:
        query = query.where(
            or_(
                and_(
                    ScheduleRule.effective_from <= effective_to,
                    ScheduleRule.effective_to >= effective_from,
                ),
                ScheduleRule.effective_to.is_(None),
            )
        )
    elif effective_from:
        query = query.where(
            or_(
                ScheduleRule.effective_from <= effective_from,
                ScheduleRule.effective_to.is_(None),
            )
        )

    result = await db.execute(query)
    existing_rules = result.scalars().all()

    for rule in existing_rules:
        ex_start_minutes = _parse_time_to_minutes(rule.start_time)
        ex_end_minutes = ex_start_minutes + rule.duration_minutes

        if new_start_minutes < ex_end_minutes and new_end_minutes > ex_start_minutes:
            # Временное пересечение есть. Проверяем количество учеников.
            count_result = await db.execute(
                select(func.count()).where(ScheduleRuleStudent.rule_id == rule.id)
            )
            student_count = count_result.scalar() or 0

            # Конфликт только если существующее правило тоже индивидуальное
            if student_count == 1:
                return rule

    return None