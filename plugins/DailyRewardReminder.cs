using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Oxide.Core;
using Oxide.Core.Plugins;
using Oxide.Game.Rust.Cui;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("DailyRewardReminder", "DragonLost.ru", "1.0.0")]
    [Description("Напоминает игрокам зайти на сайт и забрать ежедневную награду")]
    public class DailyRewardReminder : RustPlugin
    {
        #region Configuration

        private PluginConfig _config;

        private class PluginConfig
        {
            [JsonProperty("URL сайта с наградами")]
            public string RewardUrl { get; set; } = "dragonlost.ru/rewards";

            [JsonProperty("Показывать напоминание при подключении")]
            public bool ShowOnConnect { get; set; } = true;

            [JsonProperty("Задержка показа после подключения (сек)")]
            public float ConnectDelay { get; set; } = 15f;

            [JsonProperty("Включить периодические напоминания в чат")]
            public bool EnableChatReminder { get; set; } = true;

            [JsonProperty("Интервал напоминания в чат (мин)")]
            public float ChatReminderInterval { get; set; } = 60f;

            [JsonProperty("Включить GUI-баннер при подключении")]
            public bool EnableGuiBanner { get; set; } = true;

            [JsonProperty("Время показа GUI-баннера (сек)")]
            public float GuiBannerDuration { get; set; } = 3f;

            [JsonProperty("Префикс чат-сообщений")]
            public string ChatPrefix { get; set; } = "<color=#FF6600>[DragonLost]</color>";

            [JsonProperty("SteamID иконки в чате (0 = без иконки)")]
            public ulong ChatIconSteamId { get; set; } = 0;
        }

        protected override void LoadDefaultConfig()
        {
            _config = new PluginConfig();
            SaveConfig();
        }

        protected override void LoadConfig()
        {
            base.LoadConfig();
            try
            {
                _config = Config.ReadObject<PluginConfig>();
                if (_config == null)
                    throw new Exception();

                ValidateConfig();
            }
            catch
            {
                PrintWarning("Ошибка чтения конфигурации, загружены значения по умолчанию");
                LoadDefaultConfig();
            }
        }

        protected override void SaveConfig() => Config.WriteObject(_config);

        private void ValidateConfig()
        {
            _config.ConnectDelay = Math.Max(1f, _config.ConnectDelay);
            _config.ChatReminderInterval = Math.Max(1f, _config.ChatReminderInterval);
            _config.GuiBannerDuration = Math.Max(1f, _config.GuiBannerDuration);

            SaveConfig();
        }

        #endregion

        #region Localization

        protected override void LoadDefaultMessages()
        {
            lang.RegisterMessages(new Dictionary<string, string>
            {
                ["Reminder"] = "Не забудь забрать свою <color=#FFD700>ежедневную награду</color> на сайте!\nЗаходи: <color=#00BFFF>{0}</color>",
                ["Welcome"] = "Добро пожаловать!\nЗабери свою <color=#FFD700>ежедневную награду</color> на сайте: <color=#00BFFF>{0}</color>",
                ["BannerText"] = "Забери бонусные монеты на сайте!",
            }, this, "ru");

            lang.RegisterMessages(new Dictionary<string, string>
            {
                ["Reminder"] = "Don't forget to claim your <color=#FFD700>daily reward</color>!\nVisit: <color=#00BFFF>{0}</color>",
                ["Welcome"] = "Welcome!\nClaim your <color=#FFD700>daily reward</color> at: <color=#00BFFF>{0}</color>",
                ["BannerText"] = "Claim your bonus coins on the website!",
            }, this);
        }

        private string Lang(string key, string userId = null, params object[] args)
        {
            try
            {
                return string.Format(lang.GetMessage(key, this, userId), args);
            }
            catch (FormatException)
            {
                return lang.GetMessage(key, this, userId);
            }
        }

        #endregion

        #region Constants

        private const string GuiPanelName = "DailyRewardReminder_Panel";
        private const string PermissionBypass = "dailyrewardreminder.bypass";

        #endregion

        #region Oxide Hooks

        private Timer _chatReminderTimer;

        private void Init()
        {
            permission.RegisterPermission(PermissionBypass, this);
        }

        private void OnServerInitialized()
        {
            if (_config.EnableChatReminder && _config.ChatReminderInterval > 0)
            {
                _chatReminderTimer = timer.Every(_config.ChatReminderInterval * 60f, SendChatReminderToAll);
            }
        }

        private void Unload()
        {
            _chatReminderTimer?.Destroy();

            foreach (var player in BasePlayer.activePlayerList)
            {
                CuiHelper.DestroyUi(player, GuiPanelName);
            }
        }

        private void OnPlayerSleepEnded(BasePlayer player)
        {
            if (player == null || !player.IsConnected)
                return;

            if (permission.UserHasPermission(player.UserIDString, PermissionBypass))
                return;

            if (_config.ShowOnConnect)
            {
                timer.Once(_config.ConnectDelay, () =>
                {
                    if (player == null || !player.IsConnected)
                        return;

                    SendChatReminder(player, isWelcome: true);

                    if (_config.EnableGuiBanner)
                        ShowGuiBanner(player);
                });
            }
        }

        #endregion

        #region Core Logic

        private void SendChatReminderToAll()
        {
            foreach (var player in BasePlayer.activePlayerList)
            {
                if (player == null || !player.IsConnected)
                    continue;

                if (permission.UserHasPermission(player.UserIDString, PermissionBypass))
                    continue;

                SendChatReminder(player, isWelcome: false);
            }
        }

        private void SendChatReminder(BasePlayer player, bool isWelcome)
        {
            string msg;
            if (isWelcome)
                msg = Lang("Welcome", player.UserIDString, _config.RewardUrl);
            else
                msg = Lang("Reminder", player.UserIDString, _config.RewardUrl);

            SendChat(player, msg);
        }

        private void SendChat(BasePlayer player, string message)
        {
            var fullMsg = $"{_config.ChatPrefix} {message}";
            Player.Message(player, fullMsg, _config.ChatIconSteamId);
        }

        #endregion

        #region GUI Banner

        private void ShowGuiBanner(BasePlayer player)
        {
            CuiHelper.DestroyUi(player, GuiPanelName);

            var elements = new CuiElementContainer();

            // Основная панель (верх экрана, по центру — компактная)
            elements.Add(new CuiPanel
            {
                Image = { Color = "0.1 0.1 0.1 0.92", Material = "assets/content/ui/uibackgroundblur.mat" },
                RectTransform = { AnchorMin = "0.35 0.9", AnchorMax = "0.65 0.94" },
                CursorEnabled = false,
            }, "Overlay", GuiPanelName);

            // Текст напоминания
            elements.Add(new CuiLabel
            {
                Text = {
                    Text = Lang("BannerText", player.UserIDString) + "  <color=#00BFFF>" + _config.RewardUrl + "</color>",
                    FontSize = 12,
                    Font = "robotocondensed-bold.ttf",
                    Align = TextAnchor.MiddleCenter,
                    Color = "1 1 1 1",
                },
                RectTransform = { AnchorMin = "0.03 0.05", AnchorMax = "0.97 0.95" },
            }, GuiPanelName);

            CuiHelper.AddUi(player, elements);

            timer.Once(_config.GuiBannerDuration, () =>
            {
                if (player != null && player.IsConnected)
                    CuiHelper.DestroyUi(player, GuiPanelName);
            });
        }

        #endregion
    }
}
