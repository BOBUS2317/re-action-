import os
import faiss
import numpy as np
import requests
from sentence_transformers import SentenceTransformer
from gigachat import GigaChat

# Загружаем ключ GigaChat
GIGACHAT_CREDENTIALS = os.getenv("GIGACHAT_CREDENTIALS", "")

giga_client = GigaChat(
    credentials=GIGACHAT_CREDENTIALS, 
    verify_ssl_certs=False, 
    scope="GIGACHAT_API_CORP" # Или PERS, в зависимости от того, что заработало
)

print("Загрузка модели эмбеддингов rubert-tiny2...")
embedder = SentenceTransformer('cointegrated/rubert-tiny2')

# 1. Структура базы знаний, которую ждет ваш main.py
KNOWLEDGE_BASE = [
    {
        "category": "elevator",
        "category_name": "Лифтовое хозяйство",
        "default_priority": "emergency",
        "title": "Застрял в лифте",
        "body": "Нажмите кнопку вызова диспетчера в кабине. Не пытайтесь открыть двери самостоятельно. Ожидайте механика.",
        "source_name": "Правила ТБ",
        "source_url": None,
        "updated_at": "2024-01-01"
    },
    {
        "category": "water",
        "category_name": "Водоснабжение",
        "default_priority": "normal",
        "title": "Нет горячей воды или течет труба",
        "body": "Проверьте график плановых отключений. Если произошел прорыв трубы, перекройте запорные краны и срочно вызовите аварийную службу.",
        "source_name": "Регламент УК",
        "source_url": None,
        "updated_at": "2024-01-01"
    },
    {
        "category": "electricity",
        "category_name": "Электрика",
        "default_priority": "normal",
        "title": "Отключили свет",
        "body": "Проверьте автоматы в электрощитке на лестничной площадке. Если свет пропал во всем доме, обратитесь в диспетчерскую электросетей.",
        "source_name": "Памятка жильца",
        "source_url": None,
        "updated_at": "2024-01-01"
    }
]

# 2. Инициализация индекса FAISS
dimension = 312 # Размерность векторов rubert-tiny2
faiss_index = faiss.IndexFlatL2(dimension)

if KNOWLEDGE_BASE:
    # Объединяем заголовок и тело для лучшего поиска
    texts = [f"{item['title']}. {item['body']}" for item in KNOWLEDGE_BASE]
    embeddings = embedder.encode(texts)
    faiss_index.add(np.array(embeddings).astype('float32'))


def retrieve(message: str, k: int = 1) -> list:
    """Функция векторного поиска (RAG)"""
    if faiss_index.ntotal == 0 or not message.strip():
        return []
        
    # Векторизуем запрос пользователя
    query_vector = embedder.encode([message])
    
    # Ищем самую похожую статью (k=1)
    distances, indices = faiss_index.search(np.array(query_vector).astype('float32'), k)
    
    results = []
    for idx in indices[0]:
        if idx != -1 and idx < len(KNOWLEDGE_BASE):
            results.append(KNOWLEDGE_BASE[idx])
            
    return results

def fallback_answer(context: list) -> str:
    return "Извините, сервис временно недоступен. Пожалуйста, позвоните в диспетчерскую службу."

def ask_qwen(message: str, context: list, previous_messages: list) -> str:
    if context:
        context_text = "\n".join([f"- {c.get('title', '')}: {c.get('body', '')}" for c in context])
    else:
        context_text = "Информации нет."

    system_prompt = (
        "Ты — виртуальный помощник ЖКХ. Опирайся ТОЛЬКО на контекст.\n"
        "ОТВЕЧАЙ ОЧЕНЬ КРАТКО, МАКСИМУМ 1-2 ПРЕДЛОЖЕНИЯ.\n"
        "Если авария — начни ответ с: [ТРЕБУЕТСЯ_ЭСКАЛАЦИЯ].\n\n"
        f"Контекст:\n{context_text}"
    )

    try:
        payload_messages = [{"role": "system", "content": system_prompt}]
        
        if previous_messages:
            for msg in previous_messages[-2:]: # Берем только 2 последних сообщения, а не 4
                payload_messages.append({
                    "role": msg["role"], 
                    "content": msg.get("content", "")
                })
                
        payload_messages.append({"role": "user", "content": message})
        
        # Используем глобальный клиент
        response = giga_client.chat({
            "model": "GigaChat",     # 2. Выбираем самую быструю Lite-модель
            "messages": payload_messages,
            "temperature": 0.1,
            "max_tokens": 100        # 3. Жестко режем длину ответа
        })
        
        return response.choices[0].message.content

    except Exception as exc:
        print(f"ОШИБКА LLM: {exc}")
        raise requests.RequestException("Сбой GigaChat")
