/**
 * devFlags — runtime dev/experiment toggles for the simulation (worker-safe; no DOM/store deps).
 *
 * These are NOT gameplay options — they exist to run controlled profiling experiments. The sim runs
 * in the worker (ADR-021), which can't read the page URL, so the main thread reads the `?flag` and
 * passes it through the worker `init` message; the worker calls the setter once at init.
 *
 * `combatDisabled` (`?nocombat`): nulls pawn↔mob perception (no Alerted/Attacking/Fleeing toward
 * pawns) and skips `tickCombat`, so the entire combat cascade disappears while entity count stays
 * the same — an A/B baseline to measure how much of the tick is combat (ENGINE-PERFORMANCE).
 *
 * KEEP THIS MODULE even though nothing imports it right now. The `?nocombat` main-thread → worker
 * wiring and the `combatDisabled` gate sites were removed at some point, so a dead-code sweep reads
 * this as an orphan. It is a profiling facility, not litter: re-enabling the experiment means
 * re-adding the two gate sites and the init passthrough, not rewriting the toggle. Same reasoning as
 * the YIELD-DBG harvest logger in ResourceObjectService.
 */

// Live binding (read at call time, like core/logSink's sink) so the gate sites see the value the
// worker set at init even though they imported this module earlier.
export let combatDisabled = false;

export function setCombatDisabled(v: boolean): void {
  combatDisabled = v;
}
