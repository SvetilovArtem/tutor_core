"""Схемы для учеников и родителей."""

from datetime import date
from pydantic import BaseModel, Field


class ParentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str | None = None
    telegram_id: int | None = None

    name: str = Field(min_length=2, max_length=100)
    parent_id: int | None = None
    phone: str | None = None
    telegram_id: int | None = None
    birth_date: date | None = None
    notes: str | None = None

class StudentUpdate(BaseModel):
    name: str | None = None
    parent_id: int | None = None
    phone: str | None = None
    telegram_id: int | None = None
    birth_date: date | None = None
    notes: str | None = None


class StudentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    parent_id: int | None = None
    phone: str | None = None
    telegram_id: int | None = None
    birth_date: str | None = None
    notes: str | None = None
    subjects: list[str] = Field(default_factory=list) 


class StudentResponse(BaseModel):
    id: int
    name: str
    parent_id: int | None
    phone: str | None
    telegram_id: int | None
    birth_date: str | None
    notes: str | None
    subjects: list[str] = []
    is_active: bool = True



    class Config:
        from_attributes = True