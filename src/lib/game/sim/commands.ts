/**
 * commands.ts — the serializable command registry (ADR-021 W3).
 *
 * The single source of truth for "a player/dev action = a pure `(state, payload) => state`",
 * keyed by a string id. Both the main thread (current) and the sim worker (after cutover) import
 * this and apply commands to whichever copy of state they own — so the command LOGIC lives in one
 * worker-safe place and only the *dispatch target* changes at cutover.
 *
 * **Worker-safety rule:** everything imported here must run in a worker — no `$app/environment`,
 * no DOM, no Svelte. Pure core/service transforms only.
 *
 * Migration is tranche-by-tranche: each `gameState.update((s) => fn(s))` call site moves its `fn`
 * here under a name and calls `dispatchCommand(name, payload)`. On the main thread that's still
 * `applyCommand` (behaviour identical); the worker will postMessage instead.
 */
import type { GameState } from '../core/types';
import { addToStockpileZone, consumeFromStockpiles } from '../core/GameState';
import type { SimCommand } from './simProtocol';

/** Registry. Add a command here + call `dispatchCommand('id', payload)` at the (former) update site. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const COMMANDS: Record<string, (state: GameState, payload: any) => GameState> = {
  /** Add `amount` of `itemId` to the general stockpile zone. */
  addItem: (state, p: { itemId: string; amount: number }) =>
    addToStockpileZone(state, null, { [p.itemId]: p.amount }),

  /** Consume `quantity` of `itemId` from stockpiles if available (no-op if short). */
  consumeGlobalItem: (state, p: { itemId: string; quantity: number }) => {
    const current = (state.stockpile ?? {})[p.itemId] ?? 0;
    if (current < p.quantity) return state;
    return consumeFromStockpiles(state, { [p.itemId]: p.quantity });
  }
};

/** Apply a serializable command to a state, returning the new state. Unknown ids are a no-op. */
export function applySimCommand(state: GameState, cmd: SimCommand): GameState {
  const fn = COMMANDS[cmd.type];
  if (!fn) {
    console.error('[sim] unknown command:', cmd.type);
    return state;
  }
  return fn(state, cmd.payload);
}
