CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address_id INTEGER REFERENCES addresses(id) ON DELETE SET NULL,
    billing_period TEXT NOT NULL,
    provider TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    status TEXT NOT NULL DEFAULT 'unpaid'
        CHECK (status IN ('unpaid', 'paid', 'overdue', 'cancelled')),
    due_at TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, billing_period, provider)
);

CREATE INDEX IF NOT EXISTS idx_receipts_user_period
    ON receipts(user_id, billing_period DESC);
