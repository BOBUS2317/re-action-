# Зависимости проекта

Эта папка отдельно хранит копии всех файлов, по которым окружение можно восстановить без сохранения тяжёлых служебных каталогов.

- `backend-requirements.txt` — Python-пакеты API и базы данных.
- `bot-requirements.txt` — Python-пакеты Telegram-бота.
- `frontend-package.json` — список frontend-пакетов и команд.
- `frontend-package-lock.json` — точные версии всего дерева npm-зависимостей.
- `docker-images.txt` — образы сервисов и модель Qwen.

Основные манифесты остаются в своих рабочих папках. Установка: `pip install -r backend/requirements.txt`, `pip install -r bot/requirements.txt`, `npm ci --prefix frontend`. Каталоги `.venv`, `node_modules` и кэш модели не отправляются в Git: они платформозависимы и восстанавливаются из этих файлов.
