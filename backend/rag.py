"""Small-memory RAG: SQLite FTS5 retrieval plus local Qwen generation."""

from __future__ import annotations

import requests

from config import QWEN_API_KEY, QWEN_API_URL, QWEN_MODEL, QWEN_TIMEOUT
from database import search_knowledge


SYSTEM_PROMPT = """Вы — виртуальный диспетчер коммунальных служб «Ре:Акция».
Отвечайте по-русски, спокойно и конкретно, до 140 слов.
Ваша задача — помочь жителю разобраться с коммунальной проблемой, опираясь на контекст базы знаний и здравый смысл. 

Правила:
1. НИКОГДА не выдумывайте технические данные, которых нет в контексте: номера кабин, модели лифтов, точные телефоны сторонних организаций, адреса, тарифы и сроки приезда аварийных бригад.
2. Если информации в базе недостаточно, но ситуация понятна (например, человек застрял в лифте), дайте базовую безопасную инструкцию (первый шаг для лифта: кнопка вызова диспетчера и звонок 112).
3. Ведите диалог: если данных не хватает, вежливо задайте уточняющие вопросы по очереди (уточните адрес, подъезд и суть проблемы), чтобы понять масштаб аварии.
4. Если проблему нельзя решить стандартными инструкциями из базы или требуется вмешательство выездной бригады, сообщите об этом жителю и направьте в официальную поддержку службы «Ре:Акция».
   В этом случае в конце ответа добавьте на отдельной строке маркер [ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ].
5. Если пользователь просит оператора, диспетчера или живого человека — вежливо ответьте по сути и тоже добавьте в конце маркер [ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ]."""


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
            "temperature": 0.7,
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
        "Уточните, пожалуйста, ваш адрес, подъезд и подробнее расскажите, "
        "что именно произошло, чтобы я мог передать заявку в поддержку."
    )


def search_rag(query: str, k: int = 3) -> str:
    """Compatibility helper used by early clients."""
    return render_context(retrieve(query, k))
