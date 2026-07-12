// Thin projection over the sim's `pendingEvent` (sim is authoritative) plus resolution dispatch;
// EventModalHost reads `currentEvent` and each event kind resolves through its own command.

import { derived } from 'svelte/store';
import { gameState } from './gameState';
import type { PendingEvent } from '$lib/game/core/types';

export const currentEvent = derived(
  gameState,
  ($gs) => (($gs?.pendingEvent ?? null) as PendingEvent | null)
);

/** Accept the migrant candidates with these ids (empty = reject all); the sim clears the event,
 *  which closes the modal on the next snapshot. */
export function commitMigrants(acceptedIds: string[]): void {
  gameState.command({ type: 'commitMigrants', payload: { acceptedIds }, save: true });
}

/** KINGDOMS-TRADE: dismiss the arrival announcement (the party is already on the map). */
export function acknowledgeKingdomArrival(): void {
  gameState.command({ type: 'acknowledgeKingdomArrival', payload: {}, save: true });
}
