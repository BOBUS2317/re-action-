from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import requests
from config import QWEN_API_KEY, QWEN_API_URL
from database import init_db, save_ticket
from rag import search_rag

app = FastAPI(title="ЖКХ TechSupport AI", version="1.0")

init_db()

class SupportRequest(BaseModel):
    user_id: str = Field(..., description="Уникальный идентификатор пользователя (Telegram ID или сессия сайта)")
    message: str = Field(..., description="Текст обращения пользователя в свободной форме")

class SupportResponse(BaseModel):
    category: str
    response: str
    escalated: bool
    ticket_id: int

@app.post("/api/support", response_model=SupportResponse)
def handle_support(req: SupportRequest):
    # 1. Поиск релевантного контекста через RAG
    context = search_rag(req.message)
    
    # 2. Настройка роли техподдержки и логики эскалации
    system_prompt = (
        "Ты — главный специалист виртуальной технической поддержки управляющей компании в сфере ЖКХ. "
        "Твоя задача: понять проблему пользователя, определить категорию обращения "
        "(например: Водоснабжение, Электрика, Отопление, Лифтовое хозяйство, Общедомовое имущество), "
        "задать уточняющие вопросы, ЕСЛИ информации недостаточно, "
        "или выдать четкую последовательность действий на основе контекста.\n\n"
        "ВАЖНОЕ ПРАВИЛО ЭСКАЛАЦИИ:\n"
        "Если проблема аварийная (прорыв трубы, замыкание проводки, пожар, падение конструкций) "
        "или пользователь явно просит позвать оператора/живого человека, "
        "ты ОБЯЗАТЕЛЬНО должен начать свой ответ с ключевой фразы: [ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ].\n\n"
        "Правила:\n"
        "- Общайся вежливо, строго по делу, на «вы».\n"
        "- Используй ТОЛЬКО факты из контекста ниже.\n\n"
        f"Контекст базы знаний:\n{context}"
    )
    
    payload = {
        "model": "qwen/qwen-2.5-7b-instruct",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.message}
        ],
        "temperature": 0.2
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

    escalated = False
    if "[ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ]" in ai_text:
        escalated = True
        ai_text = ai_text.replace("[ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ]", "").strip()
        status = "Эскалация оператору"
    else:
        status = "В работе / Решено"

    category = "Общие вопросы ЖКХ"
    for cat in ["Водоснабжение", "Электрика", "Отопление", "Лифтовое хозяйство"]:
        if cat.lower() in ai_text.lower() or cat.lower() in req.message.lower():
            category = cat
            break

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
