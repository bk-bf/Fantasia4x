import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import type { ActivityLogEntry, CombatTurnEntry } from '$lib/game/core/Events';
import type { LogEventInput } from '$lib/game/core/logSink';
import {
  loadActivityLog,
  scheduleSaveActivityLog,
  saveActivityLogNow,
  loadDebugLog,
  scheduleSaveDebugLog
} from './saveManager';

export const activityLog = writable<ActivityLogEntry[]>([]);

// The chronicle lives in this in-memory store (not in GameState), so it would be
// lost whenever the browser reloads/discards the tab. Restore it from IndexedDB on
// startup and persist (debounced) on every change so it survives a reload.
if (browser) {
  loadActivityLog().then((saved) => {
    if (saved.length > 0) {
      activityLog.update((live) => {
        // Merge persisted history with anything logged during the async load,
        // de-duped by id, keeping the most recent 1000 entries.
        const seen = new Set(saved.map((e) => e.id));
        return [...saved, ...live.filter((e) => !seen.has(e.id))].slice(-1000);
      });
    }
    // Begin persisting only after the initial load so we never clobber saved
    // history with the empty startup value.
    activityLog.subscribe((log) => scheduleSaveActivityLog(log));
  });
}

/** Clear the chronicle, in memory AND in storage. The eager flush (not the debounced save) means a
 *  refresh right after clearing won't restore the old log from a never-written debounce. */
export function clearActivityLog() {
  activityLog.set([]);
  saveActivityLogNow([]);
}

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

  mirrorToFile(fullEntry);
  return fullEntry.id;
}

// ── Unified diagnostic log (perf/ai/needs/job/system + verbose traces) ───────────────────────────
// Kept in its OWN bounded store so high-churn diagnostics never evict the player chronicle. Same
// persistence pattern as the chronicle (survives reload). The in-game debug tab reads `allLogEntries`
// (chronicle ⊕ debug, merged); the agent reads the per-category `.debug/<category>.log` file mirror.

const DEBUG_LOG_CAP = 2500;
export const debugLog = writable<ActivityLogEntry[]>([]);

if (browser) {
  loadDebugLog().then((saved) => {
    if (saved.length > 0) {
      debugLog.update((live) => {
        const seen = new Set(saved.map((e) => e.id));
        return [...saved, ...live.filter((e) => !seen.has(e.id))].slice(-DEBUG_LOG_CAP);
      });
    }
    debugLog.subscribe((log) => scheduleSaveDebugLog(log));
  });
}

/** Clear the diagnostic log in memory. */
export function clearDebugLog() {
  debugLog.set([]);
}

/** Append a lean structured diagnostic entry (the `simLog.logEvent` sink target). */
export function logDiag(e: LogEventInput): string {
  const entry: ActivityLogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    turn: e.turn,
    type: e.category,
    actor: 'system',
    action: e.message,
    result: '',
    severity: e.severity ?? 'info',
    details: e.data
  };
  debugLog.update((log) => {
    const next = [...log, entry];
    return next.length > DEBUG_LOG_CAP ? next.slice(-DEBUG_LOG_CAP) : next;
  });
  mirrorToFile(entry);
  return entry.id;
}

/** Merged chronicle + diagnostic view for the in-game debug tab (newest-trailing, capped). */
const TAB_RENDER = 1200;
export const allLogEntries = derived([activityLog, debugLog], ([$a, $d]) => {
  const merged = [...$a.slice(-TAB_RENDER), ...$d.slice(-TAB_RENDER)];
  merged.sort((x, y) => x.timestamp.getTime() - y.timestamp.getTime());
  return merged.slice(-TAB_RENDER);
});

// ── File mirror (agent fetch): batch new entries by category, debounced POST to /api/log ─────────
// Runs on the MAIN thread (the worker forwards log calls here per flush), so file I/O never touches
// the sim hot path / TPS. The agent greps the resulting `.debug/<category>.log` files after the fact.
interface MirrorLine {
  category: ActivityLogEntry['type'];
  line: string;
}
const _mirrorPending: MirrorLine[] = [];
let _mirrorTimer: ReturnType<typeof setTimeout> | null = null;

function mirrorToFile(entry: ActivityLogEntry): void {
  if (!browser || !import.meta.env.DEV) return; // /api/log is a no-op in prod — don't fire fetches
  const t = String(entry.turn).padStart(5, '0');
  const who = entry.actor && entry.actor !== 'system' ? ` <${entry.actor}>` : '';
  const tail = entry.result ? ` — ${entry.result}` : '';
  _mirrorPending.push({
    category: entry.type,
    line: `[T${t}] [${entry.severity}]${who} ${entry.action}${tail}`
  });
  if (_mirrorTimer === null) _mirrorTimer = setTimeout(flushMirror, 1000);
}

function flushMirror(): void {
  _mirrorTimer = null;
  if (_mirrorPending.length === 0) return;
  const entries = _mirrorPending.splice(0);
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
    keepalive: true
  }).catch(() => {
    /* dev-only mirror; never block the game on a failed write */
  });
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

function combatKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
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

function sessionSummary(s: CombatSession): {
  result: string;
  severity: ActivityLogEntry['severity'];
} {
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

/**
 * Finalize an engagement after a kill: close the session and emit a standalone
 * kill entry that stands out in the chronicle (severity=critical, its own line).
 */
export function logCombatKill(
  attackerId: string,
  attackerName: string,
  defenderId: string,
  defenderName: string,
  turn: number,
  focusX: number,
  focusY: number,
  weapon?: string
) {
  const key = combatKey(attackerId, defenderId);
  const session = combatSessions.get(key);
  if (session) {
    session.killed = true;
    session.closed = true;
    flushSession(session);
    combatSessions.delete(key);
  }

  const weaponStr = weapon ? ` with ${weapon}` : '';
  logActivity({
    turn,
    type: 'combat',
    actor: attackerId,
    action: `${attackerName} killed ${defenderName}`,
    target: defenderId,
    result: `Final blow${weaponStr}`,
    severity: 'critical',
    entityIds: [attackerId, defenderId],
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
