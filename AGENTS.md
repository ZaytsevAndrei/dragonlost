# Правила проекта DragonLost

Правила для ИИ-агентов (ZCode и др.), работающих с этим репозиторием.

## Миграции базы данных

- Новые миграции кладутся в `backend/database/migrations/` с номером следующим за последним существующим (формат `NNN-описание.sql`).
- **Вместе с каждой новой миграцией в том же коммите** добавляется скрипт в `backend/package.json`:
  `"migrate:0NN": "node scripts/run-sql-migration.mjs database/migrations/NNN-описание.sql"`.
- Проверь `backend/package.json` перед коммитом миграции — без скрипта команда `npm run migrate:0NN` на сервере не сработает.

## Сервер и названия

- Актуальное название сервера хранится в нескольких местах: `backend/src/routes/servers.ts` (`SERVER_DISPLAY_NAME`), `backend/src/routes/meta.ts` (SEO title/description), `frontend/src/components/HomeHero.tsx` (hero-строка и aria-label). При смене названия обновлять все одновременно.

## Общие правила

- Коммит-сообщения — краткие, на русском, в стиле существующих (`git log --oneline`).
- После правок TypeScript запускать проверку типов: `npx tsc --noEmit` в `backend/` и `frontend/`.
- Расписание вайпов и голосований — только через `backend/src/utils/wipeSchedule.ts`, не дублировать логику вручную.
