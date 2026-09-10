import sqlite3
import tempfile
import unittest
from pathlib import Path

import database


class DatabaseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        database.DB_PATH = Path(self.temp.name) / "test.db"
        database.init_db()

    def tearDown(self):
        self.temp.cleanup()

    def test_migrations_and_seed(self):
        stats = database.database_stats()
        self.assertEqual(stats["knowledge_articles"], 8)
        self.assertEqual(len(database.list_categories()), 10)

    def test_russian_fts_search(self):
        results = database.search_knowledge("У меня нет горячей воды")
        self.assertTrue(results)
        self.assertEqual(results[0]["category"], "water")

    def test_knowledge_update_is_searchable_immediately(self):
        database.upsert_knowledge_article(
            "heating",
            "new-heating-rule",
            "Новый порядок по отоплению",
            "При низкой температуре сначала измерьте её комнатным термометром.",
            "температура термометр холод",
            "Тестовый источник",
        )
        results = database.search_knowledge("измерить температуру термометром")
        self.assertEqual(results[0]["slug"], "new-heating-rule")

    def test_ticket_lifecycle_keeps_history(self):
        database.ensure_user("web-1", "web")
        address = database.add_address("web-1", "Ленина", "15", apartment="42")
        conversation = database.get_or_create_conversation("web-1", "web")
        database.append_message(conversation["id"], "user", "Прорвало трубу")
        ticket = database.create_ticket(
            "web-1",
            conversation["id"],
            "water",
            "Протечка",
            "Прорвало трубу",
            "high",
            address["id"],
            3,
        )
        updated = database.update_ticket_status(ticket["id"], "in_progress", "dispatcher", "Принято")
        self.assertEqual(updated["status"], "in_progress")
        self.assertEqual(len(updated["events"]), 2)
        self.assertEqual(len(database.list_user_tickets("web-1")), 1)

    def test_invalid_status_is_rejected(self):
        database.ensure_user("web-2", "web")
        with self.assertRaises(sqlite3.IntegrityError):
            database.create_ticket(
                "web-2", None, "water", "Тест", "Тест", priority="invalid"
            )

    def test_receipt_upsert_and_listing(self):
        database.ensure_user("web-receipts", "web")
        first = database.upsert_receipt(
            "web-receipts", "2026-08", "Томскводоканал", 145050, due_at="2026-09-10"
        )
        updated = database.upsert_receipt(
            "web-receipts", "2026-08", "Томскводоканал", 145050,
            status="paid", paid_at="2026-09-08",
        )
        self.assertEqual(first["id"], updated["id"])
        self.assertEqual(database.list_user_receipts("web-receipts")[0]["status"], "paid")


if __name__ == "__main__":
    unittest.main()
