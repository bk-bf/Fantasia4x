// src/app.d.ts
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  // Compile-time constant injected by vite.config.ts `define` — package.json's version, shown on the
  // title screen so the credit line always matches the shipped build.
  const __APP_VERSION__: string;
}

// Vite env vars
interface ImportMetaEnv {
  // Full debug mode (dev.sh/launch.sh --debug): dev controls + entity #ids AND the log tab + the
  // verbose per-tick firehose (i.e. implies everything VITE_DEBUG_LOG enables, plus the dev UI).
  readonly VITE_DEBUG_MODE?: string;
  // Log only (dev.sh/launch.sh --log): the DEBUG log tab/viewer + the verbose firehose, WITHOUT the
  // rest of the dev UI. Composable with --profiler/--electron when you want to watch the log there.
  readonly VITE_DEBUG_LOG?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
