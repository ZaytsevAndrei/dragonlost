# Сервисы Backend

## Rust-Servers.net API

### Описание
Интеграция с rust-servers.net API для получения реальной информации о Rust сервере.

### Конфигурация

Добавьте в файл `.env` (корень проекта):

```env
RUST_SERVERS_API_KEY=npQdCNp9YXHZEYXb39jgz9YQ5wVNnaGJRJM
```

### Использование

```typescript
import { rustServersApi } from './services/rustServersApi';

// Получить детали сервера
const serverData = await rustServersApi.getServerDetails();

// Проверить голос игрока
const voteStatus = await rustServersApi.checkVote(steamId);
// 0 - не голосовал
// 1 - проголосовал, награда не получена
// 2 - проголосовал, награда получена

// Отметить награду как полученную
const claimed = await rustServersApi.claimVote(steamId);
```

### Данные сервера

API возвращает следующую информацию:
- **id** - ID сервера
- **title** - Название сервера
- **ip** - IP адрес
- **port** - Порт сервера
- **players** - Текущий онлайн
- **maxplayers** - Максимум игроков
- **map** - Название карты
- **wipe_last** - Дата последнего вайпа
- **status** - Статус сервера (1/online или 0/offline)
- **rank** - Рейтинг на rust-servers.net
- **country** - Страна размещения
- **uptime** - Время работы

### Эндпоинты

#### GET /api/servers
Возвращает список серверов с актуальной информацией из rust-servers.net API.

**Ответ:**
```json
{
  "servers": [
    {
      "id": 123,
      "name": "DragonLost | Main Server",
      "ip": "185.189.255.19",
      "port": 35500,
      "players": 15,
      "maxPlayers": 100,
      "map": "Procedural Map",
      "status": "online",
      "lastWipe": "2026-01-10T00:00:00Z",
      "country": "RU",
      "rank": 1234,
      "uptime": 99.5
    }
  ]
}
```

### Обработка ошибок

Если API недоступен или возвращает ошибку, сервис возвращает `null`, и роут вернет базовые данные в качестве fallback.

### Кэширование

API rust-servers.net кэширует данные на ~3 минуты, поэтому нет необходимости в дополнительном кэшировании на стороне бэкенда.

### Дополнительные возможности

#### Система голосований

Вы можете интегрировать систему наград за голосование:

1. Проверяйте статус голоса игрока при входе
2. Если статус = 1 (проголосовал, не получил награду), выдавайте награду
3. Отмечайте награду как полученную через `claimVote()`

### Документация API

Полная документация: https://rust-servers.net/help/api/
