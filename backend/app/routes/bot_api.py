"""API endpoints для Telegram-бота учеников."""

import secrets
import string
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database.session import get_db
from app.models.student import Student
from app.models.student_invite import StudentInviteCode
from app.models.lesson import Lesson, LessonStudent
from app.models.transaction import Transaction
from app.services.balance_service import get_student_balance

router = APIRouter(prefix="/api/bot", tags=["bot"])


BOT_TOKEN = "your-bot-token-here"  # реальный токен от @BotFather


def verify_bot_token(x_bot_token: str = Header(...)) -> None:
    """Проверка токена бота."""
    if x_bot_token != BOT_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid bot token")


def generate_invite_code() -> str:
    """Генерация случайного кода формата TUT-XXXX."""
    chars = string.ascii_uppercase + string.digits
    random_part = ''.join(secrets.choice(chars) for _ in range(4))
    return f"TUT-{random_part}"


@router.post("/invite/{student_id}")
async def create_invite_code(
    student_id: int,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Создать одноразовый код привязки для ученика."""
    # Проверяем, что ученик существует
    result = await db.execute(select(Student).where(Student.id == student_id))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Аннулируем старые неиспользованные коды
    old_codes = await db.execute(
        select(StudentInviteCode).where(
            StudentInviteCode.student_id == student_id,
            StudentInviteCode.is_used == False
        )
    )
    for code in old_codes.scalars().all():
        code.is_used = True
    
    # Создаём новый код
    code = StudentInviteCode(
        student_id=student_id,
        code=generate_invite_code(),
        expires_at=datetime.utcnow() + timedelta(hours=24),
    )
    db.add(code)
    await db.commit()
    await db.refresh(code)
    
    return {
        "code": code.code,
        "expires_at": code.expires_at.isoformat(),
        "student_name": student.name,
    }


@router.post("/subscribe")
async def subscribe_student(
    telegram_id: int,
    code: str,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Привязать Telegram-аккаунт к ученику по коду."""
    # Ищем код
    result = await db.execute(
        select(StudentInviteCode).where(
            StudentInviteCode.code == code,
            StudentInviteCode.is_used == False,
            StudentInviteCode.expires_at > datetime.utcnow(),
        )
    )
    invite = result.scalar_one_or_none()
    
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or expired code")
    
    # Привязываем telegram_id к ученику
    student = await db.get(Student, invite.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    student.telegram_id = telegram_id
    invite.is_used = True
    
    await db.commit()
    
    return {
        "success": True,
        "student_name": student.name,
        "message": f"Вы успешно привязаны к аккаунту ученика {student.name}",
    }


@router.get("/student/{telegram_id}")
async def get_student_info(
    telegram_id: int,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Получить информацию об ученике по telegram_id."""
    result = await db.execute(
        select(Student).where(Student.telegram_id == telegram_id)
    )
    student = result.scalar_one_or_none()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found. Please use /start with invite code.")
    
    balance = await get_student_balance(db, student.id)
    
    return {
        "id": student.id,
        "name": student.name,
        "balance": float(balance),
        "phone": student.phone,
        "subjects": [ss.subject for ss in student.subjects],
    }


@router.get("/student/{telegram_id}/lessons")
async def get_student_lessons(
    telegram_id: int,
    limit: int = 5,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Получить ближайшие уроки ученика."""
    result = await db.execute(
        select(Student).where(Student.telegram_id == telegram_id)
    )
    student = result.scalar_one_or_none()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Ближайшие запланированные уроки
    lessons_result = await db.execute(
        select(Lesson)
        .join(LessonStudent, Lesson.id == LessonStudent.lesson_id)
        .where(
            LessonStudent.student_id == student.id,
            Lesson.status == "SCHEDULED",
            Lesson.start_at >= datetime.utcnow(),
        )
        .order_by(Lesson.start_at.asc())
        .limit(limit)
    )
    lessons = lessons_result.scalars().all()
    
    return {
        "lessons": [
            {
                "id": l.id,
                "start_at": l.start_at.isoformat(),
                "status": l.status,
                "homework": l.homework_text,
            }
            for l in lessons
        ]
    }


@router.get("/student/{telegram_id}/transactions")
async def get_student_transactions(
    telegram_id: int,
    limit: int = 10,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Получить историю транзакций ученика."""
    result = await db.execute(
        select(Student).where(Student.telegram_id == telegram_id)
    )
    student = result.scalar_one_or_none()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    transactions_result = await db.execute(
        select(Transaction)
        .where(Transaction.student_id == student.id)
        .order_by(Transaction.created_at.desc())
        .limit(limit)
    )
    transactions = transactions_result.scalars().all()
    
    return {
        "transactions": [
            {
                "id": t.id,
                "amount": float(t.amount),
                "type": t.type.value,
                "comment": t.comment,
                "created_at": t.created_at.isoformat(),
            }
            for t in transactions
        ]
    }