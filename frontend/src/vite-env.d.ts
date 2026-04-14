/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Подсказка под календарём вайпов (расписание, Discord и т.д.) */
  readonly VITE_WIPE_SCHEDULE_HINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
