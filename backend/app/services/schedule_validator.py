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
    Проверить, есть ли у репетитора другие уроки в это время.
    Репетитор физически может вести только ОДНО занятие в одно время.
    Возвращает конфликтующий урок или None.
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
    )
    if exclude_lesson_id:
        query = query.where(Lesson.id != exclude_lesson_id)

    result = await db.execute(query)
    conflict = result.scalars().first()
    return conflict


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
) -> dict | None:
    """
    Проверить пересечение правил расписания.
    Возвращает словарь с информацией о конфликте или None.
    
    Проверяет ДВА условия:
    1. Репетитор не может иметь два правила в одно время (любые: инд/группа).
    2. Ученики не могут быть заняты в двух правилах одновременно.
    """
    new_start_minutes = _parse_time_to_minutes(start_time)
    new_end_minutes = new_start_minutes + duration_minutes

    # ── ПРОВЕРКА 1: Репетитор не может вести два занятия одновременно ──
    tutor_rules_query = select(ScheduleRule).where(
        ScheduleRule.tutor_id == tutor_id,
        ScheduleRule.weekday == weekday,
    )
    if exclude_rule_id:
        tutor_rules_query = tutor_rules_query.where(ScheduleRule.id != exclude_rule_id)

    # Фильтр по пересечению периодов действия
    if effective_from and effective_to:
        tutor_rules_query = tutor_rules_query.where(
            or_(
                and_(
                    ScheduleRule.effective_from <= effective_to,
                    ScheduleRule.effective_to >= effective_from,
                ),
                ScheduleRule.effective_to.is_(None),
            )
        )
    elif effective_from:
        tutor_rules_query = tutor_rules_query.where(
            or_(
                ScheduleRule.effective_from <= effective_from,
                ScheduleRule.effective_to.is_(None),
            )
        )

    result = await db.execute(tutor_rules_query)
    existing_rules = result.scalars().all()

    for rule in existing_rules:
        ex_start_minutes = _parse_time_to_minutes(rule.start_time)
        ex_end_minutes = ex_start_minutes + rule.duration_minutes

        # Проверка временного пересечения
        if new_start_minutes < ex_end_minutes and new_end_minutes > ex_start_minutes:
            return {
                "rule": rule,
                "reason": "tutor_busy",
                "message": (
                    f"В это время у вас уже есть занятие (правило {rule.id}): "
                    f"{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][rule.weekday]} "
                    f"{rule.start_time} ({rule.duration_minutes} мин)"
                ),
            }

    # ── ПРОВЕРКА 2: Ученики не могут быть в двух местах одновременно ──
    if student_ids:
        # Ищем все правила, где есть хотя бы один из наших учеников
        students_in_conflict_query = (
            select(ScheduleRule)
            .join(ScheduleRuleStudent, ScheduleRuleStudent.rule_id == ScheduleRule.id)
            .where(
                ScheduleRule.tutor_id == tutor_id,
                ScheduleRule.weekday == weekday,
                ScheduleRuleStudent.student_id.in_(student_ids),
            )
        )
        if exclude_rule_id:
            students_in_conflict_query = students_in_conflict_query.where(
                ScheduleRule.id != exclude_rule_id
            )

        # Фильтр по пересечению периодов действия
        if effective_from and effective_to:
            students_in_conflict_query = students_in_conflict_query.where(
                or_(
                    and_(
                        ScheduleRule.effective_from <= effective_to,
                        ScheduleRule.effective_to >= effective_from,
                    ),
                    ScheduleRule.effective_to.is_(None),
                )
            )
        elif effective_from:
            students_in_conflict_query = students_in_conflict_query.where(
                or_(
                    ScheduleRule.effective_from <= effective_from,
                    ScheduleRule.effective_to.is_(None),
                )
            )

        result = await db.execute(students_in_conflict_query)
        student_conflict_rules = result.scalars().all()

        for rule in student_conflict_rules:
            ex_start_minutes = _parse_time_to_minutes(rule.start_time)
            ex_end_minutes = ex_start_minutes + rule.duration_minutes

            if new_start_minutes < ex_end_minutes and new_end_minutes > ex_start_minutes:
                return {
                    "rule": rule,
                    "reason": "student_busy",
                    "message": (
                        f"Один или несколько учеников уже заняты в это время "
                        f"(правило {rule.id}): "
                        f"{['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][rule.weekday]} "
                        f"{rule.start_time} ({rule.duration_minutes} мин)"
                    ),
                }

    return None