using System.Collections.Generic;
using Oxide.Core.Plugins;

namespace Oxide.Plugins
{
    [Info("ServerInfo", "DragonLost.ru", "1.0.0")]
    [Description("Команды /pop (онлайн) и /time (игровое время)")]
    public class ServerInfo : RustPlugin
    {
        private const string ChatPrefix = "<color=#FF6600>[DragonLost]</color>";

        protected override void LoadDefaultMessages()
        {
            lang.RegisterMessages(new Dictionary<string, string>
            {
                ["Pop"] = "{0} Игроков онлайн: <color=#7CFC00>{1}</color> / {2}",
                ["Time"] = "{0} Игровое время: <color=#87CEEB>{1}</color> ({2})",
                ["TimeDay"] = "день",
                ["TimeNight"] = "ночь",
                ["TimeUnavailable"] = "{0} Игровое время сейчас недоступно.",
            }, this, "ru");

            lang.RegisterMessages(new Dictionary<string, string>
            {
                ["Pop"] = "{0} Players online: <color=#7CFC00>{1}</color> / {2}",
                ["Time"] = "{0} Server time: <color=#87CEEB>{1}</color> ({2})",
                ["TimeDay"] = "day",
                ["TimeNight"] = "night",
                ["TimeUnavailable"] = "{0} Server time is currently unavailable.",
            }, this);
        }

        private string Lang(string key, string userId = null, params object[] args)
        {
            try
            {
                return string.Format(lang.GetMessage(key, this, userId), args);
            }
            catch
            {
                return lang.GetMessage(key, this, userId);
            }
        }

        [ChatCommand("pop")]
        private void CmdPop(BasePlayer player, string command, string[] args)
        {
            if (player == null)
                return;

            var online = BasePlayer.activePlayerList.Count;
            var maxPlayers = ConVar.Server.maxplayers;

            SendReply(player, Lang("Pop", player.UserIDString, ChatPrefix, online, maxPlayers));
        }

        [ChatCommand("time")]
        private void CmdTime(BasePlayer player, string command, string[] args)
        {
            if (player == null)
                return;

            var sky = TOD_Sky.Instance;
            if (sky == null)
            {
                SendReply(player, Lang("TimeUnavailable", player.UserIDString, ChatPrefix));
                return;
            }

            var gameTime = sky.Cycle.DateTime.ToString("HH:mm");
            var periodKey = sky.IsDay ? "TimeDay" : "TimeNight";
            var period = Lang(periodKey, player.UserIDString);

            SendReply(player, Lang("Time", player.UserIDString, ChatPrefix, gameTime, period));
        }
    }
}
