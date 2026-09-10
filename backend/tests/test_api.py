import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import requests

import database
import main


class ApiFlowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        database.DB_PATH = Path(self.temp.name) / "api-test.db"
        database.init_db()

    def tearDown(self):
        self.temp.cleanup()

    @patch("main.ask_qwen", side_effect=requests.ConnectionError("offline"))
    def test_regular_question_uses_database_fallback(self, _):
        result = main.handle_support(
            main.SupportRequest(user_id="web-api-1", message="У меня нет горячей воды")
        )
        self.assertEqual(result.category, "water")
        self.assertFalse(result.llm_used)
        self.assertIsNone(result.ticket_id)
        self.assertTrue(result.sources)

    def test_emergency_creates_ticket_and_event(self):
        result = main.handle_support(
            main.SupportRequest(user_id="web-api-2", message="В квартире запах газа")
        )
        self.assertTrue(result.escalated)
        self.assertIsNotNone(result.ticket_id)
        ticket = database.get_ticket(result.ticket_id)
        self.assertEqual(ticket["priority"], "emergency")
        self.assertEqual(len(ticket["events"]), 1)

    def test_manual_ticket_endpoint(self):
        ticket = main.create_ticket_endpoint(
            main.TicketRequest(
                user_id="web-api-3",
                category="elevator",
                title="Лифт не работает",
                description="Кабина стоит на первом этаже",
            )
        )
        self.assertEqual(ticket["category"], "elevator")

    def test_receipt_api_flow(self):
        receipt = main.save_receipt(main.ReceiptRequest(
            user_id="web-api-4",
            billing_period="2026-08",
            provider="Томскэнергосбыт",
            amount_cents=281990,
        ))
        self.assertEqual(receipt["status"], "unpaid")
        self.assertEqual(len(main.user_receipts("web-api-4", 24)), 1)


if __name__ == "__main__":
    unittest.main()
