"""Small-memory RAG: SQLite FTS5 retrieval plus local Qwen generation."""

from __future__ import annotations

import requests

from config import QWEN_API_KEY, QWEN_API_URL, QWEN_MODEL, QWEN_TIMEOUT
from database import search_knowledge


SYSTEM_PROMPT = """Вы — виртуальный диспетчер коммунальных служб «Ре:Акция».
Отвечайте по-русски, спокойно и конкретно, до 140 слов.
Используйте ТОЛЬКО контекст ниже. Если в контексте нет ответа про лифт, кабину, этаж — так и скажите: точной инструкции в базе нет.
ЗАПРЕЩЕНО выдумывать: номера кабин, модели лифтов, телефоны, адреса, сроки приезда, тарифы, нормы.
Если данных нет — задайте ровно один уточняющий вопрос: адрес, подъезд и что случилось.
Если человек в кабине — первый шаг: кнопка вызова диспетчера и звонок 112.
Дайте 2-4 коротких шага, без воды."""


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
    clean: list[dict] = []
    for m in (history or [])[-4:]:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        content = m.get("content")
        if role in ("user", "assistant") and content:
            clean.append({"role": role, "content": content})
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(clean)
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
            "temperature": 0.1,
            "top_p": 0.85,
            "repeat_penalty": 1.1,
            "max_tokens": 300,
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
