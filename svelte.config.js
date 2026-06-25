import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // adapter-static: the game is a single client-only SPA (one +page.svelte, no server load, /api is
    // dev-only) bundled to plain files in `build/` so the Electron shell can load it over file://.
    // `fallback` makes it SPA-mode (no per-route prerender); see src/routes/+layout.ts (ssr=false).
    adapter: adapter({
      fallback: 'index.html',
      precompress: false,
      strict: false
    }),
    // Relative asset URLs (./_app/…) instead of absolute (/_app/…) so index.html resolves its bundles
    // when opened from disk in Electron (file://), where an absolute path would point at the FS root.
    paths: { relative: true }
  }
};

export default config;
