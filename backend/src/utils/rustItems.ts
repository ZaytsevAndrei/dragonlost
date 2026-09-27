// rust_item_code может быть либо одиночным shortname ("screwdriver"),
// либо списком предметов набора ("diving.mask:1,tank:1,spear:15")
export interface BundleComponent {
  code: string;
  quantity: number;
}

export function parseBundleCode(rawCode: string): BundleComponent[] {
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
