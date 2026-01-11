# 🚀 Автоматический деплой на сервер (Windows → Ubuntu)

Скрипты для автоматического деплоя проекта DragonLost с Windows на Ubuntu сервер через SSH.

---

## 📋 Предварительные требования

### На локальной машине (Windows):
1. **PowerShell 5.1+** (обычно уже установлен)
2. **Модуль Posh-SSH** (устанавливается автоматически скриптом)

### На сервере (Ubuntu):
1. **SSH сервер** запущен и доступен
2. **Git** установлен
3. **Node.js, npm, PM2** установлены
4. **Проект** уже развернут первый раз вручную

---

## 🔧 Установка

### Шаг 1: Установка Posh-SSH (опционально)

Скрипт установит автоматически, но можно установить вручную:

```powershell
Install-Module -Name Posh-SSH -Force -Scope CurrentUser
```

### Шаг 2: Создание конфигурации

```powershell
# В директории scripts/
copy deploy-config.example.ps1 deploy-config.ps1
```

Отредактируйте `deploy-config.ps1`:

```powershell
$DeployConfig = @{
    ServerIP = "123.456.789.0"                      # IP вашего сервера
    Username = "root"                                # Пользователь
    Password = "your_secure_password"                # Пароль
    ProjectPath = "/home/dragonlost/dragonlost"     # Путь к проекту
}
```

**⚠️ ВАЖНО**: Добавьте `deploy-config.ps1` в `.gitignore`!

---

## 🚀 Использование

### Вариант 1: С конфигурационным файлом (рекомендуется)

```powershell
.\scripts\deploy-with-config.ps1
```

### Вариант 2: С параметрами в командной строке

```powershell
.\scripts\deploy-to-server.ps1 `
    -ServerIP "123.456.789.0" `
    -Username "root" `
    -Password "your_password" `
    -ProjectPath "/home/dragonlost/dragonlost"
```

---

## 📊 Что делает скрипт

1. ✅ Подключается к серверу по SSH
2. ✅ Переходит в директорию проекта
3. ✅ Получает последние изменения из Git (`git pull`)
4. ✅ Устанавливает зависимости (`npm run install:all`)
5. ✅ Собирает проект (`npm run build`)
6. ✅ Перезапускает PM2 (`pm2 restart`)
7. ✅ Сохраняет конфигурацию PM2 (`pm2 save`)
8. ✅ Показывает статус приложений (`pm2 status`)

---

## 🔒 Безопасность

### Рекомендации:

1. **НЕ коммитьте** `deploy-config.ps1` в Git
2. **Используйте SSH ключи** вместо паролей (см. ниже)
3. **Ограничьте доступ** к скриптам деплоя
4. **Используйте отдельного пользователя** вместо root

### Настройка SSH ключей (безопаснее паролей):

```powershell
# Генерация SSH ключа (если еще нет)
ssh-keygen -t rsa -b 4096

# Копирование ключа на сервер
type $env:USERPROFILE\.ssh\id_rsa.pub | ssh root@YOUR_SERVER_IP "cat >> ~/.ssh/authorized_keys"
```

После этого можно использовать Posh-SSH с ключом вместо пароля.

---

## 🔧 Альтернативный метод: SSH ключи

Создайте файл `deploy-with-key.ps1`:

```powershell
# Деплой с использованием SSH ключа
param(
    [string]$ServerIP = "YOUR_SERVER_IP",
    [string]$Username = "root",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\id_rsa"
)

Import-Module Posh-SSH

$session = New-SSHSession -ComputerName $ServerIP -KeyFile $KeyPath -AcceptKey

# ... остальной код деплоя
```

---

## 📝 Логирование

Для сохранения логов деплоя:

```powershell
.\scripts\deploy-with-config.ps1 | Tee-Object -FilePath "deploy-log-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
```

---

## ❌ Решение проблем

### Проблема: "Posh-SSH не установлен"

```powershell
# Установите вручную
Install-Module -Name Posh-SSH -Force -Scope CurrentUser
```

### Проблема: "Access denied"

**Решение**: Проверьте:
- Правильность IP адреса
- Правильность пароля
- SSH доступ разрешен для root
- Файрвол не блокирует порт 22

### Проблема: "Git pull fails"

**Решение**:
```bash
# На сервере проверьте Git статус
cd /home/dragonlost/dragonlost
git status
git pull origin main
```

### Проблема: "PM2 not found"

**Решение**:
```bash
# Установите PM2 глобально
npm install -g pm2
```

### Проблема: "Permission denied"

**Решение**:
```bash
# На сервере дайте права
chown -R root:root /home/dragonlost/dragonlost
chmod -R 755 /home/dragonlost/dragonlost
```

---

## 🔄 CI/CD интеграция

### GitHub Actions (будущее расширение)

```yaml
name: Deploy to Server

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_IP }}
          username: ${{ secrets.USERNAME }}
          password: ${{ secrets.PASSWORD }}
          script: |
            cd /home/dragonlost/dragonlost
            git pull origin main
            npm run install:all
            npm run build
            pm2 restart ecosystem.config.js
```

---

## 📊 Мониторинг после деплоя

После успешного деплоя проверьте:

```powershell
# Проверка статуса через SSH
ssh root@YOUR_SERVER_IP "pm2 status"

# Просмотр логов
ssh root@YOUR_SERVER_IP "pm2 logs dragonlost-backend --lines 50"

# Проверка сайта
Invoke-WebRequest -Uri "https://dragonlost.ru/api/health"
```

---

## 🎯 Полный процесс деплоя

### 1. Локальная разработка

```powershell
# Внесите изменения в код
git add .
git commit -m "feat: добавлена новая функция"
git push origin main
```

### 2. Запуск деплоя

```powershell
.\scripts\deploy-with-config.ps1
```

### 3. Проверка

```powershell
# Откройте сайт
start https://dragonlost.ru

# Проверьте API
Invoke-WebRequest -Uri "https://dragonlost.ru/api/health"
```

---

## 📞 Контакты

Если возникли проблемы:
1. Проверьте логи на сервере: `pm2 logs`
2. Проверьте статус: `pm2 status`
3. Перезапустите вручную: `pm2 restart all`

---

## 🔗 Дополнительные ресурсы

- [Posh-SSH Documentation](https://github.com/darkoperator/Posh-SSH)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [PowerShell Documentation](https://docs.microsoft.com/powershell/)

---

**Последнее обновление**: 11 января 2026
