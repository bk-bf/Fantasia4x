import { mount } from 'svelte';
 
import Page from '../../../src/routes/gear-db/+page.svelte';
// @ts-expect-error — virtual module, supplied by vite.config.mjs.
import audit from 'virtual:gear-db-audit';

mount(Page, { target: document.getElementById('app')!, props: { data: { audit } } });
