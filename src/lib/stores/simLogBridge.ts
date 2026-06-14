/**
 * P-3: wire the simulation layer's log/feedback sink to the real Svelte stores.
 *
 * The sim (Combat, EntityService, pawn state machine) emits through `simLog` (core/logSink),
 * which defaults to a no-op. This module — in the store layer, where importing stores is legal —
 * registers an implementation that delegates to the chronicle (`Log`) and the combat-feedback
 * channel. Imported for its side effect from `stores/gameState.ts`, so it runs before any tick.
 */
import { setSimLogSink } from '$lib/game/core/logSink';
import {
  logActivity,
  logHuntStart,
  logFlee,
  logEntityStateChange,
  logEntityDeath,
  logCombatSwing,
  logCombatKill
} from './Log';
import { combatFeedback } from './combatFeedback';

setSimLogSink({
  logActivity,
  logCombatSwing,
  logCombatKill,
  pushCombatText: (req) => combatFeedback.push(req),
  logHuntStart,
  logFlee,
  logEntityDeath,
  logEntityStateChange
});
