import os
import requests
from gigachat import GigaChat

# Загружаем токен GigaChat
GIGACHAT_CREDENTIALS = os.getenv("GIGACHAT_CREDENTIALS", "")

def retrieve(message: str) -> list:
    """Функция поиска по векторной базе (FAISS)"""
    # Здесь должен быть ваш реальный поиск по RAG
    # Возвращаем пустой список для теста, если базы пока нет
    return []

def fallback_answer(context: list) -> str:
    """Ответ-заглушка на случай падения LLM API"""
    return "Извините, сервис временно перегружен. Для срочного решения вопроса позвоните по номеру 112 или в диспетчерскую."

def ask_qwen(message: str, context: list, previous_messages: list) -> str:
    """
    Вызов GigaChat (название оставлено ask_qwen для совместимости с main.py).
    """
    # 1. Формируем текст из найденных регламентов RAG
    if context:
        context_text = "\n".join([f"- {c.get('title', '')}: {c.get('body', c.get('source_name', ''))}" for c in context])
    else:
        context_text = "Информации в базе знаний не найдено."

    # 2. Строгий промпт
    system_prompt = (
        "Ты — профессиональный виртуальный помощник технической поддержки ЖКХ. "
        "Твоя задача — помочь пользователю, опираясь ИСКЛЮЧИТЕЛЬНО на контекст базы знаний.\n"
        "СТРОГИЕ ПРАВИЛА:\n"
        "1. Не придумывай законы и факты, которых нет в контексте.\n"
        "2. Если проблема аварийная (прорыв трубы, газ, пожар) или человек просит оператора, "
        "ОБЯЗАТЕЛЬНО начни ответ с тега: [ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ].\n\n"
        f"Контекст базы знаний:\n{context_text}"
    )

    # 3. Вызов API GigaChat
    try:
        # verify_ssl_certs=False - критически важно для обхода ошибок сертификатов Минцифры
        with GigaChat(credentials=GIGACHAT_CREDENTIALS, verify_ssl_certs=False, scope="GIGACHAT_API_PERS") as giga:
            payload_messages = [{"role": "system", "content": system_prompt}]
            
            # Добавляем историю диалога (последние 4 сообщения, чтобы не перегружать контекст)
            if previous_messages:
                for msg in previous_messages[-4:]:
                    payload_messages.append({
                        "role": msg["role"], 
                        "content": msg.get("content", "")
                    })
                    
            # Добавляем текущий запрос пользователя
            payload_messages.append({"role": "user", "content": message})
            
            # Отправляем запрос (низкая температура защищает от "бреда")
            response = giga.chat({
                "messages": payload_messages,
                "temperature": 0.1 
            })
            
            return response.choices[0].message.content

    except Exception as exc:
        # ВАЖНО: Выводим ошибку в логи контейнера!
        print("\n" + "="*50)
        print(f"🚨 КРИТИЧЕСКАЯ ОШИБКА GIGACHAT: {exc}")
        print("="*50 + "\n")
        
        # Пробрасываем ошибку дальше, чтобы main.py перехватил её и выдал fallback_answer
        raise requests.RequestException(f"Сбой LLM API: {exc}")