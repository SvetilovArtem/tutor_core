import enum
from datetime import datetime
from decimal import Decimal
from sqlalchemy import Integer, String, DateTime, Numeric, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base

class TransactionType(enum.Enum):
    PACKAGE_PAYMENT = "PACKAGE_PAYMENT"
    LESSON_DEBIT = "LESSON_DEBIT"
    LESSON_REFUND = "LESSON_REFUND"
    MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT"   
    MANUAL_DEDUCTION = "MANUAL_DEDUCTION" 

class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(Integer, ForeignKey("students.id"), nullable=False, index=True)
    package_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("packages.id"), nullable=True)
    lesson_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("lessons.id"), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    type: Mapped[TransactionType] = mapped_column(SAEnum(TransactionType), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    comment: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_by: Mapped[str] = mapped_column(String(30), default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)