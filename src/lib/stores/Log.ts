import { writable, derived, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { ActivityLogEntry, CombatTurnEntry } from '$lib/game/core/defs/events';
import type { LogEventInput } from '$lib/game/core/util/logSink';
import {
  loadActivityLog,
  scheduleSaveActivityLog,
  saveActivityLogNow,
  loadDebugLog,
  scheduleSaveDebugLog
} from './saveManager';

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

export function batchLogReplay(fn: () => void): void {
  activityLog.beginBatch();
  try {
    fn();
  } finally {
    activityLog.endBatch();
  }
}

if (browser) {
  loadActivityLog().then((saved) => {
    if (saved.length > 0) {
      activityLog.update((live) => {
        const seen = new Set(saved.map((e) => e.id));
        return [...saved, ...live.filter((e) => !seen.has(e.id))].slice(-1000);
      });
    }
    activityLog.subscribe((log) => scheduleSaveActivityLog(log));
  });
}

export async function reloadActivityLogForActiveSave(): Promise<void> {
  if (!browser) return;
  activityLog.set(await loadActivityLog());
}

export function clearActivityLog() {
  activityLog.set([]);
  saveActivityLogNow([]);
}

export const recentActivity = derived(activityLog, ($log) => $log.slice(-50).reverse());

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

export function logActivity(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): string {
  const fullEntry: ActivityLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date()
  };

  activityLog.update((log) => {
    const newLog = [...log, fullEntry];
    return newLog.slice(-1000);
  });

  mirrorToFile(fullEntry);
  return fullEntry.id;
}

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

export function clearDebugLog() {
  debugLog.set([]);
}

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

const TAB_RENDER = 1200;
export const allLogEntries = derived([activityLog, debugLog], ([$a, $d]) => {
  const merged = [...$a.slice(-TAB_RENDER), ...$d.slice(-TAB_RENDER)];
  merged.sort((x, y) => x.timestamp.getTime() - y.timestamp.getTime());
  return merged.slice(-TAB_RENDER);
});

interface MirrorLine {
  category: ActivityLogEntry['type'];
  line: string;
}
const _mirrorPending: MirrorLine[] = [];
let _mirrorTimer: ReturnType<typeof setTimeout> | null = null;

function mirrorToFile(entry: ActivityLogEntry): void {
  if (!browser || !import.meta.env.DEV) return;
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
  }).catch(() => {});
}

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

interface CombatSession {
  entryId: string;
  participants: Set<string>;
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

const combatSessions = new Map<string, CombatSession>();
const sessionByParticipant = new Map<string, string>();

const ENGAGEMENT_EXPIRE_TICKS = 300;

function sessionSummary(s: CombatSession): {
  result: string;
  severity: ActivityLogEntry['severity'];
} {
  const swings = s.hits + s.misses;
  let result = `${s.hits}/${swings} hits · ${s.totalDamage} dmg`;
  if (s.participants.size > 2) result = `${s.participants.size} fighters · ${result}`;
  if (s.killed) result += ' · killed';
  else if (s.closed) result += ' · disengaged';
  const severity: ActivityLogEntry['severity'] = s.killed ? 'critical' : 'warning';
  return { result, severity };
}

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

function addParticipant(s: CombatSession, id: string, name: string) {
  s.participants.add(id);
  s.names.set(id, name);
  sessionByParticipant.set(id, s.entryId);
}

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

export function __resetCombatSessions() {
  combatSessions.clear();
  sessionByParticipant.clear();
}

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

  session.participants.delete(defenderId);
  if (sessionByParticipant.get(defenderId) === session.entryId) {
    sessionByParticipant.delete(defenderId);
  }

  if (session.participants.size <= 1) closeSession(session, true);
  else flushSession(session, true);
}

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
