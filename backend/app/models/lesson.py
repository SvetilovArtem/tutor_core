from datetime import datetime
from decimal import Decimal
from sqlalchemy import Integer, String, DateTime, Boolean, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tutor_id: Mapped[int] = mapped_column(Integer, ForeignKey("tutors.id"), nullable=False, index=True)
    schedule_rule_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("schedule_rules.id"), nullable=True)
    exception_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("schedule_exceptions.id"), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(100), nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="SCHEDULED")  # SCHEDULED|COMPLETED|CANCELLED
    meeting_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    homework_text: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    tutor_notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    materials_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    recording_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    max_students: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    lesson_students: Mapped[list["LessonStudent"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    homework_attachments: Mapped[list["HomeworkAttachment"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class LessonStudent(Base):
    __tablename__ = "lesson_students"

    lesson_id: Mapped[int] = mapped_column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("students.id"), primary_key=True)
    package_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("packages.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="SCHEDULED")  # SCHEDULED|PRESENT|ABSENT|LATE|EXCUSED|CANCELLED
    homework_done: Mapped[bool] = mapped_column(Boolean, default=False)
    price_charged: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    transaction_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("transactions.id"), nullable=True)
    lesson: Mapped["Lesson"] = relationship(back_populates="lesson_students")

    is_paid: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    transaction: Mapped["Transaction"] = relationship()