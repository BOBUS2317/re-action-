# Backend и база данных

- `main.py` — REST API для сайта и Telegram-бота.
- `database.py` — запросы к SQLite, миграции и FTS5-поиск.
- `rag.py` — получает статьи из базы и передаёт контекст локальному Qwen.
- `config.py` — настройки из переменных окружения.
- `backend.env.example` — пример настроек для отдельного запуска API.
- `requirements-backend.txt` — Python-зависимости API.
- `backend.Dockerfile` — контейнер API.
- `migrations/001_initial.sql` — вся структура таблиц, связей, индексов и FTS5.
- `migrations/002_seed.sql` — категории и стартовые безопасные инструкции.
- `migrations/003_receipts.sql` — квитанции, статусы оплаты и привязка к адресу.
- `migrations/004_telegram_registration.sql` — Telegram-профиль и одноразовые коды связи с сайтом.
- `data/support.db` — рабочий файл БД; создаётся при первом запуске и не хранится в Git.

Документация API после запуска доступна на `http://localhost:8000/api/docs`.

