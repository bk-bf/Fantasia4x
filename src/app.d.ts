declare global {
  namespace App {}

  const __APP_VERSION__: string;
}

interface ImportMetaEnv {
  readonly VITE_DEBUG_MODE?: string;
  readonly VITE_DEBUG_LOG?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
