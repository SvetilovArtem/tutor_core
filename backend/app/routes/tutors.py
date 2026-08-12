from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database.session import get_db
from app.models.tutor import Tutor, TutorSettings
from app.schemas.tutor import (
    TutorRegisterRequest, TutorResponse, TokenResponse, PasswordLoginRequest,
)
from app.services.auth import create_access_token, get_current_tutor
from app.services.password import hash_password, verify_password

router = APIRouter(prefix="/tutors", tags=["tutors"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register_tutor(payload: TutorRegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Регистрация репетитора.
    Поддерживает: telegram_id, email+password, или оба сразу.
    """
    if not payload.telegram_id and not payload.email:
        raise HTTPException(status_code=400, detail="Укажите telegram_id или email")

    if payload.email and not payload.password:
        raise HTTPException(status_code=400, detail="Для регистрации по email нужен пароль")

    # Проверяем дубликаты
    conditions = []
    if payload.telegram_id:
        conditions.append(Tutor.telegram_id == payload.telegram_id)
    if payload.email:
        conditions.append(Tutor.email == payload.email.lower())

    result = await db.execute(select(Tutor).where(or_(*conditions)))
    existing = result.scalar_one_or_none()

    if existing:
        if not existing.is_active:
            raise HTTPException(status_code=403, detail="Аккаунт заблокирован")
        token = create_access_token(existing.id)
        return TokenResponse(access_token=token, tutor=TutorResponse.model_validate(existing))

    # Создаём нового
    tutor = Tutor(
        telegram_id=payload.telegram_id,
        email=payload.email.lower() if payload.email else None,
        password_hash=hash_password(payload.password) if payload.password else None,
        name=payload.name.strip(),
        phone=payload.phone,
        subjects=payload.subjects,
        timezone=payload.timezone,
    )
    db.add(tutor)
    await db.flush()
    db.add(TutorSettings(tutor_id=tutor.id))
    await db.commit()
    await db.refresh(tutor)

    token = create_access_token(tutor.id)
    return TokenResponse(access_token=token, tutor=TutorResponse.model_validate(tutor))


@router.post("/login", response_model=TokenResponse)
async def password_login(payload: PasswordLoginRequest, db: AsyncSession = Depends(get_db)):
    """Вход по email + пароль."""
    result = await db.execute(
        select(Tutor).where(Tutor.email == payload.email.lower())
    )
    tutor = result.scalar_one_or_none()

    if not tutor or not tutor.password_hash:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    if not verify_password(payload.password, tutor.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    if not tutor.is_active:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован")

    token = create_access_token(tutor.id)
    return TokenResponse(access_token=token, tutor=TutorResponse.model_validate(tutor))


@router.get("/me", response_model=TutorResponse)
async def get_my_profile(tutor: Tutor = Depends(get_current_tutor)):
    return TutorResponse.model_validate(tutor)