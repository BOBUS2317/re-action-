# Ре:Акция — сервис обращений по ЖКХ

Сервис для обращений жителей по коммунальным услугам: вода, свет, отопление, лифт, квитанции, показания счётчиков, заявки и объявления.

- Сайт: https://drunteam.ru
- Telegram-бот: [@drunteambot](https://t.me/drunteambot)

Сайт и бот используют один backend (FastAPI), одну базу SQLite и генерацию через GigaChat API. Локальных тяжёлых моделей в проекте нет.

## Что умеет

- Чат поддержки (`/chat` на сайте, свободный текст в боте): отвечает по базе знаний, при аварии подсказывает звонить 112.
- Личные разделы берут данные из базы, а не из нейросети:
  - `/receipts` — квитанции, задолженность и следующий платёж;
  - `/meters` — передача показаний счётчиков;
  - `/company` — управляющая компания и аварийные контакты;
  - `/profile` — профиль, адрес, привязка Telegram;
  - `/history` — общая история заявок сайта и бота;
  - `/login` — вход по 6-значному коду из бота.
- В `/api/support` сначала срабатывают детерминированные ветки (квитанции / показания / УК и аварийные номера / отключения), и только остальные вопросы уходят в GigaChat. Без ключа или при ошибке LLM — ответ-подстраховка из базы.
- Бот ведёт диалог официально, на «Вы»: команды `/start`, `/register`, `/link`, `/profile`, `/new`, `/cancel` плюс кнопки «описать проблему», «мои заявки», «квитанции», «передать показания», «объявления», «оценить помощь», «мой адрес», «создать заявку».

## Структура

- `frontend/` — React + TypeScript + Vite. Страницы: `Home`, `Chat`, `Login`, `Profile`, `History`, `Receipts`, `Meters`, `Company`. Единый id пользователя — `src/lib/user.ts` (`getEffectiveUserId()`). Сборка отдаётся через nginx, `/api/` проксируется на backend.
- `backend/` — API `main.py` (версия 2.1.0), SQLite `database.py`, связка с LLM `rag.py`, настройки `config.py`, миграции `migrations/001–004`, тесты `tests/`.
- `bot/` — Telegram-бот на aiogram: FSM регистрации `RegForm` (телефон → город → улица → дом → квартира), `/register`, `/link`, `/profile`, меню команд через `set_my_commands`.
- `dependencies/` — копии манифестов с точными версиями.
- `docker-compose.yml` — три сервиса: `backend`, `frontend`, `bot` + volume `database_data`. Сервиса `qwen` больше нет.

## База данных

Таблицы: пользователи, адреса, диалоги, сообщения, статьи базы знаний, заявки, события заявок, вложения, оценки, квитанции, объявления, показания счётчиков, Telegram-коды привязки.

- `migrations/001_initial.sql` — структура, индексы, FTS5;
- `002_seed.sql` — категории и стартовые статьи;
- `003_receipts.sql` — квитанции и статусы оплаты;
- `004_telegram_registration.sql` — Telegram-профиль и коды привязки.
- Поиск по статьям — через SQLite FTS5, FAISS и embedding-модели не используются.
- Файл `support.db` создаётся при первом старте и лежит в Docker volume `database_data`, в Git не коммитится.

## Связка «сайт + бот»

1. В боте выполнить `/register`, указать телефон, город, улицу, дом, квартиру.
2. Бот сохранит профиль `telegram-<id>` и выдаст 6-значный код на 15 минут.
3. Код вводится на сайте в «Профиле» или на `/login`.
4. После привязки сайт переходит на `telegram-<id>`: переезжают диалоги, заявки, оценки, квитанции, показания и адреса, история становится общей.
5. Новый код в любой момент — команда `/link`, проверка привязки — `/profile`.

## Основные эндпоинты

- `GET /api/health` — статус и `gigachat_configured`;
- `POST /api/support` — чат поддержки;
- `POST /api/telegram/register`, `POST /api/telegram/link-code`, `GET /api/telegram/{id}/profile`, `POST /api/users/link-telegram`;
- `GET/PUT /api/users/{id}/profile`, `GET /api/users/{id}/addresses`, `GET /api/users/{id}/organization`, `GET /api/users/{id}/meter-readings`, `GET /api/users/{id}/tickets`, `GET /api/users/{id}/receipts`;
- `GET /api/organizations`, `GET /api/announcements`, `GET /api/knowledge/search`;
- `POST /api/tickets`, `GET /api/tickets/{id}`, `PATCH /api/tickets/{id}/status`, `POST /api/meter-readings`, `POST /api/ratings`.

Документация API при локальном запуске backend: `http://localhost:8000/api/docs`.

## Настройки (.env)

Секреты хранятся только в `.env`, файл исключён из Git. В compose у backend подключён `env_file: .env`.

| Переменная | Назначение |
|---|---|
| `BOT_TOKEN` | токен [@drunteambot](https://t.me/drunteambot) из BotFather |
| `GIGACHAT_CREDENTIALS` | ключ авторизации GigaChat API |
| `GIGACHAT_MODEL` | модель, по умолчанию `GigaChat` |
| `GIGACHAT_SCOPE` | скоуп, по умолчанию `GIGACHAT_API_PERS` |
| `GIGACHAT_TIMEOUT` | таймаут запроса, по умолчанию `30` |
| `CORS_ORIGINS` | разрешённые origins, включая `https://drunteam.ru,https://www.drunteam.ru` |
| `DB_NAME` | путь к SQLite, в compose `/data/support.db` |

Без `GIGACHAT_CREDENTIALS` backend стартует, но генерация уходит в подстраховочные ответы из базы.

## Запуск

На сервере 2 CPU / 4 ГБ:

1. Установите Docker и Docker Compose.
2. Скопируйте `.env.example` в `.env`, укажите `BOT_TOKEN` и `GIGACHAT_CREDENTIALS`.
3. Выполните `docker compose up -d --build`.

Прод: сайт — https://drunteam.ru, бот — [@drunteambot](https://t.me/drunteambot). Локально после запуска: сайт через frontend-контейнер, API — `http://localhost:8000/api/docs`.

Проверки:

```bash
cd backend && python -m unittest discover -s tests -v
cd ../frontend && npm run build
```

## Ограничения MVP

- Стартовые регламенты и статьи базы знаний — демонстрационные, перед защитой сверить с реальными поставщиками.
- Ответ GigaChat обычно занимает пару секунд; при недоступности API пользователь получает ответ из базы, а не ошибку.
- `.env`, `support.db` и `node_modules` в репозиторий не коммитятся.
