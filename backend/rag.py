"""Small-memory RAG: SQLite FTS5 retrieval plus local Qwen generation."""

from __future__ import annotationsfrom __future__ import annotations

import os
import requests
from dotenv import load_dotenv

load_dotenv()

QWEN_API_KEY = os.getenv("QWEN_API_KEY", "")
QWEN_API_URL = os.getenv("QWEN_API_URL", "https://openrouter.ai/api/v1/chat/completions")

# Здесь можно оставить вашу текущую логику поиска по векторной базе / словарям
def retrieve(query: str) -> list[dict]:
    """
    Заглушка или ваша реализация поиска по RAG (базе знаний).
    Должна возвращать список словарей с ключами: title, source_name, source_url, updated_at, body/content, category, category_name.
    """
    # Пример структуры, которую ожидает бэкенд:
    return [
        {
            "title": "Общие правила техподдержки ЖКХ",
            "source_name": "Регламент ЖКХ",
            "source_url": None,
            "updated_at": "2026-01-01",
            "category": "other",
            "category_name": "Общие вопросы",
            "content": "Стандартный регламент работы технической поддержки управляющей компании."
        }
    ]

def ask_qwen(message: str, context: list[dict], previous_messages: list[dict]) -> str:
    """
    Отправляет запрос к API Qwen со строгим системным промптом, 
чтобы нейросеть безошибочно реагировала на ключевые слова и контекст.
    """
    # Собираем текстовый контекст из RAG
    context_text = "\n\n".join([item.get("content", item.get("title", "")) for item in context])

    # Строгий системный промпт с четкой инструкцией по ключевым словам и эскалации
    system_prompt = (
        "Ты — профессиональный виртуальный помощник технической поддержки управляющей компании в сфере ЖКХ. "
        "Твоя задача — помочь пользователю решить проблему быстро, опираясь ИСКЛЮЧИТЕЛЬНО на предоставленный контекст базы знаний.\n\n"
        "ПРАВИЛА РЕАГИРОВАНИЯ НА КЛЮЧЕВЫЕ СЛОВА И ТЕКСТ:\n"
        "1. Используй только факты из раздела 'Контекст базы знаний'. Если ответа там нет, сообщи об этом.\n"
        "2. КРИТИЧЕСКИ ВАЖНО: Если в сообщении пользователя есть ключевые слова, связанные с авариями (утечка газа, пожар, искрит, прорыв трубы, человек застрял) "
        "или пользователь явно просит перевести на оператора / живого человека / создать заявку, ты ОБЯЗАТЕЛЬНО должен начать свой ответ с тега: [ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ].\n"
        "3. Отвечай вежливо, строго по делу, на «вы».\n\n"
        f"Контекст базы знаний:\n{context_text}"
    )

    # Формируем историю сообщений для диалога
    messages = [{"role": "system", "content": system_prompt}]
    
    for msg in previous_messages[-5:]:  льем последние 5 сообщений для контекста диалога
        role = "user" if msg.get("role") == "user" else "assistant"
        messages.append({"role": role, "content": msg.get("content", "")})
    
    messages.append({"role": "user", "content": message})

    payload = {
        "model": "qwen/qwen-2.5-7b-instruct",
        "messages": messages,
        "temperature": 0.1  # Низкая температура исключает «фантазии» и заставляет четко следовать ключевым словам
    }

    headers = {
        "Authorization": f"Bearer {QWEN_API_KEY}",
        "Content-Type": "application/json"
    }

    response = requests.post(QWEN_API_URL, json=payload, headers=headers, timeout=30)
    response.raise_for_status()
    data = response.json()
    
    return data["choices"][0]["message"]["content"]

def fallback_answer(context: list[dict]) -> str:
    if context:
        return f"Рекомендуем ознакомиться с материалом: {context[0].get('title', 'Инструкция')}."
    return "Извините, не удалось найти точную информацию по вашему запросу. Перевожу на оператора. [ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ]"

import requests

from config import QWEN_API_KEY, QWEN_API_URL, QWEN_MODEL, QWEN_TIMEOUT
from database import search_knowledge


SYSTEM_PROMPT = """Вы — виртуальный диспетчер коммунальных служб «Ре:Акция».
Отвечайте по-русски, спокойно и конкретно. Используйте только предоставленный контекст.
Не выдумывайте телефоны, адреса, сроки, тарифы или нормы.
Если данных недостаточно, задайте ровно один вопрос, необходимый для следующего шага.
Если решение известно, дайте от двух до четырёх коротких нумерованных шагов.
При угрозе жизни первым действием укажите звонок 112.
Не удаляйте и не смягчайте инструкции по безопасности. Ответ — до 140 слов."""


def retrieve(query: str, limit: int = 3) -> list[dict]:
    return search_knowledge(query, limit)


def render_context(items: list[dict]) -> str:
    if not items:
        return "В базе знаний нет подходящей подтверждённой инструкции."
    return "\n\n".join(
        f"[{item['title']}; категория: {item['category_name']}; "
        f"источник: {item['source_name']}; обновлено: {item['updated_at']}]\n{item['body']}"
        for item in items
    )


def ask_qwen(message: str, context: list[dict], history: list[dict]) -> str:
    headers = {"Content-Type": "application/json"}
    if QWEN_API_KEY:
        headers["Authorization"] = f"Bearer {QWEN_API_KEY}"
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history[-6:])
    messages.append(
        {
            "role": "user",
            "content": f"КОНТЕКСТ БАЗЫ ЗНАНИЙ:\n{render_context(context)}\n\nВОПРОС ЖИТЕЛЯ:\n{message}",
        }
    )
    response = requests.post(
        QWEN_API_URL,
        headers=headers,
        json={
            "model": QWEN_MODEL,
            "messages": messages,
            "temperature": 0.15,
            "max_tokens": 384,
        },
        timeout=QWEN_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"].strip()


def fallback_answer(context: list[dict]) -> str:
    if context:
        return context[0]["body"]
    return (
        "Уточните, пожалуйста, что именно произошло и где: "
        "в квартире, подъезде или во всём доме?"
    )


def search_rag(query: str, k: int = 3) -> str:
    """Compatibility helper used by early clients."""
    return render_context(retrieve(query, k))
