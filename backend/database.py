import sqlite3
from config import DB_NAME

def init_db():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    # Одна таблица со всеми нужными полями для максимального быстродействия
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            message TEXT,
            category TEXT,
            ai_response TEXT,
            status TEXT,
            escalated BOOLEAN,
            confidence REAL DEFAULT 0.95,
            rating INTEGER DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def save_ticket(user_id: str, message: str, category: str, ai_response: str, status: str, escalated: bool, confidence: float) -> int:
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO tickets (user_id, message, category, ai_response, status, escalated, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, message, category, ai_response, status, escalated, confidence))
    conn.commit()
    ticket_id = cursor.lastrowid
    conn.close()
    return ticket_id

def get_user_tickets(user_id: str) -> list[dict]:
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM tickets WHERE user_id = ? ORDER BY id DESC', (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def update_ticket_rating(ticket_id: int, rating: int) -> bool:
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    cursor.execute('UPDATE tickets SET rating = ? WHERE id = ?', (rating, ticket_id))
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated