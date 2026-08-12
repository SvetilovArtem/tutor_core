from datetime import datetime
from decimal import Decimal
from sqlalchemy import Integer, String, DateTime, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class BalanceAuditLog(Base):
    __tablename__ = "balance_audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    old_balance: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    new_balance: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    delta: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    related_entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    related_entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[str] = mapped_column(String(30), default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)