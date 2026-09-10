import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

print("Загрузка модели эмбеддингов...")
embedder = SentenceTransformer('cointegrated/rubert-tiny2')

KNOWLEDGE_BASE = [
    "Проблема: отключили горячую воду. Категория: Водоснабжение. Что делать: 1. Проверьте график плановых отключений на сайте УК. 2. Уточните у диспетчера наличие аварии. 3. Если аварии нет, оставьте заявку.",
    "Проблема: не работает лифт. Категория: Лифтовое хозяйство. Что делать: 1. Позвоните в аварийную службу лифтовой компании (номер на 1 этаже). 2. Укажите номер подъезда и этаж. 3. Заявка передана механику.",
    "Проблема: течет стояк отопления. Категория: Отопление. Что делать: 1. Перекройте запорные краны на радиаторе. 2. Подставьте емкость. 3. Срочно вызовите аварийную службу ЖКХ.",
    "Проблема: отключили свет в квартире. Категория: Электрика. Что делать: 1. Проверьте автомат в электрощитке на лестничной площадке. 2. Узнайте у соседей, есть ли свет у них. 3. Обратитесь в аварийную службу электросетей."
]

print("Индексация базы знаний...")
kb_embeddings = embedder.encode(KNOWLEDGE_BASE)
dimension = kb_embeddings.shape[1]
faiss_index = faiss.IndexFlatL2(dimension)
faiss_index.add(np.array(kb_embeddings).astype('float32'))

def search_rag(query: str, k: int = 2) -> str:
    query_vector = embedder.encode([query])
    distances, indices = faiss_index.search(np.array(query_vector).astype('float32'), k)
    results = [KNOWLEDGE_BASE[idx] for idx in indices[0] if idx < len(KNOWLEDGE_BASE)]
    return "\n".join(results)
