"""Генерация уроков из ScheduleRule + ScheduleException."""

from datetime import date, timedelta, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.schedule import ScheduleRule, ScheduleException
from app.models.lesson import Lesson, LessonStudent


async def generate_lessons(
    db: AsyncSession,
    tutor_id: int,
    date_from: date,
    date_to: date,
) -> dict:
    """
    Генерирует уроки на диапазон дат по правилам расписания.
    Возвращает {"created": N, "skipped": M}.
    Идемпотентна: не создаёт дубликаты по времени, даже если урок уже создан вручную.
    Поддерживает индивидуальные (1 ученик) и групповые (>1 ученика) занятия.
    """
    # Загружаем правила с учениками
    rules_result = await db.execute(
        select(ScheduleRule)
        .where(
            ScheduleRule.tutor_id == tutor_id,
            ScheduleRule.is_active == True,
            ScheduleRule.effective_from <= date_to,
        )
        .options(selectinload(ScheduleRule.students))
    )
    rules = rules_result.scalars().all()

    rule_ids = [r.id for r in rules]
    exceptions_map: dict[int, dict[date, ScheduleException]] = {}
    if rule_ids:
        exc_result = await db.execute(
            select(ScheduleException).where(
                ScheduleException.rule_id.in_(rule_ids),
                ScheduleException.date >= date_from,
                ScheduleException.date <= date_to,
            )
        )
        for exc in exc_result.scalars().all():
            exceptions_map.setdefault(exc.rule_id, {})[exc.date] = exc

    created = 0
    skipped = 0

    for rule in rules:
        if rule.effective_from > date_to:
            continue
        effective_start = max(rule.effective_from, date_from)
        effective_end = min(rule.effective_to, date_to) if rule.effective_to else date_to

        current = effective_start
        while current <= effective_end:
            if current.weekday() != rule.weekday:
                current += timedelta(days=1)
                continue

            rule_exceptions = exceptions_map.get(rule.id, {})
            exception = rule_exceptions.get(current)

            if exception and exception.type == "SKIP":
                skipped += 1
                current += timedelta(days=1)
                continue

            if exception and exception.type == "ADD":
                start_t = exception.start_time or rule.start_time
                dur = exception.duration_minutes or rule.duration_minutes
            else:
                start_t = rule.start_time
                dur = rule.duration_minutes

            start_at = datetime.combine(current, start_t)
            end_at = start_at + timedelta(minutes=dur)

            # ИСПРАВЛЕНО: Проверяем наличие урока у репетитора в это время,
            # НЕ привязываясь к schedule_rule_id. Это предотвращает дубликаты,
            # если урок уже существует (например, был создан вручную).
            existing = await db.execute(
                select(Lesson).where(
                    Lesson.tutor_id == tutor_id,
                    Lesson.start_at == start_at,
                )
            )
            
            if existing.scalar_one_or_none():
                skipped += 1
                current += timedelta(days=1)
                continue

            lesson = Lesson(
                tutor_id=tutor_id,
                schedule_rule_id=rule.id,
                exception_id=exception.id if exception else None,
                start_at=start_at,
                end_at=end_at,
                status="SCHEDULED",
                max_students=len(rule.students) if rule.students else None,
            )
            db.add(lesson)
            await db.flush()

            # Создаем связи для ВСЕХ учеников в правиле (группа или индивидуальный)
            for student in rule.students:
                ls = LessonStudent(
                    lesson_id=lesson.id,
                    student_id=student.id,
                    status="SCHEDULED",
                )
                db.add(ls)

            created += 1
            current += timedelta(days=1)

    await db.commit()
    return {"created": created, "skipped": skipped}