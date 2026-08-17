from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import Boolean, Integer, Numeric, String, Date, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base

class Student(Base):
    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    parent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("parents.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(100), nullable=True)  
    telegram_id: Mapped[int | None] = mapped_column(Integer, unique=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    base_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("25.00"), server_default="25.00",
    )

    parent: Mapped["Parent | None"] = relationship(back_populates="students")
    subjects: Mapped[list["StudentSubject"]] = relationship(
        cascade="all, delete-orphan",
        lazy="selectin",
    )