/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Текст расписания вайпов (см. WIPE_SCHEDULE_HINT_DEFAULT в wipeSchedule) */
  readonly VITE_WIPE_SCHEDULE_HINT?: string;
  /** Промокод в hero на главной (по умолчанию WIPE) */
  readonly VITE_HERO_PROMO_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
