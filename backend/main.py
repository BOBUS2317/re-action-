from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import requests
from config import QWEN_API_KEY, QWEN_API_URL
from database import init_db, save_ticket
from rag import search_rag

app = FastAPI(title="ЖКХ TechSupport AI", version="1.0")

init_db()

class SupportRequest(BaseModel):
    user_id: str = Field(..., description="Уникальный идентификатор пользователя")
    message: str = Field(..., description="Текст обращения пользователя в свободной форме")

class SupportResponse(BaseModel):
    category: str
    response: str
    escalated: bool
    ticket_id: int

@app.post("/api/support", response_model=SupportResponse)
def handle_support(req: SupportRequest):
    context = search_rag(req.message)

    system_prompt = (
        "Ты — профессиональный виртуальный помощник технической поддержки управляющей компании в сфере ЖКХ. "
        "Твоя задача — помочь пользователю решить проблему быстро, опираясь ИСКЛЮЧИТЕЛЬНО на предоставленный контекст базы знаний.\n\n"
        "СТРОГИЕ ПРАВИЛА:\n"
        "1. Используй только факты и инструкции из раздела 'Контекст базы знаний'. Если ответа там нет, честно скажи об этом и предложи эскалацию.\n"
        "2. Определи категорию обращения (например: Водоснабжение, Электрика, Отопление, Лифтовое хозяйство).\n"
        "3. Если информации от пользователя недостаточно для решения, задай 1-2 конкретных уточняющих вопроса.\n"
        "4. Если проблема аварийная (прорыв трубы, замыкание, пожар) или пользователь требует живого человека, "
        "начни свой ответ с тега: [ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ].\n\n"
        f"Контекст базы знаний:\n{context}"
    )
    
    payload = {
        "model": "qwen/qwen-2.5-7b-instruct",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.message}
        ],
        "temperature": 0.1  # Снижаем температуру до минимума, чтобы модель не фантазировала
    }
    
    headers = {
        "Authorization": f"Bearer {QWEN_API_KEY}",
        "Content-Type": "application/json"
    }
    
    try:
        api_response = requests.post(QWEN_API_URL, json=payload, headers=headers, timeout=30)
        res_data = api_response.json()
        ai_text = res_data['choices'][0]['message']['content']
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка обращения к LLM API: {str(e)}")
    
    # 3. Обработка эскалации
    escalated = False
    if "[ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ]" in ai_text:
        escalated = True
        ai_text = ai_text.replace("[ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ]", "").strip()
        status = "Эскалация оператору"
    else:
        status = "В работе / Решено"

    # 4. Автоматическое определение категории
    category = "Общие вопросы ЖКХ"
    for cat in ["Водоснабжение", "Электрика", "Отопление", "Лифтовое хозяйство"]:
        if cat.lower() in ai_text.lower() or cat.lower() in req.message.lower():
            category = cat
            break

    # 5. Сохранение тикета в SQLite
    ticket_id = save_ticket(
        user_id=req.user_id,
        message=req.message,
        category=category,
        ai_response=ai_text,
        status=status,
        escalated=escalated
    )

    return SupportResponse(
        category=category,
        response=ai_text,
        escalated=escalated,
        ticket_id=ticket_id
    )
