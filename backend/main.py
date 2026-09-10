from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import requests
from config import QWEN_API_KEY, QWEN_API_URL
from database import init_db, save_ticket, get_user_tickets, update_ticket_rating
from rag import search_rag

app = FastAPI(title="ЖКХ TechSupport AI", version="1.3")

init_db()


class SupportRequest(BaseModel):
    user_id: str
    message: str


class RatingRequest(BaseModel):
    ticket_id: int
    rating: int = Field(..., ge=1, le=5)


class SupportResponse(BaseModel):
    category: str
    response: str
    escalated: bool
    ticket_id: int
    confidence: float


@app.post("/api/support", response_model=SupportResponse)
def handle_support(req: SupportRequest):
    # 1. Быстрый поиск в векторной базе RAG
    context = search_rag(req.message)

    system_prompt = (
        "Ты — специалист техподдержки ЖКХ. Дай четкую инструкцию на основе контекста. "
        "Если ситуация аварийная, начни ответ с фразы: [ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ].\n\n"
        f"Контекст:\n{context}"
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
        api_response = requests.post(QWEN_API_URL, json=payload, headers=headers, timeout=20)
        res_data = api_response.json()
        ai_text = res_data['choices'][0]['message']['content']
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # 2. Быстрая обработка эскалации и категории
    escalated = "[ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ]" in ai_text
    if escalated:
        ai_text = ai_text.replace("[ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ]", "").strip()
        status, confidence = "Эскалация", 0.99
    else:
        status, confidence = "Решено", 0.93

    category = "Общие вопросы"
    for cat in ["Водоснабжение", "Электрика", "Отопление", "Лифтовое хозяйство"]:
        if cat.lower() in ai_text.lower() or cat.lower() in req.message.lower():
            category = cat
            break

    # 3. Сохранение в SQLite за один запрос
    ticket_id = save_ticket(
        user_id=req.user_id,
        message=req.message,
        category=category,
        ai_response=ai_text,
        status=status,
        escalated=escalated,
        confidence=confidence
    )

    return SupportResponse(
        category=category,
        response=ai_text,
        escalated=escalated,
        ticket_id=ticket_id,
        confidence=confidence
    )

@app.get("/api/receipts/{user_id}")
def get_receipts(user_id: str):
    """Получение квитанций пользователя"""
    receipts = get_user_receipts(user_id)
    return {"user_id": user_id, "receipts": receipts}

@app.get("/api/tickets/{user_id}")
def get_history(user_id: str):
    return {"user_id": user_id, "tickets": get_user_tickets(user_id)}


@app.post("/api/rate")
def rate_ticket(req: RatingRequest):
    if not update_ticket_rating(req.ticket_id, req.rating):
        raise HTTPException(status_code=404, detail="Тикет не найден")
    return {"message": "Успешно", "ticket_id": req.ticket_id}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)