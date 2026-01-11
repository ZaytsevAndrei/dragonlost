# Конфигурация для деплоя
# Скопируйте этот файл в deploy-config.ps1 и заполните своими данными
# НЕ коммитьте deploy-config.ps1 в Git!

$DeployConfig = @{
    ServerIP = "123.456.789.0"              # IP адрес вашего сервера
    Username = "root"                        # Пользователь (обычно root)
    Password = "your_secure_password_here"   # Пароль
    ProjectPath = "/home/dragonlost/dragonlost"  # Путь к проекту на сервере
}

# Экспорт конфигурации
return $DeployConfig
