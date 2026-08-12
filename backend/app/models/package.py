from datetime import datetime
from decimal import Decimal
from sqlalchemy import Integer, String, DateTime, ForeignKey, Numeric, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class Package(Base):
    __tablename__ = "packages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tutor_id: Mapped[int] = mapped_column(Integer, ForeignKey("tutors.id"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    total_lessons: Mapped[int] = mapped_column(Integer, nullable=False)
    remaining_lessons: Mapped[int] = mapped_column(Integer, nullable=False)
    price_per_lesson: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    payment_status: Mapped[str] = mapped_column(String(20), default="paid")