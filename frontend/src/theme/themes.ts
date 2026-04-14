export const THEME_STORAGE_KEY = 'dragonlost-theme';

export const THEME_IDS = ['ember', 'frost', 'forest', 'aurora', 'flameice'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = 'ember';

export const THEME_OPTIONS: readonly { id: ThemeId; label: string }[] = [
  { id: 'ember', label: 'Уголь и пламя' },
  { id: 'frost', label: 'Морозный север' },
  { id: 'forest', label: 'Тайга' },
  { id: 'aurora', label: 'Полярное сияние' },
  { id: 'flameice', label: 'Пламя и лёд' },
] as const;

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return value != null && (THEME_IDS as readonly string[]).includes(value);
}

export function readStoredThemeId(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_ID;
}

export function writeStoredThemeId(id: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
