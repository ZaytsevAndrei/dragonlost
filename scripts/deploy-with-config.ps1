# PowerShell скрипт для деплоя с использованием конфигурационного файла
# Использование: .\scripts\deploy-with-config.ps1

# Проверка наличия конфигурационного файла
$configPath = Join-Path $PSScriptRoot "deploy-config.ps1"

if (-not (Test-Path $configPath)) {
    Write-Host "❌ Файл конфигурации не найден!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Создайте файл deploy-config.ps1 из deploy-config.example.ps1:" -ForegroundColor Yellow
    Write-Host "  1. Скопируйте deploy-config.example.ps1 в deploy-config.ps1" -ForegroundColor Cyan
    Write-Host "  2. Отредактируйте deploy-config.ps1 и укажите свои данные" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Загрузка конфигурации
$config = & $configPath

# Запуск деплоя с параметрами из конфигурации
& (Join-Path $PSScriptRoot "deploy-to-server.ps1") `
    -ServerIP $config.ServerIP `
    -Username $config.Username `
    -Password $config.Password `
    -ProjectPath $config.ProjectPath
