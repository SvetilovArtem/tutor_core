from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, Field


class StudentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    parent_id: int | None = None
    phone: str | None = None
    email: str | None = None
    telegram_id: int | None = None
    birth_date: date | None = None
    base_price: Decimal = Field(default=Decimal("25.00"), ge=0)
    notes: str | None = None
    subjects: list[str] = Field(default_factory=list)


class StudentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    parent_id: int | None = None
    phone: str | None = None
    email: str | None = None
    telegram_id: int | None = None
    birth_date: date | None = None
    base_price: Decimal | None = Field(None, ge=0)
    notes: str | None = None
    is_active: bool | None = None
    subjects: list[str] | None = None


class StudentResponse(BaseModel):
    id: int
    name: str
    parent_id: int | None = None
    phone: str | None = None
    telegram_id: int | None = None
    birth_date: str | None = None
    base_price: Decimal = Decimal("25.00")
    notes: str | None = None
    is_active: bool = True
    subjects: list[str] = []
    balance: Decimal = Decimal("0")

    class Config:
        from_attributes = True