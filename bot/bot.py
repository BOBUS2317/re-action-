import asyncio
import os

import httpx
from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import KeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove
from dotenv import load_dotenv


load_dotenv()
TOKEN = os.getenv("BOT_TOKEN")
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000").rstrip("/")
dp = Dispatcher()
conversations: dict[int, str] = {}


class Registration(StatesGroup):
    phone = State()
    city = State()
    street = State()
    house = State()
    apartment = State()


def phone_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="Отправить мой телефон", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


async def request_link_code(telegram_id: int) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{BACKEND_URL}/api/telegram/link-code",
                json={"telegram_id": str(telegram_id)},
            )
            response.raise_for_status()
        return response.json()["link_code"]
    except httpx.HTTPError:
        return None


@dp.message(CommandStart())
async def start(message: types.Message):
    await message.answer(
        "Здравствуйте! Я помощник «Ре:Акция». Для регистрации используйте /register. "
        "После неё я выдам код для входа на сайте.\n\n"
        "Команды: /register — регистрация, /link — новый код, /new — новый диалог.\n\n"
        "При угрозе жизни сразу звоните 112; при запахе газа — 104 или 112."
    )


@dp.message(Command("register"))
async def begin_registration(message: types.Message, state: FSMContext):
    await state.clear()
    await state.set_state(Registration.phone)
    await message.answer(
        "Отправьте номер телефона кнопкой или напишите его сообщением.",
        reply_markup=phone_keyboard(),
    )


@dp.message(Registration.phone)
async def registration_phone(message: types.Message, state: FSMContext):
    if not message.from_user:
        return
    if message.contact and message.contact.user_id not in (None, message.from_user.id):
        await message.answer("Отправьте, пожалуйста, собственный контакт.")
        return
    phone = message.contact.phone_number if message.contact else (message.text or "").strip()
    if len(phone) < 7:
        await message.answer("Номер слишком короткий. Попробуйте ещё раз.")
        return
    await state.update_data(phone=phone)
    await state.set_state(Registration.city)
    await message.answer("Укажите город.", reply_markup=ReplyKeyboardRemove())


@dp.message(Registration.city, F.text)
async def registration_city(message: types.Message, state: FSMContext):
    await state.update_data(city=message.text.strip())
    await state.set_state(Registration.street)
    await message.answer("Укажите улицу.")


@dp.message(Registration.street, F.text)
async def registration_street(message: types.Message, state: FSMContext):
    await state.update_data(street=message.text.strip())
    await state.set_state(Registration.house)
    await message.answer("Укажите номер дома, например: 15 или 15А.")


@dp.message(Registration.house, F.text)
async def registration_house(message: types.Message, state: FSMContext):
    await state.update_data(house=message.text.strip())
    await state.set_state(Registration.apartment)
    await message.answer("Укажите квартиру. Если квартиры нет, отправьте «-».")


@dp.message(Registration.apartment, F.text)
async def registration_apartment(message: types.Message, state: FSMContext):
    if not message.from_user:
        return
    data = await state.get_data()
    apartment = message.text.strip()
    payload = {
        "telegram_id": str(message.from_user.id),
        "telegram_username": message.from_user.username,
        "display_name": message.from_user.full_name,
        "phone": data["phone"],
        "city": data["city"],
        "street": data["street"],
        "house": data["house"],
        "apartment": None if apartment == "-" else apartment,
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(f"{BACKEND_URL}/api/telegram/register", json=payload)
            response.raise_for_status()
        result = response.json()
        await state.clear()
        await message.answer(
            "Регистрация завершена.\n"
            f"Код привязки сайта: {result['link_code']}\n\n"
            "Введите его на сайте в карточке профиля. Код действует 15 минут."
        )
    except httpx.HTTPError:
        await message.answer("Не удалось сохранить регистрацию. Попробуйте /register ещё раз.")


@dp.message(Command("link"))
async def new_link_code(message: types.Message):
    if not message.from_user:
        return
    code = await request_link_code(message.from_user.id)
    if code:
        await message.answer(f"Код привязки сайта: {code}\nОн действует 15 минут.")
    else:
        await message.answer("Сначала пройдите регистрацию: /register")


@dp.message(Command("new"))
async def new_dialog(message: types.Message):
    if message.from_user:
        conversations.pop(message.from_user.id, None)
    await message.answer("Начинаем новое обращение. Что произошло?")


@dp.message(F.text)
async def support(message: types.Message):
    if not message.from_user or not message.text:
        return
    waiting = await message.answer("Ищу ответ в базе знаний…")
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
        conversations[message.from_user.id] = result["conversation_id"]
        details = (
            f"\n\nКатегория: {result['category_name']} · "
            f"уверенность {round(result['confidence'] * 100)}%"
        )
        if result.get("ticket_id"):
            details += f"\nЗаявка: {result['ticket_id']}"
        await waiting.edit_text(result["response"] + details)
    except httpx.HTTPError:
        await waiting.edit_text(
            "Сервис временно недоступен. Попробуйте позже. При аварии звоните 112."
        )


async def main():
    if not TOKEN:
        raise RuntimeError("Укажите BOT_TOKEN в файле .env")
    bot = Bot(token=TOKEN)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
