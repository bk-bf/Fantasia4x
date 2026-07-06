// Event store — a thin projection over the sim's `GameState.pendingEvent` (the sim is authoritative)
// plus the resolution dispatch. The reusable seam for world events: EventModalHost reads
// `currentEvent` and switches on `event.kind`; each event kind resolves through its own command.

import { derived } from 'svelte/store';
import { gameState } from './gameState';
import type { PendingEvent } from '$lib/game/core/types';

/** The world event awaiting a player decision, or null. Read-only — driven by the sim snapshot. */
export const currentEvent = derived(
  gameState,
  ($gs) => (($gs?.pendingEvent ?? null) as PendingEvent | null)
);

/** Resolve a migrant wave: accept the candidates with these ids (empty = reject all). The sim places
 *  the accepted pawns and clears the event, which closes the modal on the next snapshot. */
export function commitMigrants(acceptedIds: string[]): void {
  gameState.command({ type: 'commitMigrants', payload: { acceptedIds }, save: true });
}
