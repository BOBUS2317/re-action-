import asyncio
import logging
import os
from datetime import datetime, timezone

import httpx
from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
)
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("BOT_TOKEN", "")
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000").rstrip("/")

logging.basicConfig(level=logging.INFO)

dp = Dispatcher(storage=MemoryStorage())

# Память: разговор и последняя заявка, чтобы ставить оценку одной кнопкой.
conversations: dict[int, str] = {}
last_support: dict[int, dict] = {}
cats_cache: dict[int, dict[str, str]] = {}

STATUS_NAMES = {
    "new": "новая",
    "accepted": "принята",
    "in_progress": "в работе",
    "waiting": "ждёт уточнения",
    "resolved": "решена",
    "closed": "закрыта",
    "cancelled": "отменена",
}

RECEIPT_STATUS = {
    "unpaid": "не оплачена",
    "paid": "оплачена",
    "overdue": "просрочена",
    "cancelled": "отменена",
}

RESOURCE_NAMES = {
    "cold_water": "холодная вода",
    "hot_water": "горячая вода",
    "electricity": "электричество",
    "gas": "газ",
    "heating": "отопление",
}
RESOURCE_BY_TEXT = {v: k for k, v in RESOURCE_NAMES.items()}


def user_id_of(message: types.Message) -> str:
    # Тот же user_id везде: сайт и бот сойдутся, когда сайт начнёт слать такой же.
    return f"telegram-{message.from_user.id}"


def main_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="🆘 описать проблему"), KeyboardButton(text="📝 мои заявки")],
            [KeyboardButton(text="🧾 квитанции"), KeyboardButton(text="💡 передать показания")],
            [KeyboardButton(text="📢 объявления"), KeyboardButton(text="⭐ оценить помощь")],
            [KeyboardButton(text="🏠 мой адрес"), KeyboardButton(text="📩 создать заявку")],
            [KeyboardButton(text="🆕 новый диалог")],
        ],
        resize_keyboard=True,
    )


def cancel_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="❌ отмена")]],
        resize_keyboard=True,
    )


def resource_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="холодная вода"), KeyboardButton(text="горячая вода")],
            [KeyboardButton(text="электричество"), KeyboardButton(text="газ")],
            [KeyboardButton(text="❌ отмена")],
        ],
        resize_keyboard=True,
    )


def rate_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[
            InlineKeyboardButton(text="1", callback_data="rate:1"),
            InlineKeyboardButton(text="2", callback_data="rate:2"),
            InlineKeyboardButton(text="3", callback_data="rate:3"),
            InlineKeyboardButton(text="4", callback_data="rate:4"),
            InlineKeyboardButton(text="5", callback_data="rate:5"),
        ]]
    )


class MeterForm(StatesGroup):
    resource = State()
    value = State()
    street = State()
    house = State()
    apartment = State()


class AddressForm(StatesGroup):
    street = State()
    house = State()
    apartment = State()


class TicketForm(StatesGroup):
    category = State()
    title = State()
    description = State()


async def api_get(path: str, params: dict | None = None):
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{BACKEND_URL}{path}", params=params)
        r.raise_for_status()
        return r.json()


async def api_post(path: str, payload: dict):
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{BACKEND_URL}{path}", json=payload)
        r.raise_for_status()
        return r.json()


@dp.message(CommandStart())
async def start(message: types.Message, state: FSMContext):
    await state.clear()
    await message.answer(
        "привет! я помощник «ре:акция» — вода, свет, лифт, квитанции, заявки\n\n"
        "просто напиши что случилось своими словами, например:\n"
        "«нет горячей воды» или «застрял в лифте»\n\n"
        "если пахнет газом, дым или кого-то зажало — сразу звони 112, а потом пиши сюда",
        reply_markup=main_kb(),
    )


@dp.message(Command("cancel"))
@dp.message(F.text == "❌ отмена")
async def cancel(message: types.Message, state: FSMContext):
    await state.clear()
    await message.answer("хорошо, отменил. чем помочь?", reply_markup=main_kb())


@dp.message(Command("new"))
@dp.message(F.text == "🆕 новый диалог")
async def new_dialog(message: types.Message, state: FSMContext):
    await state.clear()
    if message.from_user:
        conversations.pop(message.from_user.id, None)
        last_support.pop(message.from_user.id, None)
    await message.answer(
        "начинаем с чистого листа. опиши что произошло — где и что не так",
        reply_markup=main_kb(),
    )


@dp.message(F.text == "📝 мои заявки")
async def my_tickets(message: types.Message):
    uid = user_id_of(message)
    waiting = await message.answer("смотрю твои заявки…")
    try:
        tickets = await api_get(f"/api/users/{uid}/tickets", {"limit": 5})
    except httpx.HTTPError:
        await waiting.edit_text("не смог открыть заявки, попробуй позже")
        return
    if not tickets:
        await waiting.edit_text("заявок пока нет. опиши проблему — и я её заведу")
        return
    lines = []
    for t in tickets:
        status = STATUS_NAMES.get(t.get("status", ""), t.get("status", ""))
        lines.append(
            f"• {t.get('id')} — {t.get('title', 'без названия')}\n"
            f"  статус: {status}"
        )
    await waiting.edit_text("твои последние заявки:\n\n" + "\n\n".join(lines))


@dp.message(F.text == "🧾 квитанции")
async def my_receipts(message: types.Message):
    uid = user_id_of(message)
    waiting = await message.answer("проверяю квитанции…")
    try:
        receipts = await api_get(f"/api/users/{uid}/receipts", {"limit": 5})
    except httpx.HTTPError:
        await waiting.edit_text("не смог открыть квитанции, попробуй позже")
        return
    if not receipts:
        await waiting.edit_text("квитанций на тебя пока нет")
        return
    lines = []
    for r in receipts:
        amount = (r.get("amount_cents", 0) or 0) / 100
        st = RECEIPT_STATUS.get(r.get("status", ""), r.get("status", ""))
        lines.append(
            f"• {r.get('billing_period')} — {r.get('provider')}\n"
            f"  {amount:.2f} ₽ · {st}"
        )
    await waiting.edit_text("последние квитанции:\n\n" + "\n\n".join(lines))


@dp.message(F.text == "📢 объявления")
async def announcements(message: types.Message):
    waiting = await message.answer("смотрю объявления в доме…")
    try:
        items = await api_get("/api/announcements", {"city": "Томск"})
    except httpx.HTTPError:
        await waiting.edit_text("не смог открыть объявления, попробуй позже")
        return
    if not items:
        await waiting.edit_text("активных объявлений сейчас нет")
        return
    lines = [f"• {a.get('title', '')}\n  {(a.get('body') or '')[:200]}" for a in items[:5]]
    await waiting.edit_text("что происходит в доме:\n\n" + "\n\n".join(lines))


@dp.message(F.text == "⭐ оценить помощь")
async def ask_rating(message: types.Message):
    if not message.from_user or message.from_user.id not in last_support:
        await message.answer("пока нечего оценивать — сначала опиши проблему, а потом поставь оценку")
        return
    await message.answer("как тебе последний ответ? нажми цифру", reply_markup=rate_kb())


@dp.callback_query(F.data.startswith("rate:"))
async def save_rating(callback: types.CallbackQuery):
    if not callback.from_user or not callback.message:
        return
    score = int(callback.data.split(":")[1])
    uid = f"telegram-{callback.from_user.id}"
    data = last_support.get(callback.from_user.id, {})
    if not data.get("conversation_id") and not data.get("ticket_id"):
        await callback.answer("нечего оценивать", show_alert=True)
        return
    try:
        await api_post("/api/ratings", {
            "user_id": uid,
            "score": score,
            "conversation_id": data.get("conversation_id"),
            "ticket_id": data.get("ticket_id"),
        })
    except httpx.HTTPError:
        await callback.answer("не сохранилось, попробуй позже", show_alert=True)
        return
    await callback.message.edit_text(f"спасибо! поставил {score} из 5")
    await callback.answer()


# ---------- показания ----------

@dp.message(F.text == "💡 передать показания")
async def meter_start(message: types.Message, state: FSMContext):
    await state.set_state(MeterForm.resource)
    await message.answer("что передаём?", reply_markup=resource_kb())


@dp.message(MeterForm.resource)
async def meter_resource(message: types.Message, state: FSMContext):
    if not message.text or message.text not in RESOURCE_BY_TEXT:
        await message.answer("выбери кнопкой: холодная вода, горячая вода, электричество или газ")
        return
    await state.update_data(resource=RESOURCE_BY_TEXT[message.text])
    await state.set_state(MeterForm.value)
    await message.answer("какое число на счётчике? просто цифру, например 123.5", reply_markup=cancel_kb())


@dp.message(MeterForm.value)
async def meter_value(message: types.Message, state: FSMContext):
    try:
        value = float((message.text or "").replace(",", "."))
        if value < 0 or value > 1_000_000:
            raise ValueError
    except ValueError:
        await message.answer("не похоже на показание. введи просто цифру, например 123.5")
        return
    await state.update_data(value=value)
    await state.set_state(MeterForm.street)
    await message.answer("какая улица? например: ленина", reply_markup=cancel_kb())


@dp.message(MeterForm.street)
async def meter_street(message: types.Message, state: FSMContext):
    if not message.text or len(message.text.strip()) < 2:
        await message.answer("напиши улицу текстом")
        return
    await state.update_data(street=message.text.strip())
    await state.set_state(MeterForm.house)
    await message.answer("дом? например: 12а")


@dp.message(MeterForm.house)
async def meter_house(message: types.Message, state: FSMContext):
    if not message.text or len(message.text.strip()) < 1:
        await message.answer("напиши дом")
        return
    await state.update_data(house=message.text.strip())
    await state.set_state(MeterForm.apartment)
    await message.answer("квартира? если частный дом или не важно — отправь «-»")


@dp.message(MeterForm.apartment)
async def meter_apartment(message: types.Message, state: FSMContext):
    data = await state.get_data()
    apt = (message.text or "").strip()
    apartment = None if apt == "-" else apt
    uid = user_id_of(message)
    waiting = await message.answer("сохраняю…", reply_markup=main_kb())
    try:
        address = await api_post(f"/api/users/{uid}/addresses", {
            "street": data["street"],
            "house": data["house"],
            "apartment": apartment,
            "city": "Томск",
        })
        reading = await api_post("/api/meter-readings", {
            "user_id": uid,
            "address_id": address["id"],
            "resource": data["resource"],
            "value": data["value"],
            "measured_at": datetime.now(timezone.utc).isoformat(),
        })
    except httpx.HTTPError:
        await waiting.edit_text("не сохранилось, попробуй позже")
        await state.clear()
        return
    await state.clear()
    await waiting.edit_text(
        f"готово! {RESOURCE_NAMES[data['resource']]} — {reading['value']}\n"
        f"адрес: {data['street']}, {data['house']}"
        + (f", кв. {apartment}" if apartment else "")
    )


# ---------- адрес ----------

@dp.message(F.text == "🏠 мой адрес")
async def address_start(message: types.Message, state: FSMContext):
    await state.set_state(AddressForm.street)
    await message.answer("какая улица?", reply_markup=cancel_kb())


@dp.message(AddressForm.street)
async def address_street(message: types.Message, state: FSMContext):
    if not message.text or len(message.text.strip()) < 2:
        await message.answer("напиши улицу текстом")
        return
    await state.update_data(street=message.text.strip())
    await state.set_state(AddressForm.house)
    await message.answer("дом?")


@dp.message(AddressForm.house)
async def address_house(message: types.Message, state: FSMContext):
    if not message.text:
        await message.answer("напиши дом")
        return
    await state.update_data(house=message.text.strip())
    await state.set_state(AddressForm.apartment)
    await message.answer("квартира? если не важно — отправь «-»")


@dp.message(AddressForm.apartment)
async def address_finish(message: types.Message, state: FSMContext):
    data = await state.get_data()
    apt = (message.text or "").strip()
    apartment = None if apt == "-" else apt
    uid = user_id_of(message)
    try:
        await api_post(f"/api/users/{uid}/addresses", {
            "street": data["street"],
            "house": data["house"],
            "apartment": apartment,
            "city": "Томск",
        })
    except httpx.HTTPError:
        await message.answer("не сохранилось, попробуй позже", reply_markup=main_kb())
        await state.clear()
        return
    await state.clear()
    await message.answer("адрес сохранил ✔", reply_markup=main_kb())


# ---------- заявка вручную ----------

@dp.message(F.text == "📩 создать заявку")
async def ticket_start(message: types.Message, state: FSMContext):
    if not message.from_user:
        return
    try:
        cats = await api_get("/api/categories")
    except httpx.HTTPError:
        await message.answer("не смог загрузить категории, опиши проблему текстом — разберусь так")
        return
    mapping = {c["name"]: c["slug"] for c in cats}
    cats_cache[message.from_user.id] = mapping
    kb = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=name)] for name in mapping] + [[KeyboardButton(text="❌ отмена")]],
        resize_keyboard=True,
    )
    await state.set_state(TicketForm.category)
    await message.answer("что за проблема? выбери категорию", reply_markup=kb)


@dp.message(TicketForm.category)
async def ticket_category(message: types.Message, state: FSMContext):
    if not message.from_user or not message.text:
        return
    mapping = cats_cache.get(message.from_user.id, {})
    if message.text not in mapping:
        await message.answer("выбери категорию кнопкой")
        return
    await state.update_data(category=mapping[message.text])
    await state.set_state(TicketForm.title)
    await message.answer("коротко назови заявку, например: «нет горячей воды»", reply_markup=cancel_kb())


@dp.message(TicketForm.title)
async def ticket_title(message: types.Message, state: FSMContext):
    if not message.text or len(message.text.strip()) < 3:
        await message.answer("название слишком короткое, напиши чуть подробнее")
        return
    await state.update_data(title=message.text.strip())
    await state.set_state(TicketForm.description)
    await message.answer("а теперь подробнее: где и что случилось?")


@dp.message(TicketForm.description)
async def ticket_finish(message: types.Message, state: FSMContext):
    data = await state.get_data()
    uid = user_id_of(message)
    waiting = await message.answer("создаю заявку…", reply_markup=main_kb())
    try:
        ticket = await api_post("/api/tickets", {
            "user_id": uid,
            "conversation_id": conversations.get(message.from_user.id) if message.from_user else None,
            "category": data.get("category", "other"),
            "title": data["title"],
            "description": message.text or "",
            "priority": "normal",
        })
    except httpx.HTTPError:
        await waiting.edit_text("не создалось, попробуй позже")
        await state.clear()
        return
    await state.clear()
    await waiting.edit_text(f"заявка {ticket['id']} создана, диспетчер её видит")


# ---------- свободный текст → нейронка ----------

@dp.message(F.text == "🆘 описать проблему")
async def prompt_problem(message: types.Message):
    await message.answer("слушаю. напиши где и что случилось, одним сообщением")


@dp.message(F.text)
async def support(message: types.Message):
    if not message.from_user or not message.text:
        return
    # FSM-шаги уже разобраны выше, сюда попадает только свободный текст.
    waiting = await message.answer("ищу ответ в базе знаний…")
    payload = {
        "user_id": f"telegram-{message.from_user.id}",
        "message": message.text,
        "conversation_id": conversations.get(message.from_user.id),
        "channel": "telegram",
        "display_name": message.from_user.full_name,
    }
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(f"{BACKEND_URL}/api/support", json=payload)
            response.raise_for_status()
        result = response.json()
    except httpx.HTTPError:
        await waiting.edit_text(
            "сервис временно недоступен. попробуй позже, а при аварии звони 112"
        )
        return
    conversations[message.from_user.id] = result["conversation_id"]
    last_support[message.from_user.id] = {
        "conversation_id": result["conversation_id"],
        "ticket_id": result.get("ticket_id"),
    }
    text = result["response"]
    if result.get("ticket_id"):
        text += f"\n\nзаявка {result['ticket_id']} создана, диспетчер её видит"
    elif result.get("escalated"):
        text += "\n\nпередала диспетчеру, он разберётся"
    await waiting.edit_text(text, reply_markup=rate_kb())


async def main():
    if not TOKEN:
        raise RuntimeError("укажи BOT_TOKEN в .env")
    bot = Bot(token=TOKEN)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
