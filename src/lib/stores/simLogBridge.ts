// Wires the sim's log/feedback sink (core/logSink, default no-op) to the real Svelte stores.
// Imported for its side effect from `stores/gameState.ts`, so it runs before any tick.
import { setSimLogSink, type SimLogSink } from '$lib/game/core/logSink';
import { logActivity, logDiag, logEntityDeath, logCombatSwing, logCombatKill } from './Log';
import { combatFeedback } from './combatFeedback';
import { attackLunges } from './attackLunges';
import { combatSounds } from './combatSounds';
import { projectiles } from './projectiles';
import { requestThreatPause, requestDeathPause } from './gameState';
import { threatPulse, alertPulse } from './uiState';

/** The real (store-backed) sink. Exported so the sim-worker bridge can replay buffered `simlog`
 *  events against it — the off-thread sim can't reach the DOM, so it forwards sink calls here. */
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
  // Mob spotted a colonist: auto-pause (if enabled) + pulsing chronicle alert.
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
  },
  // Malnutrition/dehydration worsened a stage: pulsing warning + alert bugle. No auto-pause.
  vitalAlert: (_pawnId, pawnName, vital, stageLabel, turn, focusX, focusY) => {
    const label = vital === 'malnutrition' ? 'Malnutrition' : 'Dehydration';
    logActivity({
      turn,
      type: 'pawn_action',
      actor: _pawnId,
      action: `${pawnName} is ${stageLabel} — ${label.toLowerCase()} worsening`,
      target: pawnName,
      result: `${label}: ${stageLabel}`,
      severity: 'warning',
      entityIds: [_pawnId],
      focusX,
      focusY,
      pulse: true
    });
    alertPulse.set(Date.now());
  },
  // Colonist died: auto-pause + pulse + bugle. The per-path death log already wrote the narrative
  // entry; this only makes the permadeath unmissable. Fired once from the shared finaliser.
  pawnDeath: (pawnId, pawnName, cause, turn, focusX, focusY) => {
    requestDeathPause();
    logActivity({
      turn,
      type: 'pawn_action',
      actor: pawnId,
      action: `${pawnName} has died (${cause.replace(/_/g, ' ')})`,
      target: pawnName,
      result: 'Colonist lost',
      severity: 'critical',
      entityIds: [pawnId],
      focusX,
      focusY,
      pulse: true
    });
    alertPulse.set(Date.now());
  }
};

setSimLogSink(realSimLogSink);
