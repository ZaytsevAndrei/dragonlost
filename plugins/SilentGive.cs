// SilentGive.cs — положить в oxide/plugins/ плагин, который не выводит в чат оповещения о выдаче предметов с сайта
namespace Oxide.Plugins
{
    [Info("SilentGive", "DragonLost", "1.2.0")]
    class SilentGive : RustPlugin
    {
        // silentgive <steamid> <shortname> <amount> [skinid]
        [ConsoleCommand("silentgive")]
        void CmdSilentGive(ConsoleSystem.Arg arg)
        {
            if (!arg.IsServerside) return;

            var steamId   = arg.GetString(0);
            var shortname = arg.GetString(1);
            var amount    = arg.GetInt(2, 1);

            // skin ID не влезает в int (воркшоп-ID больше 2^31), парсим в ulong
            ulong skinId = 0;
            if (arg.Args != null && arg.Args.Length > 3)
            {
                ulong.TryParse(arg.Args[3], out skinId);
            }

            var player = BasePlayer.Find(steamId);
            if (player == null) { arg.ReplyWith("Player not found"); return; }

            var itemDef = ItemManager.FindItemDefinition(shortname);
            if (itemDef == null) { arg.ReplyWith("Item not found"); return; }

            var item = ItemManager.Create(itemDef, amount, skinId);
            if (item == null) { arg.ReplyWith("Failed to create item"); return; }

            if (!GiveSilent(player, item))
            {
                item.Drop(player.transform.position, UnityEngine.Vector3.up);
                arg.ReplyWith($"Inventory full, dropped {shortname} x{amount}");
                return;
            }

            var skinSuffix = skinId != 0 ? $" skin {skinId}" : string.Empty;
            arg.ReplyWith($"Gave {shortname} x{amount}{skinSuffix} to {player.displayName}");
        }

        private bool GiveSilent(BasePlayer player, Item item)
        {
            var containers = new[]
            {
                player.inventory.containerMain,
                player.inventory.containerBelt
            };

            foreach (var container in containers)
            {
                var savedOwner = container.playerOwner;
                container.playerOwner = null;

                bool moved = item.MoveToContainer(container);

                container.playerOwner = savedOwner;

                if (moved)
                {
                    player.SendNetworkUpdate();
                    return true;
                }
            }

            return false;
        }
    }
}