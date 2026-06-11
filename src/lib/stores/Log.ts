import { writable, derived } from 'svelte/store';
import type { ActivityLogEntry, CombatTurnEntry } from '$lib/game/core/Events';
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

// Function to add activity log entries. Returns the generated entry id so callers
// (e.g. the combat-engagement tracker) can later update the same entry in place.
export function logActivity(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): string {
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
  return fullEntry.id;
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

// ── Engagement-scoped combat sessions ────────────────────────────────────────
//
// One Chronicle entry per *engagement* (an unordered attacker/defender pair),
// not per swing. Every hit/miss appends a CombatTurnEntry to that entry's
// breakdown and refreshes its summary in place — so a 40-swing brawl reads as a
// single expandable line instead of 40 "engaged in combat" lines.
//
// A session stays open across brief disengage/re-engage flickers; it only closes
// on death or after ENGAGEMENT_EXPIRE_TICKS of no activity (lazily, on the next
// event for that pair). This is what kills the re-engagement log spam.

interface CombatSession {
  entryId: string;
  attackerId: string;
  attackerName: string;
  defenderName: string;
  startTurn: number;
  lastActivityTurn: number;
  hits: number;
  misses: number;
  totalDamage: number;
  killed: boolean;
  closed: boolean;
  breakdown: CombatTurnEntry[];
  focusX: number;
  focusY: number;
}

const combatSessions = new Map<string, CombatSession>();

/** Ticks of silence before an engagement is considered over (≈5s at 60 TPS). */
const ENGAGEMENT_EXPIRE_TICKS = 300;

function sessionSummary(s: CombatSession): { result: string; severity: ActivityLogEntry['severity'] } {
  const swings = s.hits + s.misses;
  let result = `${s.hits}/${swings} hits · ${s.totalDamage} dmg`;
  if (s.killed) result += ' · killed';
  else if (s.closed) result += ' · disengaged';
  const severity: ActivityLogEntry['severity'] = s.killed ? 'critical' : 'warning';
  return { result, severity };
}

/**
 * Rewrite the session's Chronicle entry in place (immutably → reactivity fires).
 * Called once per resolved swing — cheap because swings are gated by attack cadence
 * (~every 30 ticks per attacker), not emitted every sim tick.
 */
function flushSession(s: CombatSession) {
  const { result, severity } = sessionSummary(s);
  const breakdownCopy = [...s.breakdown];
  activityLog.update((log) =>
    log.map((e) =>
      e.id === s.entryId ? { ...e, result, severity, combatBreakdown: breakdownCopy } : e
    )
  );
}

/** Test-only: clear in-flight engagement sessions so module state doesn't leak. */
export function __resetCombatSessions() {
  combatSessions.clear();
}

/**
 * Record one resolved combat swing (hit OR miss) between an attacker and defender.
 * Opens the engagement entry lazily on the first swing; appends to it thereafter.
 */
export function logCombatSwing(
  attackerId: string,
  attackerName: string,
  defenderId: string,
  defenderName: string,
  turn: number,
  focusX: number,
  focusY: number,
  swing: CombatTurnEntry
) {
  const key = combatKey(attackerId, defenderId);
  let session = combatSessions.get(key);

  // Stale session (engagement lapsed) → close it out and start a fresh one.
  if (session && (session.closed || turn - session.lastActivityTurn > ENGAGEMENT_EXPIRE_TICKS)) {
    if (!session.closed) {
      session.closed = true;
      flushSession(session);
    }
    combatSessions.delete(key);
    session = undefined;
  }

  if (!session) {
    const entry: Omit<ActivityLogEntry, 'id' | 'timestamp'> = {
      turn,
      type: 'combat',
      actor: attackerId,
      action: `${attackerName} engaged ${defenderName}`,
      target: defenderId,
      result: '',
      severity: 'warning',
      entityIds: [attackerId, defenderId],
      focusX,
      focusY,
      combatBreakdown: []
    };
    const entryId = logActivity(entry);
    session = {
      entryId,
      attackerId,
      attackerName,
      defenderName,
      startTurn: turn,
      lastActivityTurn: turn,
      hits: 0,
      misses: 0,
      totalDamage: 0,
      killed: false,
      closed: false,
      breakdown: [],
      focusX,
      focusY
    };
    combatSessions.set(key, session);
  }

  session.breakdown.push(swing);
  if (swing.hit) {
    session.hits += 1;
    session.totalDamage += swing.damage ?? 0;
  } else {
    session.misses += 1;
  }
  session.lastActivityTurn = turn;
  flushSession(session);
}

/** Finalize an engagement after a kill (forces an immediate summary refresh). */
export function logCombatKill(attackerId: string, defenderId: string) {
  const key = combatKey(attackerId, defenderId);
  const session = combatSessions.get(key);
  if (!session) return;
  session.killed = true;
  session.closed = true;
  flushSession(session);
  combatSessions.delete(key);
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

/** Logs an entity death with its cause (starvation, blood loss, combat, …). */
export function logEntityDeath(
  entityId: string,
  entityName: string,
  cause: string,
  turn: number,
  focusX: number,
  focusY: number
) {
  logActivity({
    turn,
    type: 'entity',
    actor: entityId,
    action: `${entityName} died`,
    target: cause,
    result: `of ${cause.replace(/_/g, ' ')}`,
    severity: 'critical',
    entityIds: [entityId],
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
  const interesting = ['Attacking', 'Fleeing', 'Hunting', 'Eating', 'Sleeping', 'Startled', 'Exhausted', 'Collapsed'];
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
