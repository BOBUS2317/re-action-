import sqlite3
from config import DB_NAME

def init_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            message TEXT,
            category TEXT,
            ai_response TEXT,
            status TEXT,
            escalated BOOLEAN,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def save_ticket(user_id: str, message: str, category: str, ai_response: str, status: str, escalated: bool) -> int:
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO tickets (user_id, message, category, ai_response, status, escalated)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (user_id, message, category, ai_response, status, escalated))
    conn.commit()
    ticket_id = cursor.lastrowid
    conn.close()
    return ticket_id
