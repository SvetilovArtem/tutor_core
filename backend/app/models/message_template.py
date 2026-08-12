from datetime import datetime
from sqlalchemy import Integer, String, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class MessageTemplate(Base):
    __tablename__ = "message_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tutor_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("tutors.id"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(30), nullable=False)  # LESSON_REMINDER|DEBT_REMINDER|HOMEWORK|CANCEL_CONFIRMATION
    channel: Mapped[str] = mapped_column(String(10), nullable=False)  # TG|EMAIL|SMS
    subject: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body: Mapped[str] = mapped_column(String(1000), nullable=False)
    variables: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)