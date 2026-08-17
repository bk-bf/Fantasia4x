import { mount } from 'svelte';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — resolved through the standalone build's alias, not tsconfig's SvelteKit paths.
import Page from '../../../src/routes/gear-db/+page.svelte';
// @ts-expect-error — virtual module, supplied by vite.config.mjs.
import audit from 'virtual:gear-db-audit';

// The route's `+page.server.ts` reads static/audit/*.json off disk at render time; the standalone
// build does that same read once, at build time, and hands the result in as the `data` prop.
mount(Page, { target: document.getElementById('app')!, props: { data: { audit } } });
