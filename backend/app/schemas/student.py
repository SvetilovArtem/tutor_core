from datetime import date
from decimal import Decimal
from pydantic import BaseModel, Field

class StudentSubjectCreate(BaseModel):
    subject: str = Field(..., min_length=1, max_length=100)
    price_per_lesson: Decimal = Field(..., ge=0)

class StudentSubjectResponse(BaseModel):
    subject: str
    price_per_lesson: Decimal

    class Config:
        from_attributes = True

class StudentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    parent_id: int | None = None
    phone: str | None = None
    email: str | None = None
    telegram_id: int | None = None
    birth_date: date | None = None
    notes: str | None = None
    subjects: list[StudentSubjectCreate] = Field(default_factory=list)

class StudentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    parent_id: int | None = None
    phone: str | None = None
    email: str | None = None
    telegram_id: int | None = None
    birth_date: date | None = None
    notes: str | None = None
    is_active: bool | None = None
    subjects: list[StudentSubjectCreate] | None = None 

class StudentResponse(BaseModel):
    id: int
    name: str
    parent_id: int | None = None
    phone: str | None = None
    email: str | None = None
    telegram_id: int | None = None
    birth_date: str | None = None
    notes: str | None = None
    is_active: bool = True
    subjects: list[StudentSubjectResponse] = [] 
    balance: Decimal = Decimal("0")
    invite_code: str | None = None

    class Config:
        from_attributes = True