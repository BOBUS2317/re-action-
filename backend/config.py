import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv() -> bool:
        return False

load_dotenv()

DB_NAME = os.getenv("DB_NAME", str(Path("data") / "support.db"))
QWEN_API_URL = os.getenv("QWEN_API_URL", "http://localhost:8080/v1/chat/completions")
QWEN_MODEL = os.getenv("QWEN_MODEL", "Qwen2.5-1.5B-Instruct")
QWEN_API_KEY = os.getenv("QWEN_API_KEY", "")
QWEN_TIMEOUT = float(os.getenv("QWEN_TIMEOUT", "75"))
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost").split(",")
    if origin.strip()
]
