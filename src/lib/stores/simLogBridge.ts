/**
 * P-3: wire the simulation layer's log/feedback sink to the real Svelte stores.
 *
 * The sim (Combat, EntityService, pawn state machine) emits through `simLog` (core/logSink),
 * which defaults to a no-op. This module — in the store layer, where importing stores is legal —
 * registers an implementation that delegates to the chronicle (`Log`) and the combat-feedback
 * channel. Imported for its side effect from `stores/gameState.ts`, so it runs before any tick.
 */
import { setSimLogSink, type SimLogSink } from '$lib/game/core/logSink';
import {
  logActivity,
  logDiag,
  logHuntStart,
  logFlee,
  logEntityStateChange,
  logEntityDeath,
  logCombatSwing,
  logCombatKill
} from './Log';
import { combatFeedback } from './combatFeedback';

/**
 * The real (DOM/store-backed) sink. Exported so the sim-worker bridge can replay buffered
 * `simlog` events against the exact same implementation — under the worker the sim runs off-thread
 * and forwards its sink calls here rather than registering this directly (it can't reach the DOM).
 */
export const realSimLogSink: SimLogSink = {
  logActivity,
  logEvent: logDiag,
  logCombatSwing,
  logCombatKill,
  pushCombatText: (req) => combatFeedback.push(req),
  logHuntStart,
  logFlee,
  logEntityDeath,
  logEntityStateChange
};

setSimLogSink(realSimLogSink);
