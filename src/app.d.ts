declare global {
  namespace App {}

  const __APP_VERSION__: string;
  const __F4X_BUILD__: import('$lib/dev/sessionHeader').BuildInfo;
}

interface ImportMetaEnv {
  readonly VITE_DEBUG_MODE?: string;
  readonly VITE_DEBUG_LOG?: string;
  readonly VITE_WORK_PINS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
