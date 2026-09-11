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


class RegForm(StatesGroup):
    phone = State()
    city = State()
    street = State()
    house = State()
    apartment = State()


def phone_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="\U0001F4F1 отправить номер", request_contact=True)],
            [KeyboardButton(text="\u274C отмена")],
        ],
        resize_keyboard=True,
    )


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
        "Здравствуйте. Я — сервис «Ре:Акция» для обращений по жилищно-коммунальным услугам: водоснабжение, электроснабжение, лифтовое оборудование, квитанции и заявки.\n\n"
        "Опишите проблему своими словами в одном сообщении, например:\n"
        "«Отсутствует горячее водоснабжение» или «Лифт не работает».\n\n"
        "В случае аварийной ситуации — запах газа, задымление, угроза жизни или здоровью — незамедлительно звоните по номеру 112, после чего сообщите об этом здесь.\n\n"
        "Для объединения учётных записей сайта и Telegram:\n"
        "1. Выполните команду /register и укажите телефон, город, улицу, дом и квартиру.\n"
        "2. Вы получите шестизначный код, действительный в течение 15 минут.\n"
        "3. Введите код на сайте в разделе «Профиль» или на странице /login.\n\n"
        "Повторный код — команда /link",
        reply_markup=main_kb(),
    )


@dp.message(Command("register"))
async def register_start(message: types.Message, state: FSMContext):
    await state.clear()
    await state.set_state(RegForm.phone)
    await message.answer(
        "Для привязки учётной записи укажите телефон, город, улицу, дом и квартиру.\n\n"
        "Направьте номер телефона текстовым сообщением или нажмите кнопку ниже",
        reply_markup=phone_kb(),
    )


@dp.message(Command("link"))
async def link_cmd(message: types.Message):
    if not message.from_user:
        return
    tid = str(message.from_user.id)
    try:
        data = await api_post("/api/telegram/link-code", {"telegram_id": tid})
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            await message.answer(
                "Вы не зарегистрированы. Выполните команду /register — процедура займёт около минуты.",
                reply_markup=main_kb(),
            )
            return
        await message.answer("Не удалось выдать код. Повторите попытку позже.")
        return
    except httpx.HTTPError:
        await message.answer("Сервис временно недоступен. Повторите попытку позже.")
        return
    code = data.get("link_code", "")
    await message.answer(
        f"Ваш код для входа на сайт: {code}\n"
        "Срок действия — 15 минут. Введите его на сайте в разделе «Профиль» или на странице /login",
        reply_markup=main_kb(),
    )


@dp.message(Command("profile"))
async def profile_cmd(message: types.Message):
    if not message.from_user:
        return
    tid = str(message.from_user.id)
    try:
        prof = await api_get(f"/api/telegram/{tid}/profile")
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            await message.answer("Профиль не найден. Выполните команду /register.")
            return
        await message.answer("Не удалось открыть профиль. Повторите попытку позже.")
        return
    except httpx.HTTPError:
        await message.answer("Сервис временно недоступен. Повторите попытку позже.")
        return
    await message.answer(
        f"Зарегистрированный пользователь: {prof.get('display_name', '')} ({prof.get('telegram_username') or 'без ника'})\n"
        f"Адрес: {prof.get('city', '')}, {prof.get('street', '')} {prof.get('house', '')}, кв. {prof.get('apartment') or '—'}\n"
        f"Телефон: {prof.get('phone', '')}\n\n"
        "Новый код для сайта — команда /link",
        reply_markup=main_kb(),
    )


@dp.message(RegForm.phone)
async def reg_phone(message: types.Message, state: FSMContext):
    phone = ""
    if message.contact and message.contact.phone_number:
        phone = message.contact.phone_number.strip()
    elif message.text:
        phone = message.text.strip()
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) < 7:
        await message.answer(
            "Номер указан некорректно. Направьте телефон текстовым сообщением, например +7 913 123-45-67.",
            reply_markup=phone_kb(),
        )
        return
    await state.update_data(phone=phone)
    await state.set_state(RegForm.city)
    await message.answer("Укажите город. Например: Томск.", reply_markup=cancel_kb())


@dp.message(RegForm.city)
async def reg_city(message: types.Message, state: FSMContext):
    city = (message.text or "").strip()
    if len(city) < 2:
        await message.answer("Укажите название города полностью. Например: Томск.")
        return
    await state.update_data(city=city)
    await state.set_state(RegForm.street)
    await message.answer("Укажите улицу. Например: ул. Ленина.")


@dp.message(RegForm.street)
async def reg_street(message: types.Message, state: FSMContext):
    street = (message.text or "").strip()
    if len(street) < 2:
        await message.answer("Укажите название улицы полностью.")
        return
    await state.update_data(street=street)
    await state.set_state(RegForm.house)
    await message.answer("Укажите номер дома.")


@dp.message(RegForm.house)
async def reg_house(message: types.Message, state: FSMContext):
    house = (message.text or "").strip()
    if not house:
        await message.answer("Укажите номер дома.")
        return
    await state.update_data(house=house)
    await state.set_state(RegForm.apartment)
    await message.answer("Укажите номер квартиры. Для частного дома отправьте «-».")


@dp.message(RegForm.apartment)
async def reg_apartment(message: types.Message, state: FSMContext):
    raw = (message.text or "").strip()
    apartment = None if raw in ("-", "—", "нет", "частный") else (raw or None)
    data = await state.get_data()
    if not message.from_user:
        await state.clear()
        return
    payload = {
        "telegram_id": str(message.from_user.id),
        "telegram_username": message.from_user.username,
        "display_name": message.from_user.full_name,
        "phone": data.get("phone", ""),
        "city": data.get("city", ""),
        "street": data.get("street", ""),
        "house": data.get("house", ""),
        "apartment": apartment,
    }
    await state.clear()
    waiting = await message.answer("Сохранение данных…", reply_markup=main_kb())
    try:
        result = await api_post("/api/telegram/register", payload)
    except httpx.HTTPStatusError as e:
        try:
            detail = e.response.json()
        except ValueError:
            detail = e.response.text
        await waiting.edit_text(f"Не удалось сохранить данные: {detail}. Повторите попытку командой /register.")
        return
    except httpx.HTTPError:
        await waiting.edit_text("Сервис временно недоступен. Повторите попытку позже.")
        return
    code = result.get("link_code", "")
    await waiting.edit_text(
        "Регистрация завершена.\n\n"
        f"Ваш код для сайта: {code}\n"
        "Срок действия — 15 минут. Введите его на сайте в разделе «Профиль» или на странице /login.\n"
        "После этого сайт и Telegram-бот будут использовать общую учётную запись и историю обращений.",
    )


@dp.message(Command("cancel"))
@dp.message(F.text == "❌ отмена")
async def cancel(message: types.Message, state: FSMContext):
    await state.clear()
    await message.answer("Действие отменено. Чем могу помочь?", reply_markup=main_kb())


@dp.message(Command("new"))
@dp.message(F.text == "🆕 новый диалог")
async def new_dialog(message: types.Message, state: FSMContext):
    await state.clear()
    if message.from_user:
        conversations.pop(message.from_user.id, None)
        last_support.pop(message.from_user.id, None)
    await message.answer(
        "Начат новый диалог. Опишите проблему: укажите адрес и суть неисправности.",
        reply_markup=main_kb(),
    )


@dp.message(F.text == "📝 мои заявки")
async def my_tickets(message: types.Message):
    uid = user_id_of(message)
    waiting = await message.answer("Запрашиваю Ваши заявки…")
    try:
        tickets = await api_get(f"/api/users/{uid}/tickets", {"limit": 5})
    except httpx.HTTPError:
        await waiting.edit_text("Не удалось открыть список заявок. Повторите попытку позже.")
        return
    if not tickets:
        await waiting.edit_text("Заявки отсутствуют. Опишите проблему — будет создана новая заявка.")
        return
    lines = []
    for t in tickets:
        status = STATUS_NAMES.get(t.get("status", ""), t.get("status", ""))
        lines.append(
            f"• {t.get('id')} — {t.get('title', 'без названия')}\n"
            f"  статус: {status}"
        )
    await waiting.edit_text("Ваши последние заявки:\n\n" + "\n\n".join(lines))


@dp.message(F.text == "🧾 квитанции")
async def my_receipts(message: types.Message):
    uid = user_id_of(message)
    waiting = await message.answer("Запрашиваю квитанции…")
    try:
        receipts = await api_get(f"/api/users/{uid}/receipts", {"limit": 5})
    except httpx.HTTPError:
        await waiting.edit_text("Не удалось открыть квитанции. Повторите попытку позже.")
        return
    if not receipts:
        await waiting.edit_text("Квитанции на Ваше имя отсутствуют.")
        return
    lines = []
    for r in receipts:
        amount = (r.get("amount_cents", 0) or 0) / 100
        st = RECEIPT_STATUS.get(r.get("status", ""), r.get("status", ""))
        lines.append(
            f"• {r.get('billing_period')} — {r.get('provider')}\n"
            f"  {amount:.2f} ₽ · {st}"
        )
    await waiting.edit_text("Последние квитанции:\n\n" + "\n\n".join(lines))


@dp.message(F.text == "📢 объявления")
async def announcements(message: types.Message):
    waiting = await message.answer("Запрашиваю объявления…")
    try:
        items = await api_get("/api/announcements", {"city": "Томск"})
    except httpx.HTTPError:
        await waiting.edit_text("Не удалось открыть объявления. Повторите попытку позже.")
        return
    if not items:
        await waiting.edit_text("Активные объявления отсутствуют.")
        return
    lines = [f"• {a.get('title', '')}\n  {(a.get('body') or '')[:200]}" for a in items[:5]]
    await waiting.edit_text("Объявления:\n\n" + "\n\n".join(lines))


@dp.message(F.text == "⭐ оценить помощь")
async def ask_rating(message: types.Message):
    if not message.from_user or message.from_user.id not in last_support:
        await message.answer("Оценивать пока нечего. Сначала опишите проблему, после чего Вы сможете оценить ответ.")
        return
    await message.answer("Оцените последний ответ, нажав на цифру:", reply_markup=rate_kb())


@dp.callback_query(F.data.startswith("rate:"))
async def save_rating(callback: types.CallbackQuery):
    if not callback.from_user or not callback.message:
        return
    score = int(callback.data.split(":")[1])
    uid = f"telegram-{callback.from_user.id}"
    data = last_support.get(callback.from_user.id, {})
    if not data.get("conversation_id") and not data.get("ticket_id"):
        await callback.answer("Нет данных для оценки.", show_alert=True)
        return
    try:
        await api_post("/api/ratings", {
            "user_id": uid,
            "score": score,
            "conversation_id": data.get("conversation_id"),
            "ticket_id": data.get("ticket_id"),
        })
    except httpx.HTTPError:
        await callback.answer("Не удалось сохранить оценку. Повторите попытку позже.", show_alert=True)
        return
    await callback.message.edit_text(f"Спасибо. Оценка {score} из 5 сохранена.")
    await callback.answer()


# ---------- показания ----------

@dp.message(F.text == "💡 передать показания")
async def meter_start(message: types.Message, state: FSMContext):
    await state.set_state(MeterForm.resource)
    await message.answer("Укажите ресурс для передачи показаний:", reply_markup=resource_kb())


@dp.message(MeterForm.resource)
async def meter_resource(message: types.Message, state: FSMContext):
    if not message.text or message.text not in RESOURCE_BY_TEXT:
        await message.answer("Выберите ресурс с помощью кнопок: холодная вода, горячая вода, электричество или газ.")
        return
    await state.update_data(resource=RESOURCE_BY_TEXT[message.text])
    await state.set_state(MeterForm.value)
    await message.answer("Укажите текущее показание счётчика. Только цифру, например 123.5.", reply_markup=cancel_kb())


@dp.message(MeterForm.value)
async def meter_value(message: types.Message, state: FSMContext):
    try:
        value = float((message.text or "").replace(",", "."))
        if value < 0 or value > 1_000_000:
            raise ValueError
    except ValueError:
        await message.answer("Показание указано некорректно. Введите цифру, например 123.5.")
        return
    await state.update_data(value=value)
    await state.set_state(MeterForm.street)
    await message.answer("Укажите улицу. Например: Ленина.", reply_markup=cancel_kb())


@dp.message(MeterForm.street)
async def meter_street(message: types.Message, state: FSMContext):
    if not message.text or len(message.text.strip()) < 2:
        await message.answer("Укажите улицу текстом.")
        return
    await state.update_data(street=message.text.strip())
    await state.set_state(MeterForm.house)
    await message.answer("Укажите дом. Например: 12а.")


@dp.message(MeterForm.house)
async def meter_house(message: types.Message, state: FSMContext):
    if not message.text or len(message.text.strip()) < 1:
        await message.answer("Укажите дом.")
        return
    await state.update_data(house=message.text.strip())
    await state.set_state(MeterForm.apartment)
    await message.answer("Укажите квартиру. Для частного дома или если не требуется — отправьте «-».")


@dp.message(MeterForm.apartment)
async def meter_apartment(message: types.Message, state: FSMContext):
    data = await state.get_data()
    apt = (message.text or "").strip()
    apartment = None if apt == "-" else apt
    uid = user_id_of(message)
    waiting = await message.answer("Сохранение показаний…", reply_markup=main_kb())
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
        await waiting.edit_text("Не удалось сохранить данные. Повторите попытку позже.")
        await state.clear()
        return
    await state.clear()
    await waiting.edit_text(
        f"Показания сохранены: {RESOURCE_NAMES[data['resource']]} — {reading['value']}\n"
        f"Адрес: {data['street']}, {data['house']}"
        + (f", кв. {apartment}" if apartment else "")
    )


# ---------- адрес ----------

@dp.message(F.text == "🏠 мой адрес")
async def address_start(message: types.Message, state: FSMContext):
    await state.set_state(AddressForm.street)
    await message.answer("Укажите улицу:", reply_markup=cancel_kb())


@dp.message(AddressForm.street)
async def address_street(message: types.Message, state: FSMContext):
    if not message.text or len(message.text.strip()) < 2:
        await message.answer("Укажите улицу текстом.")
        return
    await state.update_data(street=message.text.strip())
    await state.set_state(AddressForm.house)
    await message.answer("Укажите дом:")


@dp.message(AddressForm.house)
async def address_house(message: types.Message, state: FSMContext):
    if not message.text:
        await message.answer("Укажите дом.")
        return
    await state.update_data(house=message.text.strip())
    await state.set_state(AddressForm.apartment)
    await message.answer("Укажите квартиру. Если не требуется — отправьте «-».")


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
        await message.answer("Не удалось сохранить адрес. Повторите попытку позже.", reply_markup=main_kb())
        await state.clear()
        return
    await state.clear()
    await message.answer("Адрес сохранён.", reply_markup=main_kb())


# ---------- заявка вручную ----------

@dp.message(F.text == "📩 создать заявку")
async def ticket_start(message: types.Message, state: FSMContext):
    if not message.from_user:
        return
    try:
        cats = await api_get("/api/categories")
    except httpx.HTTPError:
        await message.answer("Не удалось загрузить категории. Опишите проблему текстом — обращение будет обработано.")
        return
    mapping = {c["name"]: c["slug"] for c in cats}
    cats_cache[message.from_user.id] = mapping
    kb = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=name)] for name in mapping] + [[KeyboardButton(text="❌ отмена")]],
        resize_keyboard=True,
    )
    await state.set_state(TicketForm.category)
    await message.answer("Укажите категорию проблемы:", reply_markup=kb)


@dp.message(TicketForm.category)
async def ticket_category(message: types.Message, state: FSMContext):
    if not message.from_user or not message.text:
        return
    mapping = cats_cache.get(message.from_user.id, {})
    if message.text not in mapping:
        await message.answer("Выберите категорию с помощью кнопок.")
        return
    await state.update_data(category=mapping[message.text])
    await state.set_state(TicketForm.title)
    await message.answer("Укажите краткое название заявки, например: «Отсутствует горячее водоснабжение».", reply_markup=cancel_kb())


@dp.message(TicketForm.title)
async def ticket_title(message: types.Message, state: FSMContext):
    if not message.text or len(message.text.strip()) < 3:
        await message.answer("Название слишком короткое. Уточните формулировку.")
        return
    await state.update_data(title=message.text.strip())
    await state.set_state(TicketForm.description)
    await message.answer("Опишите проблему подробно: адрес и суть неисправности.")


@dp.message(TicketForm.description)
async def ticket_finish(message: types.Message, state: FSMContext):
    data = await state.get_data()
    uid = user_id_of(message)
    waiting = await message.answer("Создаю заявку…", reply_markup=main_kb())
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
        await waiting.edit_text("Не удалось создать заявку. Повторите попытку позже.")
        await state.clear()
        return
    await state.clear()
    await waiting.edit_text(f"Заявка {ticket['id']} создана. Диспетчер уведомлён.")


# ---------- свободный текст → нейронка ----------

@dp.message(F.text == "🆘 описать проблему")
async def prompt_problem(message: types.Message):
    await message.answer("Опишите проблему. Укажите адрес и суть неисправности в одном сообщении.")


@dp.message(F.text)
async def support(message: types.Message):
    if not message.from_user or not message.text:
        return
    waiting = await message.answer("Обрабатываю запрос. Поиск информации в базе знаний…")
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
    except (httpx.HTTPError, ValueError):
        await waiting.edit_text(
            "Сервис временно недоступен. Повторите попытку позже. В случае аварии звоните по номеру 112."
        )
        return

    conv_id = result.get("conversation_id")
    if conv_id:
        conversations[message.from_user.id] = conv_id

    text = (result.get("response") or "Не удалось подготовить ответ. Уточните формулировку.").strip()
    ticket_id = result.get("ticket_id")
    try:
        confidence = float(result.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0

    if ticket_id:
        text += f"\n\nЗаявка {ticket_id} создана. Диспетчер уведомлён."
    elif result.get("escalated"):
        text += "\n\nОбращение передано диспетчеру для рассмотрения."

    if ticket_id or confidence >= 0.6:
        last_support[message.from_user.id] = {
            "conversation_id": conv_id,
            "ticket_id": ticket_id,
        }
        await waiting.edit_text(text[:4000], reply_markup=rate_kb())
    else:
        await waiting.edit_text(text[:4000])

async def main():
    if not TOKEN:
        raise RuntimeError("укажи BOT_TOKEN в .env")
    bot = Bot(token=TOKEN)
    try:
        await bot.set_my_commands([
            types.BotCommand(command="start", description="Начать работу"),
            types.BotCommand(command="register", description="Регистрация и код для сайта"),
            types.BotCommand(command="link", description="Новый код для входа на сайт"),
            types.BotCommand(command="profile", description="Мой профиль"),
            types.BotCommand(command="new", description="Новый диалог"),
            types.BotCommand(command="cancel", description="Отмена"),
        ])
    except Exception:
        pass
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
