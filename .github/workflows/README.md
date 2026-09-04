# 🚀 GitHub Actions - Автоматический деплой

Автоматический деплой проекта DragonLost на production сервер при push в ветку `main`.

---

## 📋 Настройка

### Шаг 1: Добавьте Secrets в GitHub

Перейдите в настройки репозитория: **Settings → Secrets and variables → Actions → New repository secret**

Создайте следующие секреты:

| Имя секрета | Значение | Описание |
|-------------|----------|----------|
| `SERVER_IP` | IP сервера | IP адрес сервера |
| `SERVER_USERNAME` | например `root` | Пользователь для SSH |
| `DEPLOY_KEY` | приватный SSH-ключ | Ключ для деплоя (предпочтительно) |
| `PROJECT_PATH` | `/var/www/dragonlost` | Путь к проекту на сервере |

**⚠️ ВАЖНО**: Никогда не коммитьте эти данные в Git!

---

## 🔄 Как работает

### Автоматический запуск

Workflow запускается автоматически при:
- ✅ Push в ветку `main`
- ✅ Merge Pull Request в `main`

### Ручной запуск

Можно запустить вручную через GitHub UI:
1. Перейдите в **Actions**
2. Выберите **Deploy to Production**
3. Нажмите **Run workflow**

---

## 📊 Процесс деплоя

```
1. 🚀 Начало деплоя
   ↓
2. 📥 Checkout code
   ↓
3. 🔧 Setup Node.js
   ↓
4. 🔐 SSH подключение к серверу
   ↓
5. 📂 Переход в директорию проекта
   ↓
6. 📥 Git pull (получение изменений)
   ↓
7. 📦 npm install (установка зависимостей)
   ↓
8. 🔨 npm build (сборка проекта)
   ↓
9. 🔄 PM2 restart (перезапуск приложения)
   ↓
10. ✅ Проверка статуса
```

Общее время: **~3-5 минут**

---

## 📝 Пример использования

### Обычный workflow разработки:

```bash
# 1. Внесите изменения
git add .
git commit -m "feat: добавлена новая функция"

# 2. Отправьте в GitHub
git push origin main

# 3. GitHub Actions автоматически задеплоит на сервер!
```

### Проверка статуса деплоя:

1. Откройте репозиторий на GitHub
2. Перейдите во вкладку **Actions**
3. Посмотрите статус последнего workflow

---

## 🔍 Просмотр логов

### В GitHub:
1. **Actions** → выберите последний запуск
2. Кликните на job **Deploy to Ubuntu Server**
3. Разверните шаги для просмотра логов

### На сервере:
```bash
ssh root@YOUR_SERVER_IP
pm2 logs dragonlost-backend
pm2 logs dragonlost-telegram-bot
```

---

## ❌ Решение проблем

### Проблема: "Host key verification failed"

**Решение**: Добавьте `StrictHostKeyChecking=no` в SSH настройки или добавьте host key в known_hosts.

В workflow уже используется `appleboy/ssh-action` который автоматически принимает host key.

### Проблема: "Permission denied"

**Решение**: Проверьте:
- ✅ Правильность `SERVER_USERNAME` и `DEPLOY_KEY` в Secrets
- ✅ SSH доступ разрешен на сервере
- ✅ Порт 22 открыт в файрволе

### Проблема: "Git pull failed"

**Решение**: На сервере выполните:
```bash
cd /var/www/dragonlost
git status
git reset --hard
git pull origin main
```

### Проблема: "PM2 not found"

**Решение**: Установите PM2 глобально:
```bash
npm install -g pm2
```

### Проблема: "Build failed"

**Решение**: Проверьте логи в GitHub Actions и исправьте ошибки в коде.

---

## 🔒 Безопасность

### ✅ Хорошие практики:

1. **Используйте Secrets** - никогда не храните пароли в коде
2. **Ограничьте доступ** - используйте отдельного пользователя вместо root
3. **SSH ключи** - лучше использовать ключи вместо паролей
4. **Branch protection** - включите защиту ветки main

### Настройка SSH ключей (рекомендуется):

На сервере:
```bash
# Создайте специального пользователя для деплоя
adduser deployer
usermod -aG sudo deployer

# Настройте SSH ключ
mkdir -p /home/deployer/.ssh
# Добавьте публичный ключ в authorized_keys
```

В GitHub Actions используйте `SSH_PRIVATE_KEY` вместо пароля:
```yaml
- name: Deploy via SSH
  uses: appleboy/ssh-action@v1.0.0
  with:
    host: ${{ secrets.SERVER_IP }}
    username: deployer
    key: ${{ secrets.SSH_PRIVATE_KEY }}
    # password убрать
```

---

## 🎯 Дополнительные возможности

### Уведомления в Discord/Telegram

Добавьте в конец workflow:

```yaml
- name: Notify Discord
  if: always()
  uses: sarisia/actions-status-discord@v1
  with:
    webhook: ${{ secrets.DISCORD_WEBHOOK }}
    status: ${{ job.status }}
    title: "Деплой DragonLost"
    description: "Деплой завершен со статусом: ${{ job.status }}"
```

### Деплой только определенных файлов

Добавьте условие:

```yaml
on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'
      - 'frontend/**'
      - 'package.json'
```

### Rollback при ошибке

Добавьте шаг отката:

```yaml
- name: Rollback on failure
  if: failure()
  run: |
    ssh deploy-target "
      set -euo pipefail
      cd ${{ secrets.PROJECT_PATH }}
      git reset --hard HEAD~1
      npm run build
      pm2 restart ecosystem.config.js --env production
    "
```

---

## 📊 Мониторинг

### GitHub Actions Badge

Добавьте в README.md:

```markdown
![Deploy Status](https://github.com/YOUR_USERNAME/dragonlost/workflows/Deploy%20to%20Production/badge.svg)
```

### Uptime Robot

Настройте мониторинг сайта:
- https://uptimerobot.com/
- Проверка каждые 5 минут
- Уведомления при падении

---

## 🔗 Полезные ссылки

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [SSH Action Documentation](https://github.com/appleboy/ssh-action)
- [PM2 Documentation](https://pm2.keymetrics.io/)

---

## 📞 Поддержка

При проблемах:
1. Проверьте логи в GitHub Actions
2. Проверьте логи на сервере (`pm2 logs`)
3. Проверьте статус сервисов (`pm2 status`)

---

**Последнее обновление**: 11 января 2026
