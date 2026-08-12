"""JWT-токены и получение текущего репетитора из запроса."""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database.session import get_db
from app.models.tutor import Tutor

security = HTTPBearer()


def create_access_token(tutor_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(tutor_id), "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def get_current_tutor(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Tutor:
    """Извлекает репетитора из JWT-токена. Используется как зависимость в роутах."""
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        tutor_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Невалидный токен")

    result = await db.execute(select(Tutor).where(Tutor.id == tutor_id))
    tutor = result.scalar_one_or_none()
    if not tutor or not tutor.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Репетитор не найден или заблокирован")

    return tutor