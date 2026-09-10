import os
from dotenv import load_dotenv

load_dotenv()

QWEN_API_KEY = os.getenv("QWEN_API_KEY", "api_ключ_сюда")
QWEN_API_URL = os.getenv("QWEN_API_URL", "https://openrouter.ai/api/v1/chat/completions")
DB_NAME = "support_tickets.db"
