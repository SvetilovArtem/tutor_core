from decimal import Decimal
from sqlalchemy import Integer, String, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base

class StudentSubject(Base):
    __tablename__ = "student_subjects"

    student_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("students.id", ondelete="CASCADE"), primary_key=True
    )
    subject: Mapped[str] = mapped_column(String(100), primary_key=True)
    price_per_lesson: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False) 