import { mount } from 'svelte';
 
// @ts-expect-error — resolved through the standalone build's alias, not tsconfig's SvelteKit paths.
import Page from '../../../src/routes/gear-db/+page.svelte';
// @ts-expect-error — virtual module, supplied by vite.config.mjs.
import audit from 'virtual:gear-db-audit';

mount(Page, { target: document.getElementById('app')!, props: { data: { audit } } });
