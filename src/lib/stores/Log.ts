import { writable, derived } from 'svelte/store';
import type { ActivityLogEntry } from '$lib/game/core/Events';
import { activityLogger } from '$lib/game/dev/activityLogger';

export const activityLog = writable<ActivityLogEntry[]>([]);

// Derived stores for different log views
export const recentActivity = derived(
  activityLog,
  ($log) => $log.slice(-50).reverse() // Last 50 entries, newest first
);

export const workActivity = derived(activityLog, ($log) =>
  $log
    .filter((entry) => entry.type === 'work')
    .slice(-20)
    .reverse()
);

export const eventActivity = derived(activityLog, ($log) =>
  $log
    .filter((entry) => entry.type === 'event')
    .slice(-20)
    .reverse()
);

export const criticalActivity = derived(activityLog, ($log) =>
  $log
    .filter((entry) => ['warning', 'error', 'critical'].includes(entry.severity))
    .slice(-10)
    .reverse()
);

// Function to add activity log entries
export function logActivity(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>) {
  const fullEntry: ActivityLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date()
  };

  activityLog.update((log) => {
    const newLog = [...log, fullEntry];
    // Keep only last 1000 entries to prevent memory issues
    return newLog.slice(-1000);
  });

  activityLogger.log(fullEntry);
}

// Convenience functions for different activity types
export function logWork(
  pawnId: string,
  action: string,
  target: string,
  result: string,
  turn: number
) {
  logActivity({
    turn,
    type: 'work',
    actor: pawnId,
    action,
    target,
    result,
    severity: 'info'
  });
}

export function logBuilding(
  action: string,
  target: string,
  result: string,
  turn: number,
  actor?: string
) {
  logActivity({
    turn,
    type: 'building',
    actor: actor || 'system',
    action,
    target,
    result,
    severity: 'success'
  });
}

export function logEvent(eventTitle: string, consequences: string[], turn: number) {
  logActivity({
    turn,
    type: 'event',
    actor: 'system',
    action: 'Event Occurred',
    target: eventTitle,
    result: consequences.join(', '),
    severity: 'warning'
  });
}

export function logPawnAction(
  pawnId: string,
  action: string,
  result: string,
  turn: number,
  severity: 'info' | 'success' | 'warning' | 'error' = 'info'
) {
  logActivity({
    turn,
    type: 'pawn_action',
    actor: pawnId,
    action,
    result,
    severity
  });
}

export function logSystem(
  action: string,
  result: string,
  turn: number,
  severity: 'info' | 'success' | 'warning' | 'error' | 'critical' = 'info'
) {
  logActivity({
    turn,
    type: 'system',
    actor: 'system',
    action,
    result,
    severity
  });
}

// ── Combat & Entity Logging ─────────────────────────────────────────────────

/** Active combat sessions being tracked for breakdown (key = "attackerId|defenderId"). */
const activeCombatSessions = new Map<string, ActivityLogEntry>();

/** Deduplication: last turn an entity logged a specific action type. */
const lastEntityLogTurn = new Map<string, number>();

function combatKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Check if we should skip logging because the same entity logged the same action recently. */
function shouldSkipLog(entityId: string, actionType: string, turn: number, cooldownTicks: number): boolean {
  const key = `${entityId}:${actionType}`;
  const last = lastEntityLogTurn.get(key);
  if (last !== undefined && turn - last < cooldownTicks) {
    return true;
  }
  lastEntityLogTurn.set(key, turn);
  return false;
}

export function logCombatStart(
  attackerId: string,
  attackerName: string,
  defenderId: string,
  defenderName: string,
  turn: number,
  focusX: number,
  focusY: number
) {
  // Deduplicate: same combat pair within 60 ticks (1s) → skip
  const pairKey = combatKey(attackerId, defenderId);
  if (shouldSkipLog(pairKey, 'combat-start', turn, 60)) return;

  const key = combatKey(attackerId, defenderId);
  const entry: ActivityLogEntry = {
    turn,
    type: 'combat',
    actor: attackerId,
    action: `${attackerName} engaged in combat with ${defenderName}`,
    target: defenderId,
    result: '',
    severity: 'warning',
    entityIds: [attackerId, defenderId],
    focusX,
    focusY,
    combatBreakdown: []
  };
  activeCombatSessions.set(key, entry);
  logActivity(entry);
}

export function logCombatTurn(
  attackerId: string,
  attackerName: string,
  defenderId: string,
  defenderName: string,
  turn: number,
  hit: boolean,
  damage?: number,
  injury?: string,
  knockdown?: boolean
) {
  const key = combatKey(attackerId, defenderId);
  const session = activeCombatSessions.get(key);
  const turnEntry: CombatTurnEntry = {
    turn,
    attackerName,
    defenderName,
    hit,
    damage,
    injury,
    knockdown
  };
  if (session && session.combatBreakdown) {
    session.combatBreakdown.push(turnEntry);
  }
}

export function logCombatEnd(
  attackerId: string,
  defenderId: string,
  result: string,
  turn: number
) {
  const key = combatKey(attackerId, defenderId);
  const session = activeCombatSessions.get(key);
  if (session) {
    session.result = result;
    session.severity = result.includes('died') || result.includes('killed') ? 'critical' : 'warning';
    activeCombatSessions.delete(key);
  }
}

export function logHuntStart(
  hunterId: string,
  hunterName: string,
  preyId: string,
  preyName: string,
  turn: number,
  focusX: number,
  focusY: number
) {
  if (shouldSkipLog(hunterId, 'hunt-start', turn, 60)) return;
  logActivity({
    turn,
    type: 'entity',
    actor: hunterId,
    action: `${hunterName} has started hunting ${preyName}`,
    target: preyId,
    result: '',
    severity: 'info',
    entityIds: [hunterId, preyId],
    focusX,
    focusY
  });
}

export function logFlee(
  entityId: string,
  entityName: string,
  threatId: string | undefined,
  threatName: string | undefined,
  turn: number,
  focusX: number,
  focusY: number
) {
  if (shouldSkipLog(entityId, 'flee', turn, 60)) return;
  const action = threatName
    ? `${entityName} is fleeing from ${threatName}`
    : `${entityName} is fleeing`;
  logActivity({
    turn,
    type: 'entity',
    actor: entityId,
    action,
    target: threatId,
    result: '',
    severity: 'warning',
    entityIds: threatId ? [entityId, threatId] : [entityId],
    focusX,
    focusY
  });
}

export function logEntityStateChange(
  entityId: string,
  entityName: string,
  fromState: string,
  toState: string,
  turn: number,
  focusX: number,
  focusY: number
) {
  // Only log interesting state transitions
  const interesting = ['Attacking', 'Fleeing', 'Hunting', 'Eating', 'Sleeping', 'Startled', 'Exhausted'];
  if (!interesting.includes(toState)) return;
  if (shouldSkipLog(entityId, `state-${toState}`, turn, 30)) return;
  logActivity({
    turn,
    type: 'entity',
    actor: entityId,
    action: `${entityName} is now ${toState.toLowerCase()}`,
    result: fromState !== toState ? `(was ${fromState.toLowerCase()})` : '',
    severity: toState === 'Attacking' || toState === 'Fleeing' ? 'warning' : 'info',
    entityIds: [entityId],
    focusX,
    focusY
  });
}
