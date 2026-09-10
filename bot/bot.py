import asyncio
import os

import httpx
from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import Command, CommandStart
from dotenv import load_dotenv


load_dotenv()
TOKEN = os.getenv("BOT_TOKEN")
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8000").rstrip("/")
dp = Dispatcher()
conversations: dict[int, str] = {}


@dp.message(CommandStart())
async def start(message: types.Message):
    await message.answer(
        "Здравствуйте! Я помощник «Ре:Акция». Опишите коммунальную проблему своими словами.\n\n"
        "При угрозе жизни сразу звоните 112; при запахе газа — 104 или 112."
    )


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
