/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Текст расписания вайпов (по умолчанию: среда 18:00 МСК) */
  readonly VITE_WIPE_SCHEDULE_HINT?: string;
  /** Промокод в hero на главной (по умолчанию WIPE) */
  readonly VITE_HERO_PROMO_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
