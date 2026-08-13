"""Связь ScheduleRule <-> Student (многие-ко-многим) для групповых занятий."""

from sqlalchemy import Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class ScheduleRuleStudent(Base):
    __tablename__ = "schedule_rule_students"

    rule_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("schedule_rules.id", ondelete="CASCADE"), primary_key=True
    )
    student_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("students.id", ondelete="CASCADE"), primary_key=True
    )
    
