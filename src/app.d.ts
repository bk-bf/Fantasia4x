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
}

// Vite env vars
interface ImportMetaEnv {
  // Full debug mode: debug UI (tab, dev controls, entity #ids) + the verbose per-tick log firehose.
  readonly VITE_DEBUG_MODE?: string;
  // Debug UI ONLY — no verbose logging. Lets the desktop-shell launches (./launch.sh --electron,
  // incl. --profiler) surface the DEBUG tab while keeping the sim profiling clean (no firehose).
  readonly VITE_DEBUG_UI?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
