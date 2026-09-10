PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL CHECK (channel IN ('web', 'telegram', 'admin')),
    external_id TEXT,
    display_name TEXT,
    phone TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel, external_id)
);

CREATE TABLE IF NOT EXISTS addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    city TEXT NOT NULL DEFAULT 'Томск',
    street TEXT NOT NULL,
    house TEXT NOT NULL,
    building TEXT,
    apartment TEXT,
    entrance TEXT,
    floor TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    website TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    default_priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (default_priority IN ('low', 'normal', 'high', 'emergency')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('web', 'telegram')),
    category_id INTEGER REFERENCES service_categories(id),
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'clarifying', 'resolved', 'escalated', 'closed')),
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TEXT
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'operator')),
    content TEXT NOT NULL,
    model TEXT,
    confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES service_categories(id),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    keywords TEXT NOT NULL DEFAULT '',
    source_name TEXT NOT NULL,
    source_url TEXT,
    is_emergency INTEGER NOT NULL DEFAULT 0 CHECK (is_emergency IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    published_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
    title,
    body,
    keywords,
    content='knowledge_articles',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS knowledge_articles_ai AFTER INSERT ON knowledge_articles BEGIN
    INSERT INTO knowledge_fts(rowid, title, body, keywords)
    VALUES (new.id, new.title, new.body, new.keywords);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_articles_ad AFTER DELETE ON knowledge_articles BEGIN
    INSERT INTO knowledge_fts(knowledge_fts, rowid, title, body, keywords)
    VALUES ('delete', old.id, old.title, old.body, old.keywords);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_articles_au AFTER UPDATE ON knowledge_articles BEGIN
    INSERT INTO knowledge_fts(knowledge_fts, rowid, title, body, keywords)
    VALUES ('delete', old.id, old.title, old.body, old.keywords);
    INSERT INTO knowledge_fts(rowid, title, body, keywords)
    VALUES (new.id, new.title, new.body, new.keywords);
END;

CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    address_id INTEGER REFERENCES addresses(id),
    category_id INTEGER NOT NULL REFERENCES service_categories(id),
    organization_id INTEGER REFERENCES organizations(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'emergency')),
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'accepted', 'in_progress', 'waiting', 'resolved', 'closed', 'cancelled')),
    escalated INTEGER NOT NULL DEFAULT 0 CHECK (escalated IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS ticket_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'system',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    storage_url TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (ticket_id IS NOT NULL OR message_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (conversation_id IS NOT NULL OR ticket_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER REFERENCES service_categories(id),
    organization_id INTEGER REFERENCES organizations(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT 'Томск',
    address_filter TEXT,
    starts_at TEXT,
    ends_at TEXT,
    source_url TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meter_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address_id INTEGER NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
    resource TEXT NOT NULL CHECK (resource IN ('cold_water', 'hot_water', 'electricity', 'gas', 'heating')),
    value REAL NOT NULL CHECK (value >= 0),
    measured_at TEXT NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(address_id, resource, measured_at)
);

CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_articles_category_active ON knowledge_articles(category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tickets_user_created ON tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status_priority ON tickets(status, priority);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_announcements_active_dates ON announcements(is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_meter_readings_address_resource ON meter_readings(address_id, resource, measured_at DESC);

