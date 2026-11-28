import { writable } from 'svelte/store';

export const buildingTarget = writable<string | null>(null);

export type StoreTarget = { kind: 'building' | 'zone'; id: string };
export const storeTarget = writable<StoreTarget | null>(null);
