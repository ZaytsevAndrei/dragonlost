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
            if (string.IsNullOrWhiteSpace(_config.RewardUrl))
            {
                PrintWarning("URL сайта пуст, установлено значение по умолчанию");
                _config.RewardUrl = "dragonlost.ru/rewards";
            }

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
                ["ChatReminder"] = "Не забудь забрать свою <color=#FFD700>ежедневную награду</color> на сайте!\nЗаходи: <color=#00BFFF>{0}</color>",
                ["ConnectWelcome"] = "Добро пожаловать!\nЗабери свою <color=#FFD700>ежедневную награду</color> на сайте: <color=#00BFFF>{0}</color>",
                ["GuiTitle"] = "ЕЖЕДНЕВНАЯ НАГРАДА",
                ["GuiText"] = "Забери бонусные монеты на сайте!",
                ["GuiUrl"] = "{0}",
                ["GuiButton"] = "ПЕРЕЙТИ НА САЙТ",
            }, this, "ru");

            lang.RegisterMessages(new Dictionary<string, string>
            {
                ["ChatReminder"] = "Don't forget to claim your <color=#FFD700>daily reward</color>!\nVisit: <color=#00BFFF>{0}</color>",
                ["ConnectWelcome"] = "Claim your <color=#FFD700>daily reward</color> at: <color=#00BFFF>{0}</color>",
                ["GuiTitle"] = "DAILY REWARD",
                ["GuiText"] = "Claim your bonus coins on the website!",
                ["GuiUrl"] = "{0}",
                ["GuiButton"] = "VISIT WEBSITE",
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
                msg = Lang("ConnectWelcome", player.UserIDString, _config.RewardUrl);
            else
                msg = Lang("ChatReminder", player.UserIDString, _config.RewardUrl);

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
                RectTransform = { AnchorMin = "0.35 0.88", AnchorMax = "0.65 0.95" },
                CursorEnabled = false,
            }, "Overlay", GuiPanelName);

            // Акцентная полоска сверху
            elements.Add(new CuiPanel
            {
                Image = { Color = "1.0 0.4 0.0 1.0" },
                RectTransform = { AnchorMin = "0 0.9", AnchorMax = "1 1" },
            }, GuiPanelName);

            // Заголовок
            elements.Add(new CuiLabel
            {
                Text = {
                    Text = Lang("GuiTitle", player.UserIDString),
                    FontSize = 13,
                    Font = "robotocondensed-bold.ttf",
                    Align = TextAnchor.MiddleLeft,
                    Color = "1.0 0.84 0.0 1.0",
                },
                RectTransform = { AnchorMin = "0.04 0.5", AnchorMax = "0.55 0.9" },
            }, GuiPanelName);

            // Описание
            elements.Add(new CuiLabel
            {
                Text = {
                    Text = Lang("GuiText", player.UserIDString),
                    FontSize = 10,
                    Font = "robotocondensed-regular.ttf",
                    Align = TextAnchor.MiddleLeft,
                    Color = "0.85 0.85 0.85 1",
                },
                RectTransform = { AnchorMin = "0.04 0.05", AnchorMax = "0.55 0.5" },
            }, GuiPanelName);

            // URL
            elements.Add(new CuiLabel
            {
                Text = {
                    Text = Lang("GuiUrl", player.UserIDString, _config.RewardUrl),
                    FontSize = 11,
                    Font = "robotocondensed-bold.ttf",
                    Align = TextAnchor.MiddleCenter,
                    Color = "0.0 0.75 1.0 1.0",
                },
                RectTransform = { AnchorMin = "0.55 0.05", AnchorMax = "0.92 0.9" },
            }, GuiPanelName);

            // Кнопка закрытия
            elements.Add(new CuiButton
            {
                Button = { Color = "0.8 0.2 0.2 0.7", Close = GuiPanelName },
                RectTransform = { AnchorMin = "0.93 0.6", AnchorMax = "1.0 0.9" },
                Text = {
                    Text = "✕",
                    FontSize = 10,
                    Align = TextAnchor.MiddleCenter,
                    Color = "1 1 1 1",
                },
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
