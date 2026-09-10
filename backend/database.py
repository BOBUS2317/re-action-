"""SQLite persistence and full-text knowledge search for the MVP."""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from config import DB_NAME


BASE_DIR = Path(__file__).resolve().parent
MIGRATIONS_DIR = BASE_DIR / "migrations"
DB_PATH = Path(DB_NAME)
if not DB_PATH.is_absolute():
    DB_PATH = BASE_DIR / DB_PATH


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class ClosingConnection(sqlite3.Connection):
    """Commit or roll back, then always release the SQLite file handle."""

    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10, factory=ClosingConnection)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def init_db() -> None:
    """Apply every migration exactly once."""
    with connect() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations "
            "(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        )
        applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.name in applied:
                continue
            conn.executescript(path.read_text(encoding="utf-8"))
            conn.execute("INSERT INTO schema_migrations(version) VALUES (?)", (path.name,))
        conn.execute("INSERT INTO knowledge_fts(knowledge_fts) VALUES ('rebuild')")
        conn.execute("PRAGMA optimize")


def ensure_user(
    user_id: str,
    channel: str,
    external_id: str | None = None,
    display_name: str | None = None,
    phone: str | None = None,
) -> dict[str, Any]:
    now = utc_now()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO users(id, channel, external_id, display_name, phone, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              display_name=COALESCE(excluded.display_name, users.display_name),
              phone=COALESCE(excluded.phone, users.phone),
              updated_at=excluded.updated_at
            """,
            (user_id, channel, external_id, display_name, phone, now, now),
        )
        return dict(conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())


def add_address(
    user_id: str,
    street: str,
    house: str,
    city: str = "Томск",
    building: str | None = None,
    apartment: str | None = None,
    entrance: str | None = None,
    floor: str | None = None,
    is_primary: bool = True,
) -> dict[str, Any]:
    with connect() as conn:
        if is_primary:
            conn.execute("UPDATE addresses SET is_primary=0 WHERE user_id=?", (user_id,))
        cursor = conn.execute(
            """
            INSERT INTO addresses(user_id, city, street, house, building, apartment, entrance, floor, is_primary)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, city, street, house, building, apartment, entrance, floor, int(is_primary)),
        )
        return dict(conn.execute("SELECT * FROM addresses WHERE id=?", (cursor.lastrowid,)).fetchone())


def get_or_create_conversation(
    user_id: str,
    channel: str,
    conversation_id: str | None = None,
) -> dict[str, Any]:
    with connect() as conn:
        if conversation_id:
            row = conn.execute(
                "SELECT * FROM conversations WHERE id=? AND user_id=?",
                (conversation_id, user_id),
            ).fetchone()
            if row:
                return dict(row)
        new_id = f"conv_{uuid4().hex}"
        conn.execute(
            "INSERT INTO conversations(id, user_id, channel) VALUES (?, ?, ?)",
            (new_id, user_id, channel),
        )
        return dict(conn.execute("SELECT * FROM conversations WHERE id=?", (new_id,)).fetchone())


def append_message(
    conversation_id: str,
    role: str,
    content: str,
    model: str | None = None,
    confidence: float | None = None,
) -> int:
    with connect() as conn:
        cursor = conn.execute(
            "INSERT INTO messages(conversation_id, role, content, model, confidence) VALUES (?, ?, ?, ?, ?)",
            (conversation_id, role, content, model, confidence),
        )
        conn.execute("UPDATE conversations SET updated_at=? WHERE id=?", (utc_now(), conversation_id))
        return int(cursor.lastrowid)


def get_history(conversation_id: str, limit: int = 8) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT ?",
            (conversation_id, limit),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]


STOP_WORDS = {"что", "как", "где", "когда", "это", "или", "нет", "мне", "меня", "очень", "уже"}


def _fts_query(text: str) -> str:
    words = re.findall(r"[0-9A-Za-zА-Яа-яЁё]+", text.lower())
    stems: list[str] = []
    for word in words:
        if word in STOP_WORDS or len(word) < 3:
            continue
        stem = word[: max(3, min(len(word), 5))]
        if stem not in stems:
            stems.append(stem)
    return " OR ".join(f'"{stem}"*' for stem in stems[:12])


def search_knowledge(query: str, limit: int = 3) -> list[dict[str, Any]]:
    fts_query = _fts_query(query)
    if not fts_query:
        return []
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT a.id, a.slug, c.slug AS category, c.name AS category_name,
                   c.default_priority, a.title, a.body, a.source_name,
                   a.source_url, a.is_emergency, a.updated_at, bm25(knowledge_fts) AS rank
            FROM knowledge_fts
            JOIN knowledge_articles a ON a.id=knowledge_fts.rowid
            JOIN service_categories c ON c.id=a.category_id
            WHERE knowledge_fts MATCH ? AND a.is_active=1
            ORDER BY rank LIMIT ?
            """,
            (fts_query, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def upsert_knowledge_article(
    category_slug: str,
    slug: str,
    title: str,
    body: str,
    keywords: str,
    source_name: str,
    source_url: str | None = None,
    is_emergency: bool = False,
    published_at: str | None = None,
) -> dict[str, Any]:
    now = utc_now()
    with connect() as conn:
        category = conn.execute(
            "SELECT id FROM service_categories WHERE slug=? AND is_active=1",
            (category_slug,),
        ).fetchone()
        if not category:
            raise ValueError("Unknown category")
        conn.execute(
            """
            INSERT INTO knowledge_articles(
              category_id, slug, title, body, keywords, source_name, source_url,
              is_emergency, published_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
              category_id=excluded.category_id,
              title=excluded.title,
              body=excluded.body,
              keywords=excluded.keywords,
              source_name=excluded.source_name,
              source_url=excluded.source_url,
              is_emergency=excluded.is_emergency,
              published_at=excluded.published_at,
              updated_at=excluded.updated_at,
              is_active=1
            """,
            (
                category["id"], slug, title, body, keywords, source_name,
                source_url, int(is_emergency), published_at, now,
            ),
        )
        row = conn.execute(
            """
            SELECT a.*, c.slug AS category, c.name AS category_name
            FROM knowledge_articles a
            JOIN service_categories c ON c.id=a.category_id
            WHERE a.slug=?
            """,
            (slug,),
        ).fetchone()
        return dict(row)


def set_conversation_category(conversation_id: str, category_slug: str, status: str) -> None:
    with connect() as conn:
        conn.execute(
            """
            UPDATE conversations
            SET category_id=(SELECT id FROM service_categories WHERE slug=?), status=?, updated_at=?
            WHERE id=?
            """,
            (category_slug, status, utc_now(), conversation_id),
        )


def create_ticket(
    user_id: str,
    conversation_id: str | None,
    category_slug: str,
    title: str,
    description: str,
    priority: str = "normal",
    address_id: int | None = None,
    organization_id: int | None = None,
    escalated: bool = True,
) -> dict[str, Any]:
    ticket_id = f"RA-{datetime.now():%Y%m%d}-{uuid4().hex[:6].upper()}"
    now = utc_now()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO tickets(
              id, conversation_id, user_id, address_id, category_id, organization_id,
              title, description, priority, status, escalated, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, (SELECT id FROM service_categories WHERE slug=?), ?, ?, ?, ?, 'new', ?, ?, ?)
            """,
            (
                ticket_id, conversation_id, user_id, address_id, category_slug,
                organization_id, title, description, priority, int(escalated), now, now,
            ),
        )
        conn.execute(
            "INSERT INTO ticket_events(ticket_id, to_status, actor, note) VALUES (?, 'new', 'system', ?)",
            (ticket_id, "Заявка создана виртуальным помощником"),
        )
        if conversation_id:
            conn.execute(
                "UPDATE conversations SET status='escalated', updated_at=? WHERE id=?",
                (now, conversation_id),
            )
        return dict(conn.execute(
            """
            SELECT t.*, c.slug AS category, c.name AS category_name
            FROM tickets t JOIN service_categories c ON c.id=t.category_id WHERE t.id=?
            """,
            (ticket_id,),
        ).fetchone())


def get_ticket(ticket_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        ticket = conn.execute(
            """
            SELECT t.*, c.slug AS category, c.name AS category_name, o.name AS organization_name
            FROM tickets t
            JOIN service_categories c ON c.id=t.category_id
            LEFT JOIN organizations o ON o.id=t.organization_id
            WHERE t.id=?
            """,
            (ticket_id,),
        ).fetchone()
        if not ticket:
            return None
        result = dict(ticket)
        result["events"] = [
            dict(row) for row in conn.execute(
                "SELECT * FROM ticket_events WHERE ticket_id=? ORDER BY id", (ticket_id,)
            ).fetchall()
        ]
        return result


def list_user_tickets(user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT t.*, c.slug AS category, c.name AS category_name
            FROM tickets t JOIN service_categories c ON c.id=t.category_id
            WHERE t.user_id=? ORDER BY t.created_at DESC LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def update_ticket_status(ticket_id: str, status: str, actor: str, note: str | None) -> dict[str, Any] | None:
    now = utc_now()
    with connect() as conn:
        current = conn.execute("SELECT status FROM tickets WHERE id=?", (ticket_id,)).fetchone()
        if not current:
            return None
        resolved_at = now if status in {"resolved", "closed"} else None
        conn.execute(
            "UPDATE tickets SET status=?, updated_at=?, resolved_at=COALESCE(?, resolved_at) WHERE id=?",
            (status, now, resolved_at, ticket_id),
        )
        conn.execute(
            "INSERT INTO ticket_events(ticket_id, from_status, to_status, actor, note) VALUES (?,?,?,?,?)",
            (ticket_id, current["status"], status, actor, note),
        )
    return get_ticket(ticket_id)


def list_categories() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT slug, name, description, default_priority FROM service_categories WHERE is_active=1 ORDER BY id"
        ).fetchall()
    return [dict(row) for row in rows]


def list_announcements(city: str = "Томск") -> list[dict[str, Any]]:
    now = utc_now()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT a.*, c.slug AS category, o.name AS organization_name
            FROM announcements a
            LEFT JOIN service_categories c ON c.id=a.category_id
            LEFT JOIN organizations o ON o.id=a.organization_id
            WHERE a.is_active=1 AND a.city=?
              AND (a.starts_at IS NULL OR a.starts_at<=?)
              AND (a.ends_at IS NULL OR a.ends_at>=?)
            ORDER BY a.starts_at DESC
            """,
            (city, now, now),
        ).fetchall()
    return [dict(row) for row in rows]


def add_rating(
    user_id: str,
    score: int,
    conversation_id: str | None,
    ticket_id: str | None,
    comment: str | None,
) -> int:
    with connect() as conn:
        cursor = conn.execute(
            "INSERT INTO ratings(conversation_id, ticket_id, user_id, score, comment) VALUES (?,?,?,?,?)",
            (conversation_id, ticket_id, user_id, score, comment),
        )
        return int(cursor.lastrowid)


def upsert_receipt(
    user_id: str,
    billing_period: str,
    provider: str,
    amount_cents: int,
    status: str = "unpaid",
    address_id: int | None = None,
    due_at: str | None = None,
    paid_at: str | None = None,
) -> dict[str, Any]:
    now = utc_now()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO receipts(
              user_id, address_id, billing_period, provider, amount_cents,
              status, due_at, paid_at, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, billing_period, provider) DO UPDATE SET
              address_id=excluded.address_id,
              amount_cents=excluded.amount_cents,
              status=excluded.status,
              due_at=excluded.due_at,
              paid_at=excluded.paid_at,
              updated_at=excluded.updated_at
            """,
            (
                user_id, address_id, billing_period, provider, amount_cents,
                status, due_at, paid_at, now, now,
            ),
        )
        return dict(conn.execute(
            """
            SELECT * FROM receipts
            WHERE user_id=? AND billing_period=? AND provider=?
            """,
            (user_id, billing_period, provider),
        ).fetchone())


def list_user_receipts(user_id: str, limit: int = 24) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT r.*, a.city, a.street, a.house, a.apartment
            FROM receipts r
            LEFT JOIN addresses a ON a.id=r.address_id
            WHERE r.user_id=?
            ORDER BY r.billing_period DESC, r.id DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def add_meter_reading(
    user_id: str,
    address_id: int,
    resource: str,
    value: float,
    measured_at: str,
) -> dict[str, Any]:
    with connect() as conn:
        cursor = conn.execute(
            "INSERT INTO meter_readings(user_id, address_id, resource, value, measured_at) VALUES (?,?,?,?,?)",
            (user_id, address_id, resource, value, measured_at),
        )
        return dict(conn.execute("SELECT * FROM meter_readings WHERE id=?", (cursor.lastrowid,)).fetchone())


def database_stats() -> dict[str, int]:
    tables = (
        "users", "addresses", "conversations", "messages", "knowledge_articles",
        "tickets", "ticket_events", "ratings", "announcements", "meter_readings", "receipts",
    )
    with connect() as conn:
        return {table: int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]) for table in tables}


def save_ticket(
    user_id: str,
    message: str,
    category: str,
    ai_response: str,
    status: str,
    escalated: bool,
) -> str:
    """Backward-compatible wrapper for the original backend."""
    ensure_user(user_id, "web")
    conversation = get_or_create_conversation(user_id, "web")
    append_message(conversation["id"], "user", message)
    append_message(conversation["id"], "assistant", ai_response)
    category_slug = {
        "Водоснабжение": "water",
        "Электрика": "electricity",
        "Отопление": "heating",
        "Лифтовое хозяйство": "elevator",
    }.get(category, "other")
    ticket = create_ticket(
        user_id,
        conversation["id"],
        category_slug,
        category,
        message,
        escalated=escalated,
        priority="high" if escalated else "normal",
    )
    return str(ticket["id"])
