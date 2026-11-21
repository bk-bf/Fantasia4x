import { writable } from 'svelte/store';

export const fuelTarget = writable<string | null>(null);
