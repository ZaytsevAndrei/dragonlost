export interface ConveyorFilterItem {
  TargetCategory: number | null;
  MaxAmountInOutput: number;
  BufferAmount: number;
  MinAmountInInput: number;
  IsBlueprint: boolean;
  TargetItemName: string;
}

/** Лимит слотов фильтра, как в Industrial Conveyor в Rust */
export const MAX_CONVEYOR_ITEMS = 30;

export interface ConveyorFilter {
  id: number;
  owner_steamid: string;
  owner_username: string | null;
  owner_avatar: string | null;
  title: string;
  description: string | null;
  cover_shortname: string | null;
  category: string | null;
  is_public: boolean;
  items: ConveyorFilterItem[];
  item_count: number;
  export_count: number;
  created_at: string;
  updated_at: string;
  is_saved?: boolean;
  can_edit?: boolean;
  is_owner?: boolean;
}

export interface ConveyorFilterShare {
  steamid: string;
  username: string;
  avatar: string;
  can_edit: boolean;
  created_at?: string;
}

export function createEmptyItem(shortname = ''): ConveyorFilterItem {
  return {
    TargetCategory: null,
    MaxAmountInOutput: 0,
    BufferAmount: 0,
    MinAmountInInput: 0,
    IsBlueprint: false,
    TargetItemName: shortname,
  };
}

/** Экспорт в формат игры (как в conveyorfilters/primer.txt) */
export function exportConveyorJson(items: ConveyorFilterItem[]): string {
  const payload = items.map((item) => ({
    TargetCategory: item.TargetCategory ?? null,
    MaxAmountInOutput: Number(item.MaxAmountInOutput) || 0,
    BufferAmount: Number(item.BufferAmount) || 0,
    MinAmountInInput: Number(item.MinAmountInInput) || 0,
    IsBlueprint: Boolean(item.IsBlueprint),
    TargetItemName: item.TargetItemName,
  }));
  return JSON.stringify(payload, null, 2);
}

export function parseConveyorImport(raw: string): ConveyorFilterItem[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Ожидался JSON-массив');
  }
  if (parsed.length > MAX_CONVEYOR_ITEMS) {
    throw new Error(`Максимум ${MAX_CONVEYOR_ITEMS} предметов в фильтре`);
  }
  return parsed.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Некорректный элемент фильтра');
    }
    const name = String(entry.TargetItemName || '').trim();
    const categoryRaw = entry.TargetCategory;
    const targetCategory =
      categoryRaw === null || categoryRaw === undefined || categoryRaw === ''
        ? null
        : Number(categoryRaw);
    if (!name && (targetCategory === null || !Number.isFinite(targetCategory))) {
      throw new Error('У элемента нет TargetItemName и TargetCategory');
    }
    return {
      TargetCategory: targetCategory === null || !Number.isFinite(targetCategory) ? null : targetCategory,
      MaxAmountInOutput: Number(entry.MaxAmountInOutput) || 0,
      BufferAmount: Number(entry.BufferAmount) || 0,
      MinAmountInInput: Number(entry.MinAmountInInput) || 0,
      IsBlueprint: Boolean(entry.IsBlueprint),
      TargetItemName: name,
    };
  });
}

function copyTextFallback(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** Копирует текст в буфер обмена (вызывать до await, пока активен жест пользователя). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyTextFallback(text);
  }
}
