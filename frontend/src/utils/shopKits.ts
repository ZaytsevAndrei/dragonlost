import type { ShopItem } from '../types';

export interface KitComponent {
  code: string;
  quantity: number;
}

// Русские названия предметов из состава наборов (shortname → имя).
// Дополняется вместе с новыми наборами в миграциях магазина.
const KIT_ITEM_NAMES: Record<string, string> = {
  'diving.mask': 'Подводная маска',
  'diving.tank': 'Баллон',
  'diving.wetsuit': 'Гидрокостюм',
  'diving.fins': 'Ласты',
  speargun: 'Подводное ружьё',
  'speargun.spear': 'Гарпун',
  'electric.fuelgenerator.small': 'Малый генератор',
  autoturret: 'Автоматическая турель',
  wire: 'Провод',
  lowgradefuel: 'Топливо низкого качества',
  'attire.ninja.suit': 'Костюм ниндзя',
  'pistol.semiauto': 'Полуавтоматический пистолет',
  'syringe.medical': 'Медицинский шприц',
  bandage: 'Бинт',
  'ammo.pistol': 'Пистолетные патроны',
  'explosive.timed': 'Заряд C4',
  'explosive.satchel': 'Кассетный заряд',
  'trap.landmine': 'Противопехотная мина',
};

// Разбор rust_item_code набора ("diving.mask:1,speargun.spear:15") —
// зеркально parseBundleCode в backend/src/routes/inventory.ts, выдача идёт по той же строке.
function parseKitCode(rawCode: string): KitComponent[] {
  return rawCode
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.lastIndexOf(':');
      if (separatorIndex === -1) return { code: part, quantity: 1 };
      const code = part.slice(0, separatorIndex);
      const qty = Number.parseInt(part.slice(separatorIndex + 1), 10);
      if (!code || !Number.isFinite(qty) || qty < 1) return { code: part, quantity: 1 };
      return { code, quantity: qty };
    });
}

// Состав показываем только у наборов из двух и более предметов —
// одиночные товары остаются с обычным текстовым описанием.
export function getKitComponents(item: ShopItem): KitComponent[] {
  if (String(item.category ?? '').trim().toLowerCase() !== 'kit') return [];
  if (typeof item.rust_item_code !== 'string' || !item.rust_item_code.trim()) return [];
  const components = parseKitCode(item.rust_item_code);
  return components.length >= 2 ? components : [];
}

export function getKitItemLabel(code: string): string {
  return KIT_ITEM_NAMES[code] ?? code;
}

export function getKitItemIconPath(code: string): string {
  return `/uploads/shop/${code}.png`;
}

// Короткая подводка из описания — текст до первого двоеточия
// ("Комплект для исследования морских глубин: маска, баллон…" → "Комплект для исследования морских глубин").
export function getKitTeaser(description: unknown): string {
  if (typeof description !== 'string') return '';
  const text = description.trim();
  if (!text) return '';
  const separatorIndex = text.indexOf(':');
  if (separatorIndex === -1) return text;
  return text.slice(0, separatorIndex).trim();
}

function pluralItems(count: number): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 19) return 'предметов';
  if (last === 1) return 'предмет';
  if (last >= 2 && last <= 4) return 'предмета';
  return 'предметов';
}

export function formatKitItemCount(components: KitComponent[]): string {
  const total = components.reduce((sum, component) => sum + component.quantity, 0);
  return `${total} ${pluralItems(total)}`;
}
