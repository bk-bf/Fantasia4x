// SPA mode for adapter-static (DISTRIBUTION Phase B). The game is entirely client-side — it boots a
// sim Web Worker, WebGL, IndexedDB saves and WASM, none of which can run during server prerender — so
// we disable SSR/prerender and let adapter-static emit the `fallback: index.html` shell that the
// Electron shell (and any static host) loads. Mirrors the SvelteKit "single-page app" recipe.
export const ssr = false;
export const prerender = false;
