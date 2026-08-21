"""API endpoints для Telegram-бота учеников, родителей и репетиторов."""

import secrets
import string
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database.session import get_db
from app.models.tutor import Tutor
from app.models.student import Student
from app.models.lead import Lead
from app.models.message import Message
from app.models.parent import Parent
from app.models.lesson import Lesson, LessonStudent
from app.models.transaction import Transaction
from app.models.cancellation_request import CancellationRequest
from app.models.homework_attachment import HomeworkAttachment
from app.models.student_invite import StudentInviteCode
from app.services.balance_service import get_student_balance

# Pydantic-схемы
from app.schemas.bot import (
    MessageSendRequest,
    MessageReadRequest,
    LeadStatusUpdateRequest,
    CancellationRequestCreate,
    CancellationResolveRequest,
    HomeworkSubmitRequest,
    BotWebhookRequest,
    TelegramSubscribeRequest,
)

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


# ============================================================================
# УНИВЕРСАЛЬНЫЙ ПОИСК ПОЛЬЗОВАТЕЛЯ
# ============================================================================

@router.get("/user/{telegram_id}")
async def get_user_by_telegram(
    telegram_id: int,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Универсальный поиск: кто этот пользователь?
    Возвращает тип (tutor/student/parent) и ID сущности.
    """
    # Проверяем Tutor
    result = await db.execute(select(Tutor).where(Tutor.telegram_id == telegram_id))
    tutor = result.scalar_one_or_none()
    if tutor:
        return {
            "type": "tutor",
            "id": tutor.id,
            "name": tutor.name,
            "telegram_id": telegram_id,
        }
    
    # Проверяем Student
    result = await db.execute(select(Student).where(Student.telegram_id == telegram_id))
    student = result.scalar_one_or_none()
    if student:
        return {
            "type": "student",
            "id": student.id,
            "name": student.name,
            "telegram_id": telegram_id,
        }
    
    # Проверяем Parent
    result = await db.execute(select(Parent).where(Parent.telegram_id == telegram_id))
    parent = result.scalar_one_or_none()
    if parent:
        return {
            "type": "parent",
            "id": parent.id,
            "name": parent.name,
            "telegram_id": telegram_id,
        }
    
    raise HTTPException(
        status_code=404,
        detail="User not found. Please use /start with invite code."
    )


# ============================================================================
# ЭНДПОИНТЫ ДЛЯ РЕПЕТИТОРА
# ============================================================================

@router.get("/tutor/{telegram_id}")
async def get_tutor_info(
    telegram_id: int,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Информация о репетиторе."""
    result = await db.execute(
        select(Tutor)
        .options(selectinload(Tutor.settings))
        .where(Tutor.telegram_id == telegram_id)
    )
    tutor = result.scalar_one_or_none()
    
    if not tutor:
        raise HTTPException(status_code=404, detail="Tutor not found")
    
    return {
        "id": tutor.id,
        "name": tutor.name,
        "subjects": tutor.subjects or [],
        "currency": tutor.currency,
        "timezone": tutor.timezone,
        "settings": {
            "remind_before_hours": tutor.settings.remind_before_hours if tutor.settings else [24, 2],
            "send_homework_to_parent": tutor.settings.send_homework_to_parent if tutor.settings else True,
        } if tutor.settings else None,
    }


@router.get("/tutor/{telegram_id}/lessons")
async def get_tutor_lessons(
    telegram_id: int,
    date: Optional[str] = Query(None, description="Дата в формате YYYY-MM-DD"),
    limit: int = Query(10, ge=1, le=50),
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Расписание репетитора на дату (или ближайшие уроки)."""
    result = await db.execute(select(Tutor).where(Tutor.telegram_id == telegram_id))
    tutor = result.scalar_one_or_none()
    
    if not tutor:
        raise HTTPException(status_code=404, detail="Tutor not found")
    
    query = (
        select(Lesson)
        .options(selectinload(Lesson.lesson_students))
        .where(Lesson.tutor_id == tutor.id)
    )
    
    if date:
        try:
            target_date = datetime.fromisoformat(date).date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        query = query.where(
            func.date(Lesson.start_at) == target_date,
            Lesson.status.in_(["SCHEDULED", "COMPLETED"]),
        ).order_by(Lesson.start_at.asc())
    else:
        query = query.where(
            Lesson.start_at >= datetime.utcnow(),
            Lesson.status == "SCHEDULED",
        ).order_by(Lesson.start_at.asc()).limit(limit)
    
    lessons_result = await db.execute(query)
    lessons = lessons_result.scalars().all()
    
    lessons_data = []
    for lesson in lessons:
        # Получаем имена учеников
        students_data = []
        for ls in lesson.lesson_students:
            student = await db.get(Student, ls.student_id)
            students_data.append({
                "id": ls.student_id,
                "name": student.name if student else "Unknown",
                "status": ls.status,
                "homework_done": ls.homework_done,
            })
        
        lessons_data.append({
            "id": lesson.id,
            "start_at": lesson.start_at.isoformat(),
            "end_at": lesson.end_at.isoformat(),
            "subject": lesson.subject,
            "status": lesson.status,
            "meeting_url": lesson.meeting_url,
            "homework_text": lesson.homework_text,
            "students": students_data,
        })
    
    return {"lessons": lessons_data}


@router.get("/tutor/{telegram_id}/leads")
async def get_tutor_leads(
    telegram_id: int,
    limit: int = Query(10, ge=1, le=50),
    status: Optional[str] = Query(None, description="Фильтр по статусу: new, contacted, converted, rejected"),
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Получить заявки с лендинга для репетитора."""
    # Находим репетитора
    result = await db.execute(select(Tutor).where(Tutor.telegram_id == telegram_id))
    tutor = result.scalar_one_or_none()
    
    if not tutor:
        raise HTTPException(status_code=404, detail="Tutor not found")
    
    # Формируем запрос
    query = select(Lead).where(Lead.tutor_id == tutor.id)
    
    if status:
        query = query.where(Lead.status == status)
    
    query = query.order_by(Lead.created_at.desc()).limit(limit)
    
    leads_result = await db.execute(query)
    leads = leads_result.scalars().all()
    
    return {
        "leads": [
            {
                "id": lead.id,
                "name": lead.name,
                "phone": lead.phone,
                "email": lead.email,
                "message": lead.message,
                "status": lead.status,
                "created_at": lead.created_at.isoformat()
            }
            for lead in leads
        ]
    }


# ============================================================================
# ЭНДПОИНТЫ ДЛЯ РОДИТЕЛЯ
# ============================================================================

@router.get("/parent/{telegram_id}")
async def get_parent_info(
    telegram_id: int,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Информация о родителе и его детях."""
    result = await db.execute(
        select(Parent)
        .options(selectinload(Parent.students))
        .where(Parent.telegram_id == telegram_id)
    )
    parent = result.scalar_one_or_none()
    
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")
    
    children_data = []
    for student in parent.students:
        if student.is_active:
            balance = await get_student_balance(db, student.id)
            children_data.append({
                "id": student.id,
                "name": student.name,
                "balance": float(balance),
                "subjects": [ss.subject for ss in student.subjects],
            })
    
    return {
        "id": parent.id,
        "name": parent.name,
        "children": children_data,
    }


@router.get("/parent/{telegram_id}/child/{student_id}/lessons")
async def get_child_lessons_for_parent(
    telegram_id: int,
    student_id: int,
    limit: int = Query(5, ge=1, le=20),
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Родитель смотрит расписание ребёнка."""
    # Проверяем родителя
    result = await db.execute(select(Parent).where(Parent.telegram_id == telegram_id))
    parent = result.scalar_one_or_none()
    
    if not parent:
        raise HTTPException(status_code=404, detail="Parent not found")
    
    # Проверяем, что ребёнок действительно связан с этим родителем
    student = await db.get(Student, student_id)
    if not student or student.parent_id != parent.id:
        raise HTTPException(status_code=403, detail="Access denied: this child is not yours")
    
    # Получаем уроки ребёнка
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
    
    lessons_data = []
    for lesson in lessons:
        tutor = await db.get(Tutor, lesson.tutor_id)
        lessons_data.append({
            "id": lesson.id,
            "start_at": lesson.start_at.isoformat(),
            "end_at": lesson.end_at.isoformat(),
            "subject": lesson.subject,
            "tutor_name": tutor.name if tutor else "Unknown",
            "meeting_url": lesson.meeting_url,
        })
    
    return {
        "student_id": student.id,
        "student_name": student.name,
        "lessons": lessons_data,
    }


# ============================================================================
# ДЕЙСТВИЯ БОТА (ОТПРАВКА ДАННЫХ В CRM)
# ============================================================================

@router.post("/homework/submit")
async def submit_homework(
    payload: HomeworkSubmitRequest,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Ученик сдал ДЗ через бота."""
    # Находим ученика
    result = await db.execute(select(Student).where(Student.telegram_id == payload.telegram_id))
    student = result.scalar_one_or_none()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Проверяем урок
    lesson = await db.get(Lesson, payload.lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    
    # Проверяем, что ученик записан на этот урок
    ls_result = await db.execute(
        select(LessonStudent).where(
            LessonStudent.lesson_id == payload.lesson_id,
            LessonStudent.student_id == student.id,
        )
    )
    ls = ls_result.scalar_one_or_none()
    
    if not ls:
        raise HTTPException(status_code=403, detail="Student is not enrolled in this lesson")
    
    # Отмечаем ДЗ как сданное
    ls.homework_done = True
    
    # Если есть файл — создаём HomeworkAttachment
    if payload.file_url:
        attachment = HomeworkAttachment(
            lesson_id=payload.lesson_id,
            filename=payload.file_name or payload.file_url.split("/")[-1],
            original_name=payload.file_name or "homework_file",
            file_path=payload.file_url,
            mime_type=payload.file_type or "application/octet-stream",
            size_bytes=payload.file_size or 0,
        )
        db.add(attachment)
    
    await db.commit()
    
    return {
        "success": True,
        "message": "ДЗ отправлено репетитору",
        "lesson_id": payload.lesson_id,
    }


@router.post("/cancellation/request")
async def request_cancellation(
    payload: CancellationRequestCreate,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Ученик или родитель запрашивает отмену урока."""
    # Определяем, кто запросил (ученик или родитель)
    user_result = await db.execute(select(Student).where(Student.telegram_id == payload.telegram_id))
    student = user_result.scalar_one_or_none()
    
    if not student:
        # Может быть родитель?
        parent_result = await db.execute(select(Parent).where(Parent.telegram_id == payload.telegram_id))
        parent = parent_result.scalar_one_or_none()
        
        if not parent:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Находим ребёнка этого родителя, связанного с уроком
        lesson = await db.get(Lesson, payload.lesson_id)
        if not lesson:
            raise HTTPException(status_code=404, detail="Lesson not found")
        
        student_ids = [ls.student_id for ls in lesson.lesson_students]
        children_result = await db.execute(
            select(Student).where(
                Student.parent_id == parent.id,
                Student.id.in_(student_ids),
            )
        )
        student = children_result.scalars().first()
        
        if not student:
            raise HTTPException(status_code=403, detail="No access to this lesson")
    
    # Создаём запрос на отмену
    cancellation = CancellationRequest(
        lesson_id=payload.lesson_id,
        student_id=student.id,
        reason=payload.reason,
        status="PENDING",
    )
    db.add(cancellation)
    await db.commit()
    await db.refresh(cancellation)
    
    return {
        "success": True,
        "request_id": cancellation.id,
        "message": "Запрос на отмену отправлен репетитору",
    }


@router.post("/cancellation/resolve")
async def resolve_cancellation(
    payload: CancellationResolveRequest,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Репетитор одобряет или отклоняет запрос на отмену урока.
    """
    # Находим запрос на отмену
    cancellation = await db.get(CancellationRequest, payload.request_id)
    if not cancellation:
        raise HTTPException(status_code=404, detail="Cancellation request not found")
    
    # Проверяем, что запрос еще не обработан
    if cancellation.status != "PENDING":
        raise HTTPException(
            status_code=400,
            detail=f"Request already {cancellation.status}. Cannot change status."
        )
    
    # Находим урок
    lesson = await db.get(Lesson, cancellation.lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    
    # Проверяем, что репетитор имеет право решать (он владелец урока)
    tutor_result = await db.execute(
        select(Tutor).where(Tutor.telegram_id == payload.tutor_telegram_id)
    )
    tutor = tutor_result.scalar_one_or_none()
    
    if not tutor:
        raise HTTPException(status_code=404, detail="Tutor not found")
    
    if lesson.tutor_id != tutor.id:
        raise HTTPException(
            status_code=403,
            detail="Access denied. You are not the tutor for this lesson."
        )
    
    # Обновляем статус запроса
    cancellation.status = payload.decision
    cancellation.resolved_at = datetime.utcnow()
    cancellation.resolved_by = tutor.id
    cancellation.tutor_comment = payload.tutor_comment
    
    # Если одобрено - отменяем урок
    if payload.decision == "APPROVED":
        lesson.status = "CANCELLED"
    
    await db.commit()
    
    # TODO: Опубликовать событие в Redis для уведомления ученика/родителя
    # await redis_publisher.publish_event({
    #     "event_id": f"evt_cancel_{payload.request_id}",
    #     "event_type": "cancellation_resolved",
    #     "payload": {
    #         "request_id": payload.request_id,
    #         "lesson_id": lesson.id,
    #         "student_id": cancellation.student_id,
    #         "decision": payload.decision,
    #         "tutor_comment": payload.tutor_comment
    #     },
    #     "recipients": ["student", "parent"]
    # })
    
    return {
        "success": True,
        "request_id": payload.request_id,
        "decision": payload.decision,
        "lesson_status": lesson.status,
        "message": f"Request {payload.decision.lower()}. Lesson status updated to {lesson.status}."
    }


# ============================================================================
# WEBHOOK ОТ БОТА К CRM
# ============================================================================

@router.post("/webhook")
async def receive_bot_webhook(
    payload: BotWebhookRequest,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Бот отправляет сюда события, которые нужно обработать в CRM.
    Например: пользователь отвязал Telegram, бот не смог доставить сообщение и т.д.
    """
    if payload.event_type == "user_unbound":
        # Пользователь отвязал Telegram
        entity_type = payload.entity_type
        
        if entity_type == "student":
            result = await db.execute(
                select(Student).where(Student.telegram_id == payload.telegram_id)
            )
            student = result.scalar_one_or_none()
            if student:
                student.telegram_id = None
        
        elif entity_type == "tutor":
            result = await db.execute(
                select(Tutor).where(Tutor.telegram_id == payload.telegram_id)
            )
            tutor = result.scalar_one_or_none()
            if tutor:
                tutor.telegram_id = None
        
        elif entity_type == "parent":
            result = await db.execute(
                select(Parent).where(Parent.telegram_id == payload.telegram_id)
            )
            parent = result.scalar_one_or_none()
            if parent:
                parent.telegram_id = None
        
        else:
            raise HTTPException(status_code=400, detail="Invalid entity_type")
        
        await db.commit()
        
        return {"success": True, "message": f"Telegram unbound from {entity_type}"}
    
    else:
        raise HTTPException(status_code=400, detail=f"Unknown event_type: {payload.event_type}")


# ============================================================================
# ОБМЕН СООБЩЕНИЯМИ
# ============================================================================

@router.post("/message/send")
async def send_message(
    payload: MessageSendRequest,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Отправка сообщения между пользователями.
    Бот определяет отправителя по telegram_id, создаёт сообщение в БД.
    """
    # Определяем отправителя
    user_result = await db.execute(select(Tutor).where(Tutor.telegram_id == payload.from_telegram_id))
    tutor = user_result.scalar_one_or_none()
    
    if tutor:
        from_type = "tutor"
        from_id = tutor.id
        from_name = tutor.name
    else:
        user_result = await db.execute(select(Student).where(Student.telegram_id == payload.from_telegram_id))
        student = user_result.scalar_one_or_none()
        
        if student:
            from_type = "student"
            from_id = student.id
            from_name = student.name
        else:
            user_result = await db.execute(select(Parent).where(Parent.telegram_id == payload.from_telegram_id))
            parent = user_result.scalar_one_or_none()
            
            if parent:
                from_type = "parent"
                from_id = parent.id
                from_name = parent.name
            else:
                raise HTTPException(status_code=404, detail="Sender not found")
    
    # Создаём сообщение
    message = Message(
        from_type=from_type,
        from_id=from_id,
        to_type=payload.to_type,
        to_id=payload.to_id,
        text=payload.text,
        reply_to_message_id=payload.reply_to_message_id,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    
    # TODO: Опубликовать событие в Redis для уведомления получателя
    # await redis_publisher.publish_event({
    #     "event_id": f"msg_{message.id}",
    #     "event_type": "message_received",
    #     "payload": {
    #         "message_id": message.id,
    #         "from_type": from_type,
    #         "from_id": from_id,
    #         "from_name": from_name,
    #         "to_type": payload.to_type,
    #         "to_id": payload.to_id,
    #         "text": payload.text
    #     },
    #     "recipients": [payload.to_type]
    # })
    
    return {
        "success": True,
        "message_id": message.id,
        "created_at": message.created_at.isoformat()
    }


@router.get("/messages")
async def get_messages(
    telegram_id: int,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """
    Получить входящие и исходящие сообщения пользователя.
    """
    # Определяем пользователя
    user_result = await db.execute(select(Tutor).where(Tutor.telegram_id == telegram_id))
    tutor = user_result.scalar_one_or_none()
    
    if tutor:
        user_type = "tutor"
        user_id = tutor.id
    else:
        user_result = await db.execute(select(Student).where(Student.telegram_id == telegram_id))
        student = user_result.scalar_one_or_none()
        
        if student:
            user_type = "student"
            user_id = student.id
        else:
            user_result = await db.execute(select(Parent).where(Parent.telegram_id == telegram_id))
            parent = user_result.scalar_one_or_none()
            
            if parent:
                user_type = "parent"
                user_id = parent.id
            else:
                raise HTTPException(status_code=404, detail="User not found")
    
    # Получаем сообщения (входящие + исходящие)
    messages_result = await db.execute(
        select(Message)
        .where(
            ((Message.from_type == user_type) & (Message.from_id == user_id)) |
            ((Message.to_type == user_type) & (Message.to_id == user_id))
        )
        .order_by(Message.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    messages = messages_result.scalars().all()
    
    # Подсчитываем непрочитанные
    unread_result = await db.execute(
        select(func.count(Message.id))
        .where(
            (Message.to_type == user_type) &
            (Message.to_id == user_id) &
            (Message.is_read == False)
        )
    )
    unread_count = unread_result.scalar() or 0
    
    messages_data = []
    for msg in messages:
        # Получаем имя отправителя
        if msg.from_type == "tutor":
            sender = await db.get(Tutor, msg.from_id)
            sender_name = sender.name if sender else "Unknown"
        elif msg.from_type == "student":
            sender = await db.get(Student, msg.from_id)
            sender_name = sender.name if sender else "Unknown"
        else:
            sender = await db.get(Parent, msg.from_id)
            sender_name = sender.name if sender else "Unknown"
        
        messages_data.append({
            "id": msg.id,
            "from_type": msg.from_type,
            "from_name": sender_name,
            "text": msg.text,
            "is_read": msg.is_read,
            "created_at": msg.created_at.isoformat(),
            "reply_to_message_id": msg.reply_to_message_id,
        })
    
    return {
        "messages": messages_data,
        "total": len(messages_data),
        "unread_count": unread_count
    }


@router.post("/messages/{message_id}/read")
async def mark_message_as_read(
    message_id: int,
    payload: MessageReadRequest,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Пометить сообщение как прочитанное."""
    message = await db.get(Message, message_id)
    
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Проверяем, что пользователь является получателем
    user_result = await db.execute(select(Tutor).where(Tutor.telegram_id == payload.telegram_id))
    tutor = user_result.scalar_one_or_none()
    
    if tutor and message.to_type == "tutor" and message.to_id == tutor.id:
        message.is_read = True
        await db.commit()
        return {"success": True}
    
    user_result = await db.execute(select(Student).where(Student.telegram_id == payload.telegram_id))
    student = user_result.scalar_one_or_none()
    
    if student and message.to_type == "student" and message.to_id == student.id:
        message.is_read = True
        await db.commit()
        return {"success": True}
    
    user_result = await db.execute(select(Parent).where(Parent.telegram_id == payload.telegram_id))
    parent = user_result.scalar_one_or_none()
    
    if parent and message.to_type == "parent" and message.to_id == parent.id:
        message.is_read = True
        await db.commit()
        return {"success": True}
    
    raise HTTPException(status_code=403, detail="Access denied")


# ============================================================================
# ЗАЯВКИ С ЛЕНДИНГА (LEADS)
# ============================================================================

@router.post("/leads/{lead_id}/status")
async def update_lead_status(
    lead_id: int,
    payload: LeadStatusUpdateRequest,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Обновить статус заявки (например, когда репетитор связался с клиентом)."""
    lead = await db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Проверяем права
    result = await db.execute(select(Tutor).where(Tutor.telegram_id == payload.telegram_id))
    tutor = result.scalar_one_or_none()
    
    if not tutor or lead.tutor_id != tutor.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    lead.status = payload.status.value
    await db.commit()
    
    return {"success": True, "lead_id": lead_id, "new_status": lead.status}


# ============================================================================
# СУЩЕСТВУЮЩИЕ ЭНДПОИНТЫ (привязка Telegram)
# ============================================================================

@router.post("/invite/{student_id}")
async def create_invite_code(
    student_id: int,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Создать одноразовый код привязки для ученика."""
    result = await db.execute(select(Student).where(Student.id == student_id))
    student = result.scalar_one_or_none()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Аннулируем старые неиспользованные коды
    old_codes = await db.execute(
        select(StudentInviteCode).where(
            StudentInviteCode.student_id == student_id,
            StudentInviteCode.is_used == False,
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
    payload: TelegramSubscribeRequest,
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Привязать Telegram-аккаунт к ученику по коду."""
    result = await db.execute(
        select(StudentInviteCode).where(
            StudentInviteCode.code == payload.code,
            StudentInviteCode.is_used == False,
            StudentInviteCode.expires_at > datetime.utcnow(),
        )
    )
    invite = result.scalar_one_or_none()
    
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or expired code")
    
    student = await db.get(Student, invite.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    student.telegram_id = payload.telegram_id
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
        select(Student)
        .options(selectinload(Student.subjects))
        .where(Student.telegram_id == telegram_id)
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
    limit: int = Query(5, ge=1, le=20),
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Получить ближайшие уроки ученика."""
    result = await db.execute(select(Student).where(Student.telegram_id == telegram_id))
    student = result.scalar_one_or_none()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
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
                "end_at": l.end_at.isoformat(),
                "status": l.status,
                "subject": l.subject,
                "homework": l.homework_text,
                "meeting_url": l.meeting_url,
            }
            for l in lessons
        ]
    }


@router.get("/student/{telegram_id}/transactions")
async def get_student_transactions(
    telegram_id: int,
    limit: int = Query(10, ge=1, le=50),
    x_bot_token: str = Depends(verify_bot_token),
    db: AsyncSession = Depends(get_db),
):
    """Получить историю транзакций ученика."""
    result = await db.execute(select(Student).where(Student.telegram_id == telegram_id))
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