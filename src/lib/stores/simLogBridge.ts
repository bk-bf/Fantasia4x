import { setSimLogSink, type SimLogSink } from '$lib/game/core/util/logSink';
import { logActivity, logDiag, logEntityDeath, logCombatSwing, logCombatKill } from './Log';
import { combatFeedback } from './fx/combatFeedback';
import { attackLunges } from './fx/attackLunges';
import { combatSounds } from './fx/combatSounds';
import { projectiles } from './fx/projectiles';
import { requestThreatPause, requestDeathPause } from './gameState';
import { threatPulse, alertPulse } from './uiState';

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
