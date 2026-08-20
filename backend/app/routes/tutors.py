from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.models.tutor import Tutor, TutorSettings
from app.schemas.tutor import (
    TutorRegisterRequest,
    TutorResponse,
    TokenResponse,
    PasswordLoginRequest,
    TutorProfileUpdate,
)
from app.services.auth import create_access_token, get_current_tutor
from app.services.password import hash_password, verify_password

router = APIRouter(prefix="/tutors", tags=["tutors"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register_tutor(payload: TutorRegisterRequest, db: AsyncSession = Depends(get_db)):
    if not payload.telegram_id and not payload.email:
        raise HTTPException(status_code=400, detail="Укажите telegram_id или email")

    if payload.email and not payload.password:
        raise HTTPException(status_code=400, detail="Для регистрации по email нужен пароль")

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
        
        existing_result = await db.execute(
            select(Tutor).where(Tutor.id == existing.id).options(selectinload(Tutor.settings))
        )
        existing_loaded = existing_result.scalar_one()
        
        token = create_access_token(existing_loaded.id)
        return TokenResponse(access_token=token, tutor=TutorResponse.model_validate(existing_loaded))

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
    
    result = await db.execute(
        select(Tutor).where(Tutor.id == tutor.id).options(selectinload(Tutor.settings))
    )
    new_tutor = result.scalar_one()

    token = create_access_token(new_tutor.id)
    return TokenResponse(access_token=token, tutor=TutorResponse.model_validate(new_tutor))


@router.post("/login", response_model=TokenResponse)
async def password_login(payload: PasswordLoginRequest, db: AsyncSession = Depends(get_db)):
  
    result = await db.execute(
        select(Tutor)
        .where(Tutor.email == payload.email.lower())
        .options(selectinload(Tutor.settings))
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
async def get_my_profile(
    current_tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Tutor)
        .where(Tutor.id == current_tutor.id)
        .options(selectinload(Tutor.settings))
    )
    tutor = result.scalar_one_or_none()
    return TutorResponse.model_validate(tutor)


@router.patch("/me", response_model=TutorResponse)
async def update_my_profile(
    payload: TutorProfileUpdate,
    current_tutor: Tutor = Depends(get_current_tutor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tutor)
        .where(Tutor.id == current_tutor.id)
        .options(selectinload(Tutor.settings))
    )
    tutor = result.scalar_one_or_none()
    
    if not tutor:
        raise HTTPException(status_code=404, detail="Репетитор не найден")

    update_data = payload.model_dump(exclude_unset=True)
    settings_data = update_data.pop("settings", None)

    if "slug" in update_data and update_data["slug"] != tutor.slug:
        existing_tutor = await db.execute(
            select(Tutor).where(
                Tutor.slug == update_data["slug"],
                Tutor.id != tutor.id
            )
        )
        if existing_tutor.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="Этот адрес страницы (slug) уже занят другим репетитором"
            )

    for field, value in update_data.items():
        setattr(tutor, field, value)

    if settings_data:
        if not tutor.settings:
            tutor.settings = TutorSettings(tutor_id=tutor.id)
            db.add(tutor.settings)
        
        for field, value in settings_data.items():
            setattr(tutor.settings, field, value)

    await db.commit()
    
    final_result = await db.execute(
        select(Tutor)
        .where(Tutor.id == tutor.id)
        .options(selectinload(Tutor.settings))
    )
    final_tutor = final_result.scalar_one()

    return TutorResponse.model_validate(final_tutor)