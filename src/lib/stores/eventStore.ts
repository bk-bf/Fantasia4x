import { derived } from 'svelte/store';
import { gameState } from './gameState';
import type { PendingEvent } from '$lib/game/core/types';

export const currentEvent = derived(
  gameState,
  ($gs) => ($gs?.pendingEvent ?? null) as PendingEvent | null
);

export function commitMigrants(acceptedIds: string[]): void {
  gameState.command({ type: 'commitMigrants', payload: { acceptedIds }, save: true });
}

export function acknowledgeKingdomArrival(): void {
  gameState.command({ type: 'acknowledgeKingdomArrival', payload: {}, save: true });
}
