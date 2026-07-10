using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Oxide.Core;
using Oxide.Core.Libraries.Covalence;

namespace Oxide.Plugins
{
    [Info("SpawnSettings", "DragonLost.ru", "1.0.0")]
    [Description("Выставляет spawn convars при старте сервера (руда, бочки, респавн)")]
    public class SpawnSettings : CovalencePlugin
    {
        private const string PermissionAdmin = "spawnsettings.admin";

        private PluginConfig _config;

        #region Configuration

        private class PluginConfig
        {
            [JsonProperty("Применять настройки при старте сервера")]
            public bool ApplyOnStartup { get; set; } = true;

            [JsonProperty("Задержка перед spawn.fill_populations (сек)")]
            public float FillPopulationsDelay { get; set; } = 30f;

            [JsonProperty("Вызвать spawn.fill_populations после применения")]
            public bool FillPopulations { get; set; } = true;

            [JsonProperty("Сохранить в server.cfg (server.writecfg)")]
            public bool WriteServerCfg { get; set; } = false;

            [JsonProperty("spawn.min_rate")]
            public float SpawnMinRate { get; set; } = 0.8f;

            [JsonProperty("spawn.max_rate")]
            public float SpawnMaxRate { get; set; } = 1.3f;

            [JsonProperty("spawn.min_density")]
            public float SpawnMinDensity { get; set; } = 0.7f;

            [JsonProperty("spawn.max_density")]
            public float SpawnMaxDensity { get; set; } = 1.2f;

            [JsonProperty("spawn.player_base")]
            public int SpawnPlayerBase { get; set; } = 50;

            [JsonProperty("spawn.player_scale")]
            public float SpawnPlayerScale { get; set; } = 2f;

            [JsonProperty("Дополнительные convars (имя = значение, необязательно)")]
            public Dictionary<string, string> ExtraConvars { get; set; } = new Dictionary<string, string>();
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
                PrintWarning("Ошибка чтения конфигурации SpawnSettings, загружены значения по умолчанию");
                LoadDefaultConfig();
            }
        }

        protected override void SaveConfig() => Config.WriteObject(_config, true);

        private void ValidateConfig()
        {
            _config.FillPopulationsDelay = Math.Max(0f, _config.FillPopulationsDelay);
            _config.SpawnMinRate = Clamp(_config.SpawnMinRate, 0.1f, 5f);
            _config.SpawnMaxRate = Clamp(_config.SpawnMaxRate, _config.SpawnMinRate, 5f);
            _config.SpawnMinDensity = Clamp(_config.SpawnMinDensity, 0.1f, 5f);
            _config.SpawnMaxDensity = Clamp(_config.SpawnMaxDensity, _config.SpawnMinDensity, 5f);
            _config.SpawnPlayerBase = Math.Max(1, _config.SpawnPlayerBase);
            _config.SpawnPlayerScale = Clamp(_config.SpawnPlayerScale, 0.1f, 10f);
            _config.ExtraConvars ??= new Dictionary<string, string>();

            SaveConfig();
        }

        private static float Clamp(float value, float min, float max) => Math.Max(min, Math.Min(max, value));

        #endregion

        #region Hooks

        private void Init()
        {
            permission.RegisterPermission(PermissionAdmin, this);
        }

        private void OnServerInitialized()
        {
            if (!_config.ApplyOnStartup)
            {
                Puts("Применение spawn convars отключено в конфиге");
                return;
            }

            ApplySpawnSettings("старт сервера");
        }

        #endregion

        #region Commands

        [Command("spawnsettings.apply")]
        private void CmdApply(IPlayer player, string command, string[] args)
        {
            if (!player.IsServer && !player.HasPermission(PermissionAdmin))
            {
                player.Reply("Нет прав. Нужно: spawnsettings.admin");
                return;
            }

            ApplySpawnSettings(player.IsServer ? "консоль" : player.Name);
            player.Reply("Spawn convars применены из конфига SpawnSettings.json");
        }

        [Command("spawnsettings.reload")]
        private void CmdReload(IPlayer player, string command, string[] args)
        {
            if (!player.IsServer && !player.HasPermission(PermissionAdmin))
            {
                player.Reply("Нет прав. Нужно: spawnsettings.admin");
                return;
            }

            LoadConfig();
            ApplySpawnSettings(player.IsServer ? "консоль (reload)" : player.Name + " (reload)");
            player.Reply("Конфиг перечитан и convars применены");
        }

        #endregion

        #region Core

        private void ApplySpawnSettings(string source)
        {
            SetConvar("spawn.min_rate", _config.SpawnMinRate.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture));
            SetConvar("spawn.max_rate", _config.SpawnMaxRate.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture));
            SetConvar("spawn.min_density", _config.SpawnMinDensity.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture));
            SetConvar("spawn.max_density", _config.SpawnMaxDensity.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture));
            SetConvar("spawn.player_base", _config.SpawnPlayerBase.ToString());
            SetConvar("spawn.player_scale", _config.SpawnPlayerScale.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture));

            foreach (var pair in _config.ExtraConvars)
            {
                if (string.IsNullOrWhiteSpace(pair.Key))
                    continue;

                SetConvar(pair.Key.Trim(), pair.Value ?? string.Empty);
            }

            Puts($"Spawn convars применены ({source}): " +
                 $"rate {_config.SpawnMinRate}-{_config.SpawnMaxRate}, " +
                 $"density {_config.SpawnMinDensity}-{_config.SpawnMaxDensity}, " +
                 $"player_base {_config.SpawnPlayerBase}, player_scale {_config.SpawnPlayerScale}");

            if (_config.WriteServerCfg)
                Server.Command("server.writecfg");

            if (!_config.FillPopulations)
                return;

            if (_config.FillPopulationsDelay <= 0f)
            {
                Server.Command("spawn.fill_populations");
                Puts("Выполнено: spawn.fill_populations");
                return;
            }

            timer.Once(_config.FillPopulationsDelay, () =>
            {
                Server.Command("spawn.fill_populations");
                Puts($"Выполнено: spawn.fill_populations (через {_config.FillPopulationsDelay} сек)");
            });
        }

        private void SetConvar(string name, string value)
        {
            Server.Command(name, value);
        }

        #endregion
    }
}
