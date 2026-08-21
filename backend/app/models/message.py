from datetime import datetime
from sqlalchemy import Integer, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database.session import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Отправитель
    from_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "tutor", "student", "parent"
    from_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    
    # Получатель
    to_type: Mapped[str] = mapped_column(String(20), nullable=False)
    to_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    
    # Содержимое
    text: Mapped[str] = mapped_column(Text, nullable=False)
    reply_to_message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    # Статус
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Метаданные
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, index=True)