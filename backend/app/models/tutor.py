from datetime import datetime
from sqlalchemy import Integer, String, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


class Tutor(Base):
    __tablename__ = "tutors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    telegram_id: Mapped[int | None] = mapped_column(Integer, unique=True, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subjects: Mapped[list] = mapped_column(JSON, default=list)
    timezone: Mapped[str] = mapped_column(String(50), default="Europe/Minsk")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    settings: Mapped["TutorSettings"] = relationship(back_populates="tutor", uselist=False, cascade="all, delete-orphan")


class TutorSettings(Base):
    __tablename__ = "tutor_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tutor_id: Mapped[int] = mapped_column(Integer, ForeignKey("tutors.id", ondelete="CASCADE"), unique=True)
    
    # Финансовые правила
    charge_on_absent: Mapped[bool] = mapped_column(Boolean, default=True)
    absent_grace_period_hours: Mapped[int] = mapped_column(Integer, default=24)
    late_cancel_fee_percent: Mapped[int] = mapped_column(Integer, default=100)
    allow_debt: Mapped[bool] = mapped_column(Boolean, default=True)
    max_debt_amount: Mapped[float | None] = mapped_column(nullable=True)
    debt_reminder_days: Mapped[list] = mapped_column(JSON, default=lambda: [3, 7, 14])
    
    # Уведомления
    remind_before_hours: Mapped[list] = mapped_column(JSON, default=lambda: [24, 2])
    send_homework_to_parent: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Расписание
    default_lesson_duration: Mapped[int] = mapped_column(Integer, default=60)
    buffer_between_lessons_min: Mapped[int] = mapped_column(Integer, default=15)
    working_hours: Mapped[dict] = mapped_column(JSON, default=dict)

    tutor: Mapped["Tutor"] = relationship(back_populates="settings")