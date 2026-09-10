from __future__ import annotations

from typing import Literal

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import CORS_ORIGINS, QWEN_API_URL
from database import (
    add_address,
    add_meter_reading,
    add_rating,
    append_message,
    create_ticket,
    database_stats,
    create_telegram_link_code,
    ensure_user,
    get_history,
    get_or_create_conversation,
    get_ticket,
    get_telegram_profile,
    get_user_profile,
    init_db,
    list_announcements,
    list_categories,
    list_user_receipts,
    list_user_tickets,
    link_website_by_telegram_code,
    register_telegram_user,
    search_knowledge,
    set_conversation_category,
    upsert_knowledge_article,
    update_ticket_status,
    upsert_receipt,
)
from rag import ask_qwen, fallback_answer, retrieve


app = FastAPI(
    title="Ре:Акция API",
    description="Единый backend сайта и Telegram-бота: обращения, RAG и Qwen.",
    version="2.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

EMERGENCY_TERMS = (
    "запах газа",
    "пахнет газом",
    "утечка газа",
    "пожар",
    "дым",
    "искрит",
    "человек застрял",
    "люди застряли",
    "прорвало трубу",
)
EMERGENCY_RESPONSE = (
    "Это может быть опасно. 1. Покиньте опасное место. "
    "2. Не включайте и не выключайте электроприборы и не используйте открытый огонь. "
    "3. Позвоните 112; при запахе газа — также 104, находясь снаружи. "
    "Не пытайтесь устранять аварию самостоятельно."
)


class SupportRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=3000)
    conversation_id: str | None = None
    channel: Literal["web", "telegram"] = "web"
    display_name: str | None = Field(default=None, max_length=120)


class Source(BaseModel):
    title: str
    source_name: str
    source_url: str | None
    updated_at: str


class SupportResponse(BaseModel):
    conversation_id: str
    category: str
    category_name: str
    response: str
    confidence: float
    escalated: bool
    ticket_id: str | None
    llm_used: bool
    sources: list[Source]


class AddressRequest(BaseModel):
    street: str = Field(min_length=1, max_length=180)
    house: str = Field(min_length=1, max_length=30)
    city: str = Field(default="Томск", max_length=80)
    building: str | None = Field(default=None, max_length=30)
    apartment: str | None = Field(default=None, max_length=30)
    entrance: str | None = Field(default=None, max_length=30)
    floor: str | None = Field(default=None, max_length=30)
    is_primary: bool = True


class TicketRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=120)
    conversation_id: str | None = None
    category: str = "other"
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(min_length=1, max_length=3000)
    priority: Literal["low", "normal", "high", "emergency"] = "normal"
    address_id: int | None = None
    organization_id: int | None = None


class TicketStatusRequest(BaseModel):
    status: Literal["new", "accepted", "in_progress", "waiting", "resolved", "closed", "cancelled"]
    actor: str = Field(default="operator", max_length=120)
    note: str | None = Field(default=None, max_length=1000)


class RatingRequest(BaseModel):
    user_id: str
    score: int = Field(ge=1, le=5)
    conversation_id: str | None = None
    ticket_id: str | None = None
    comment: str | None = Field(default=None, max_length=1000)


class MeterReadingRequest(BaseModel):
    user_id: str
    address_id: int
    resource: Literal["cold_water", "hot_water", "electricity", "gas", "heating"]
    value: float = Field(ge=0)
    measured_at: str


class ReceiptRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=120)
    billing_period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    provider: str = Field(min_length=1, max_length=180)
    amount_cents: int = Field(ge=0)
    status: Literal["unpaid", "paid", "overdue", "cancelled"] = "unpaid"
    address_id: int | None = None
    due_at: str | None = None
    paid_at: str | None = None


class TelegramRegistrationRequest(BaseModel):
    telegram_id: str = Field(min_length=1, max_length=32)
    telegram_username: str | None = Field(default=None, max_length=64)
    display_name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=7, max_length=32)
    city: str = Field(min_length=1, max_length=80)
    street: str = Field(min_length=1, max_length=180)
    house: str = Field(min_length=1, max_length=30)
    apartment: str | None = Field(default=None, max_length=30)


class TelegramLinkRequest(BaseModel):
    web_user_id: str = Field(min_length=1, max_length=120)
    code: str = Field(pattern=r"^\d{6}$")


class TelegramIdRequest(BaseModel):
    telegram_id: str = Field(min_length=1, max_length=32)


class KnowledgeArticleRequest(BaseModel):
    category: str
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=100)
    title: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=10, max_length=10000)
    keywords: str = Field(default="", max_length=1000)
    source_name: str = Field(min_length=2, max_length=200)
    source_url: str | None = Field(default=None, max_length=1000)
    is_emergency: bool = False
    published_at: str | None = None


@app.get("/api/health")
def health():
    qwen_ready = False
    try:
        models_url = QWEN_API_URL.rsplit("/chat/completions", 1)[0] + "/models"
        qwen_ready = requests.get(models_url, timeout=2).ok
    except requests.RequestException:
        pass
    return {"status": "ok", "database": database_stats(), "qwen_ready": qwen_ready}


@app.get("/api/categories")
def categories():
    return list_categories()


@app.post("/api/users/{user_id}/addresses", status_code=201)
def create_address(user_id: str, req: AddressRequest):
    ensure_user(user_id, "web")
    return add_address(user_id=user_id, **req.model_dump())


@app.get("/api/users/{user_id}/profile")
def user_profile(user_id: str):
    profile = get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return profile


@app.post("/api/telegram/register", status_code=201)
def telegram_register(req: TelegramRegistrationRequest):
    try:
        profile = register_telegram_user(**req.model_dump())
        code = create_telegram_link_code(profile["id"])
        return {"user": profile, "link_code": code, "expires_in_minutes": 15}
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Не удалось сохранить регистрацию") from exc


@app.post("/api/telegram/link-code")
def telegram_link_code(req: TelegramIdRequest):
    profile = get_telegram_profile(req.telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Сначала пройдите регистрацию в Telegram")
    return {"link_code": create_telegram_link_code(profile["id"]), "expires_in_minutes": 15}


@app.post("/api/users/link-telegram")
def link_telegram(req: TelegramLinkRequest):
    profile = link_website_by_telegram_code(req.web_user_id, req.code)
    if not profile:
        raise HTTPException(status_code=400, detail="Код неверный или срок его действия истёк")
    return {"user": profile}


@app.post("/api/support", response_model=SupportResponse)
def handle_support(req: SupportRequest):
    ensure_user(req.user_id, req.channel, external_id=req.user_id, display_name=req.display_name)
    conversation = get_or_create_conversation(req.user_id, req.channel, req.conversation_id)
    previous_messages = get_history(conversation["id"])
    append_message(conversation["id"], "user", req.message)

    context = retrieve(req.message)
    first = context[0] if context else None
    category = first["category"] if first else "other"
    category_name = first["category_name"] if first else "Другое"
    lowered = req.message.lower()
    emergency = any(term in lowered for term in EMERGENCY_TERMS)
    asks_operator = any(term in lowered for term in ("оператор", "диспетчер", "живой человек", "создай заявку"))
    llm_used = False

    if emergency:
        response_text = EMERGENCY_RESPONSE
        category = first["category"] if first else "other"
        category_name = first["category_name"] if first else "Аварийная ситуация"
        confidence = 1.0
    else:
        try:
            response_text = ask_qwen(req.message, context, previous_messages)
            llm_used = True
        except (requests.RequestException, KeyError, IndexError, TypeError):
            response_text = fallback_answer(context)
        confidence = 0.9 if context else 0.35

    escalated = emergency or asks_operator
    state = "escalated" if escalated else ("resolved" if context else "clarifying")
    set_conversation_category(conversation["id"], category, state)
    append_message(
        conversation["id"],
        "assistant",
        response_text,
        model="Qwen2.5-1.5B-Instruct" if llm_used else "safety-or-rag-fallback",
        confidence=confidence,
    )

    ticket_id = None
    if escalated:
        priority = "emergency" if emergency else (first["default_priority"] if first else "normal")
        ticket = create_ticket(
            user_id=req.user_id,
            conversation_id=conversation["id"],
            category_slug=category,
            title=first["title"] if first else "Обращение жителя",
            description=req.message,
            priority=priority,
            organization_id=1 if emergency else 3,
        )
        ticket_id = ticket["id"]

    sources = [
        Source(
            title=item["title"],
            source_name=item["source_name"],
            source_url=item["source_url"],
            updated_at=item["updated_at"],
        )
        for item in context
    ]
    return SupportResponse(
        conversation_id=conversation["id"],
        category=category,
        category_name=category_name,
        response=response_text,
        confidence=confidence,
        escalated=escalated,
        ticket_id=ticket_id,
        llm_used=llm_used,
        sources=sources,
    )


@app.post("/api/tickets", status_code=201)
def create_ticket_endpoint(req: TicketRequest):
    ensure_user(req.user_id, "web")
    try:
        return create_ticket(
            user_id=req.user_id,
            conversation_id=req.conversation_id,
            category_slug=req.category,
            title=req.title,
            description=req.description,
            priority=req.priority,
            address_id=req.address_id,
            organization_id=req.organization_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Не удалось создать заявку. Проверьте категорию и адрес.") from exc


@app.get("/api/tickets/{ticket_id}")
def ticket_details(ticket_id: str):
    ticket = get_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return ticket


@app.get("/api/users/{user_id}/tickets")
def user_tickets(user_id: str, limit: int = Query(default=50, ge=1, le=100)):
    return list_user_tickets(user_id, limit)


@app.get("/api/users/{user_id}/receipts")
@app.get("/api/receipts/{user_id}")
def user_receipts(user_id: str, limit: int = Query(default=24, ge=1, le=100)):
    ensure_user(user_id, "web")
    return list_user_receipts(user_id, limit)


@app.post("/api/receipts", status_code=201)
def save_receipt(req: ReceiptRequest):
    ensure_user(req.user_id, "web")
    try:
        return upsert_receipt(**req.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Не удалось сохранить квитанцию") from exc


@app.patch("/api/tickets/{ticket_id}/status")
def change_ticket_status(ticket_id: str, req: TicketStatusRequest):
    ticket = update_ticket_status(ticket_id, req.status, req.actor, req.note)
    if not ticket:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return ticket


@app.get("/api/announcements")
def announcements(city: str = Query(default="Томск", max_length=80)):
    return list_announcements(city)


@app.get("/api/knowledge/search")
def knowledge_search(q: str = Query(min_length=2, max_length=500), limit: int = Query(default=3, ge=1, le=10)):
    return search_knowledge(q, limit)


@app.post("/api/knowledge/articles", status_code=201)
def save_knowledge_article(req: KnowledgeArticleRequest):
    try:
        return upsert_knowledge_article(
            category_slug=req.category,
            slug=req.slug,
            title=req.title,
            body=req.body,
            keywords=req.keywords,
            source_name=req.source_name,
            source_url=req.source_url,
            is_emergency=req.is_emergency,
            published_at=req.published_at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Неизвестная категория") from exc


@app.post("/api/ratings", status_code=201)
def create_rating(req: RatingRequest):
    if not req.conversation_id and not req.ticket_id:
        raise HTTPException(status_code=400, detail="Нужно указать conversation_id или ticket_id")
    ensure_user(req.user_id, "web")
    return {"id": add_rating(**req.model_dump()), "saved": True}


@app.post("/api/meter-readings", status_code=201)
def create_meter_reading(req: MeterReadingRequest):
    ensure_user(req.user_id, "web")
    try:
        return add_meter_reading(**req.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Не удалось сохранить показания") from exc
