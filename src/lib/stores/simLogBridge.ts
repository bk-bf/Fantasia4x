/**
 * P-3: wire the simulation layer's log/feedback sink to the real Svelte stores.
 *
 * The sim (Combat, EntityService, pawn state machine) emits through `simLog` (core/logSink),
 * which defaults to a no-op. This module — in the store layer, where importing stores is legal —
 * registers an implementation that delegates to the chronicle (`Log`) and the combat-feedback
 * channel. Imported for its side effect from `stores/gameState.ts`, so it runs before any tick.
 */
import { setSimLogSink, type SimLogSink } from '$lib/game/core/logSink';
import { logActivity, logDiag, logEntityDeath, logCombatSwing, logCombatKill } from './Log';
import { combatFeedback } from './combatFeedback';
import { attackLunges } from './attackLunges';
import { combatSounds } from './combatSounds';
import { projectiles } from './projectiles';
import { requestThreatPause } from './gameState';
import { threatPulse } from './uiState';

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
  pushAttackLunge: (req) => attackLunges.push(req),
  pushCombatSound: (req) => combatSounds.push(req),
  pushProjectile: (req) => projectiles.push(req),
  logEntityDeath,
  // A mob just spotted a colonist: auto-pause (if enabled), drop a PULSING chronicle alert, and bump the
  // pulse signal so the Chronicle's restore button flashes while minimised.
  threatAlert: (mobId, mobName, pawnName, turn, focusX, focusY) => {
    requestThreatPause();
    logActivity({
      turn,
      type: 'combat',
      actor: mobId,
      action: `${mobName} spotted ${pawnName}!`,
      target: pawnName,
      result: 'Threat sighted',
      severity: 'critical',
      entityIds: [mobId],
      focusX,
      focusY,
      pulse: true
    });
    threatPulse.set(Date.now());
  }
};

setSimLogSink(realSimLogSink);
