using System;
using Oxide.Core.Plugins;

namespace Oxide.Plugins
{
    [Info("TimePlugin", "REDragon #1", "1.0.0")]
    [Description("Adds a /time command to display the server time")]

    public class TimePlugin : RustPlugin
    {
        // Обработчик команды /time
        [ChatCommand("time")]
        private void TimeCommand(BasePlayer player, string command, string[] args)
        {
            // Получаем текущее серверное время
            string serverTime = GetGameTime();
            
            // Отправляем сообщение игроку
            SendReply(player, $"Current server time: {serverTime}");
        }
        private string GetGameTime()
        {
            if (TOD_Sky.Instance == null)
                return "Time system not available";
                
            return TOD_Sky.Instance.Cycle.DateTime.ToString("HH:mm:ss");
        }
    }
}