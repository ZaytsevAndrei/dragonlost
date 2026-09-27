// rust_item_code может быть либо одиночным shortname ("screwdriver"),
// либо списком предметов набора ("diving.mask:1,tank:1,spear:15").
// Третий сегмент опционально задаёт skin ID ("burlap.shirt:1:2911362787") —
// тогда предмет выдаётся со скином.
export interface BundleComponent {
  code: string;
  quantity: number;
  skinId?: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 1 ? value : fallback;
}

export function parseBundleCode(rawCode: string): BundleComponent[] {
  return rawCode
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const segments = part.split(':');
      const code = segments[0].trim();
      if (!code) return { code: part, quantity: 1 };
      const component: BundleComponent = {
        code,
        quantity: parsePositiveInt(segments[1], 1),
      };
      const skinId = parsePositiveInt(segments[2], 0);
      if (skinId > 0) component.skinId = skinId;
      return component;
    });
}
