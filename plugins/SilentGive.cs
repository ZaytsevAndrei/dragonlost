// SilentGive.cs — положить в oxide/plugins/ плагин, который не выводит в чат оповещения о выводе предметов с сайта
namespace Oxide.Plugins
{
    [Info("SilentGive", "DragonLost", "1.1.0")]
    class SilentGive : RustPlugin
    {
        [ConsoleCommand("silentgive")]
        void CmdSilentGive(ConsoleSystem.Arg arg)
        {
            if (!arg.IsServerside) return;

            var steamId   = arg.GetString(0);
            var shortname = arg.GetString(1);
            var amount    = arg.GetInt(2, 1);

            var player = BasePlayer.Find(steamId);
            if (player == null) { arg.ReplyWith("Player not found"); return; }

            var itemDef = ItemManager.FindItemDefinition(shortname);
            if (itemDef == null) { arg.ReplyWith("Item not found"); return; }

            var item = ItemManager.Create(itemDef, amount);
            if (item == null) { arg.ReplyWith("Failed to create item"); return; }

            if (!GiveSilent(player, item))
            {
                item.Drop(player.transform.position, UnityEngine.Vector3.up);
                arg.ReplyWith($"Inventory full, dropped {shortname} x{amount}");
                return;
            }

            arg.ReplyWith($"Gave {shortname} x{amount} to {player.displayName}");
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