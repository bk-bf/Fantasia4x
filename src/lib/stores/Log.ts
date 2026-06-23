import { writable, derived, type Writable } from 'svelte/store';
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

/**
 * A writable that can COALESCE notifications. A combat flood replays dozens of swing/kill events in
 * one synchronous burst (the worker batches `simlog` and the bridge replays them in a tight loop);
 * each one mutated this store, and every mutation re-ran ALL derived chronicle views (the
 * `allLogEntries` O(n log n) sort over ≤2400 entries, the per-type filters) plus every subscribed
 * panel — N× per frame, which is the engagement-start FPS dip. Wrapping the replay in
 * `beginBatch()`/`endBatch()` defers subscriber notification to a SINGLE fire at the end, so the
 * derived recompute + re-render happens once per batch. Outside a batch it behaves like a plain
 * writable (each set/update notifies immediately — the test path + non-combat callers are unchanged).
 */
interface BatchableStore<T> extends Writable<T> {
  beginBatch(): void;
  endBatch(): void;
}
function batchable<T>(initial: T): BatchableStore<T> {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  let depth = 0;
  let dirty = false;
  const fire = () => {
    for (const s of subs) s(value);
  };
  const notify = () => {
    if (depth > 0) dirty = true;
    else fire();
  };
  return {
    subscribe(run: (v: T) => void) {
      subs.add(run);
      run(value);
      return () => subs.delete(run);
    },
    set(v: T) {
      value = v;
      notify();
    },
    update(fn: (v: T) => T) {
      value = fn(value);
      notify();
    },
    beginBatch() {
      depth++;
    },
    endBatch() {
      if (depth > 0 && --depth === 0 && dirty) {
        dirty = false;
        fire();
      }
    }
  };
}

export const activityLog = batchable<ActivityLogEntry[]>([]);

/** Run `fn` with chronicle notifications coalesced into a single fire afterwards (see `batchable`).
 *  Used to wrap the per-batch `simlog` replay so a combat flood re-renders the chronicle ONCE. */
export function batchLogReplay(fn: () => void): void {
  activityLog.beginBatch();
  try {
    fn();
  } finally {
    activityLog.endBatch();
  }
}

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

/**
 * Reload the chronicle for the now-active save — called by the boot once a save is chosen (the module-init
 * load above runs on the menu, before any active save id is set). For a fresh colony there's no log under
 * the new id, so this resets the store to [], so each save shows its own chronicle rather than a prior one.
 */
export async function reloadActivityLogForActiveSave(): Promise<void> {
  if (!browser) return;
  activityLog.set(await loadActivityLog());
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

// ── Engagement-scoped combat sessions ────────────────────────────────────────
//
// One Chronicle entry per *engagement* — a cluster of combatants fighting each
// other, NOT a fixed attacker/defender pair. Every hit/miss appends a
// CombatTurnEntry to that entry's breakdown and refreshes its summary in place,
// so a 40-swing brawl reads as a single expandable line instead of 40 lines.
//
// Why a cluster, not a pair: in a real fight A swings at B *and* B swings back,
// and other pawns/mobs pile onto the same melee. Keying by an unordered pair
// still split those into separate rows ("A engaged B" + "C engaged B" + …). We
// instead grow ONE session that owns every participant: any swing whose attacker
// OR defender is already in an open session joins that session (transitively
// merging everyone in the same brawl); the swing's own attacker→defender
// direction is preserved in the nested breakdown.
//
// A session stays open across brief disengage/re-engage flickers; it only closes
// when it empties out (all but one combatant dead/gone) or after
// ENGAGEMENT_EXPIRE_TICKS of no activity (lazily, on the next event touching a
// participant). This is what kills the re-engagement / reciprocal log spam.

interface CombatSession {
  entryId: string;
  /** Every entity currently in this brawl (both sides). */
  participants: Set<string>;
  /** id → display name, for the summary line. */
  names: Map<string, string>;
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

/** entryId → session. */
const combatSessions = new Map<string, CombatSession>();
/** participantId → entryId, so a swing finds the brawl its combatants are already in. */
const sessionByParticipant = new Map<string, string>();

/** Ticks of silence before an engagement is considered over (≈5s at 60 TPS). */
const ENGAGEMENT_EXPIRE_TICKS = 300;

function sessionSummary(s: CombatSession): {
  result: string;
  severity: ActivityLogEntry['severity'];
} {
  const swings = s.hits + s.misses;
  let result = `${s.hits}/${swings} hits · ${s.totalDamage} dmg`;
  // A multi-combatant melee announces its scale up front.
  if (s.participants.size > 2) result = `${s.participants.size} fighters · ${result}`;
  if (s.killed) result += ' · killed';
  else if (s.closed) result += ' · disengaged';
  const severity: ActivityLogEntry['severity'] = s.killed ? 'critical' : 'warning';
  return { result, severity };
}

/**
 * Rewrite the session's Chronicle entry in place (immutably → reactivity fires).
 * Called once per resolved swing — cheap because swings are gated by attack cadence
 * (~every 30 ticks per attacker), not emitted every sim tick.
 *
 * `bump` (set on a kill) lifts the entry to the newest slot of the log and restamps
 * its turn/timestamp to the concluding moment, so the freshly-resolved engagement
 * jumps to the top of the chronicle instead of staying buried where it began.
 */
function flushSession(s: CombatSession, bump = false) {
  const { result, severity } = sessionSummary(s);
  const breakdownCopy = [...s.breakdown];
  const ids = [...s.participants];
  activityLog.update((log) => {
    const idx = log.findIndex((e) => e.id === s.entryId);
    if (idx === -1) return log;
    const updated: ActivityLogEntry = {
      ...log[idx],
      result,
      severity,
      combatBreakdown: breakdownCopy,
      entityIds: ids
    };
    if (!bump) {
      const next = log.slice();
      next[idx] = updated;
      return next;
    }
    updated.turn = s.lastActivityTurn;
    updated.timestamp = new Date();
    return [...log.slice(0, idx), ...log.slice(idx + 1), updated];
  });
}

/** Close a session: mark it done, flush once, and drop all its bookkeeping. */
function closeSession(s: CombatSession, bump = false) {
  if (!s.closed) {
    s.closed = true;
    flushSession(s, bump);
  }
  combatSessions.delete(s.entryId);
  for (const pid of s.participants) {
    if (sessionByParticipant.get(pid) === s.entryId) sessionByParticipant.delete(pid);
  }
}

/** Add a combatant to an open brawl (idempotent); always refreshes the display name. */
function addParticipant(s: CombatSession, id: string, name: string) {
  s.participants.add(id);
  s.names.set(id, name);
  sessionByParticipant.set(id, s.entryId);
}

/**
 * Find the open engagement either combatant already belongs to, closing it out
 * first if it has gone stale (so a re-engagement after a long lull starts fresh).
 */
function findActiveSession(turn: number, a: string, b: string): CombatSession | undefined {
  for (const id of [a, b]) {
    const entryId = sessionByParticipant.get(id);
    if (!entryId) continue;
    const s = combatSessions.get(entryId);
    if (!s) {
      sessionByParticipant.delete(id);
      continue;
    }
    if (s.closed || turn - s.lastActivityTurn > ENGAGEMENT_EXPIRE_TICKS) {
      closeSession(s);
      continue;
    }
    return s;
  }
  return undefined;
}

/** Test-only: clear in-flight engagement sessions so module state doesn't leak. */
export function __resetCombatSessions() {
  combatSessions.clear();
  sessionByParticipant.clear();
}

/**
 * Record one resolved combat swing (hit OR miss) between an attacker and defender.
 * Opens the engagement entry lazily on the first swing of a brawl; thereafter every
 * swing touching any current combatant accretes onto that same entry.
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
  let session = findActiveSession(turn, attackerId, defenderId);

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
      participants: new Set(),
      names: new Map(),
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
    combatSessions.set(entryId, session);
  }

  // Register both combatants (the defender or a late joiner may be new to the brawl).
  addParticipant(session, attackerId, attackerName);
  addParticipant(session, defenderId, defenderName);

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

/** Flag the killing swing inside the session breakdown so the fatal blow stands out
 *  in the nested sub-log. The killing hit was just pushed by `logCombatSwing`, so the
 *  most recent landed swing against the slain combatant is the one. */
function markFatalBlow(s: CombatSession, defenderName: string, weapon?: string) {
  for (let i = s.breakdown.length - 1; i >= 0; i--) {
    const sw = s.breakdown[i];
    if (sw.hit && sw.defenderName === defenderName) {
      sw.fatal = true;
      if (weapon && !sw.weapon) sw.weapon = weapon;
      return;
    }
  }
}

/**
 * Fold a kill into its engagement entry: flag the killing swing in the breakdown,
 * mark the slain combatant out of the brawl, and bump the (now `· killed`) engagement
 * line to the TOP of the chronicle — no standalone "killed" row. The engagement entry
 * itself stays open so surviving fighters keep accreting onto it; it only closes once
 * the brawl has emptied out (≤1 combatant left).
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
  const session = findActiveSession(turn, attackerId, defenderId);

  // Fallback: a kill with no tracked engagement (shouldn't happen via Combat.ts, which
  // always logs the killing swing first) — emit a standalone entry so it isn't lost.
  if (!session) {
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
    return;
  }

  session.killed = true;
  session.lastActivityTurn = turn;
  markFatalBlow(session, defenderName, weapon);

  // The slain combatant is done fighting — drop them from the live brawl.
  session.participants.delete(defenderId);
  if (sessionByParticipant.get(defenderId) === session.entryId) {
    sessionByParticipant.delete(defenderId);
  }

  // Bump the folded engagement line to the top of the chronicle either way.
  if (session.participants.size <= 1) closeSession(session, true);
  else flushSession(session, true);
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
