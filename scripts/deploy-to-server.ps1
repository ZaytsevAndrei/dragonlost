# PowerShell скрипт для автоматического деплоя на Ubuntu сервер
# Использование: .\scripts\deploy-to-server.ps1

param(
    [string]$ServerIP = "31.130.135.146",
    [string]$Username = "root",
    [string]$Password = "sVYPjmX1N1-R8k",
    [string]$ProjectPath = "/var/www/dragonlost"
)

# Цвета для вывода
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

Write-ColorOutput Green "=== DragonLost Auto-Deploy Script ==="
Write-ColorOutput Yellow "Сервер: $ServerIP"
Write-ColorOutput Yellow "Пользователь: $Username"
Write-ColorOutput Yellow "Путь проекта: $ProjectPath"
Write-Host ""

# Проверка наличия Posh-SSH модуля
if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
    Write-ColorOutput Yellow "Модуль Posh-SSH не установлен. Устанавливаем..."
    Install-Module -Name Posh-SSH -Force -Scope CurrentUser
    Write-ColorOutput Green "Модуль Posh-SSH установлен!"
}

Import-Module Posh-SSH

# Создание credential объекта
$securePassword = ConvertTo-SecureString $Password -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential ($Username, $securePassword)

try {
    Write-ColorOutput Cyan "Подключение к серверу $ServerIP..."
    
    # Создание SSH сессии
    $session = New-SSHSession -ComputerName $ServerIP -Credential $credential -AcceptKey
    
    if ($session.Connected) {
        Write-ColorOutput Green "✅ Подключено к серверу!"
        Write-Host ""
        
        # Функция для выполнения команд
        function Invoke-RemoteCommand {
            param([string]$Command, [string]$Description)
            
            Write-ColorOutput Cyan "➤ $Description"
            $result = Invoke-SSHCommand -SessionId $session.SessionId -Command $Command
            
            if ($result.ExitStatus -eq 0) {
                Write-ColorOutput Green "  ✓ Успешно"
                if ($result.Output) {
                    Write-Host "  Output: $($result.Output)"
                }
            } else {
                Write-ColorOutput Red "  ✗ Ошибка: $($result.Error)"
                throw "Команда завершилась с ошибкой"
            }
            Write-Host ""
        }
        
        # Шаг 1: Переход в директорию проекта
        Invoke-RemoteCommand -Command "cd $ProjectPath && pwd" -Description "Переход в директорию проекта"
        
        # Шаг 2: Получение последних изменений из Git
        Invoke-RemoteCommand -Command "cd $ProjectPath && git pull origin main" -Description "Получение изменений из Git"
        
        # Шаг 3: Установка зависимостей
        Invoke-RemoteCommand -Command "cd $ProjectPath && npm run install:all" -Description "Установка зависимостей"
        
        # Шаг 4: Сборка проекта
        Invoke-RemoteCommand -Command "cd $ProjectPath && npm run build" -Description "Сборка проекта"
        
        # Шаг 5: Перезапуск PM2
        Invoke-RemoteCommand -Command "cd $ProjectPath && pm2 restart ecosystem.config.js --env production" -Description "Перезапуск PM2"
        
        # Шаг 6: Сохранение конфигурации PM2
        Invoke-RemoteCommand -Command "pm2 save" -Description "Сохранение конфигурации PM2"
        
        # Шаг 7: Проверка статуса
        Invoke-RemoteCommand -Command "pm2 status" -Description "Проверка статуса приложений"
        
        Write-ColorOutput Green "=== ✅ Деплой завершен успешно! ==="
        Write-Host ""
        Write-ColorOutput Yellow "Проверьте сайт: https://dragonlost.ru"
        
    } else {
        Write-ColorOutput Red "❌ Не удалось подключиться к серверу"
        exit 1
    }
    
} catch {
    Write-ColorOutput Red "❌ Ошибка: $_"
    exit 1
} finally {
    # Закрытие SSH сессии
    if ($session) {
        Remove-SSHSession -SessionId $session.SessionId | Out-Null
        Write-ColorOutput Cyan "Соединение закрыто"
    }
}

Write-Host ""
Write-Host "Нажмите любую клавишу для выхода..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
