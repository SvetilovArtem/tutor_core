"""Запросы на отмену занятий."""

from datetime import datetime
from sqlalchemy import Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


class CancellationRequest(Base):
    __tablename__ = "cancellation_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lesson_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PENDING"
    )  # PENDING | APPROVED | REJECTED
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tutors.id"), nullable=True
    )
    tutor_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    lesson = relationship("Lesson")
    student = relationship("Student")

    def __repr__(self):
        return f"<CancellationRequest {self.id}: lesson={self.lesson_id}, status={self.status}>"