import eventData from '../database/events.jsonc';

// ─────────────────────────────────────────────────────────────────────────────
// Two DIFFERENT things live in this file — do not conflate them:
//
//   1. The Chronicle log  (`ActivityLogEntry`, below) — a RECORD of what already
//      happened in the world: combat, weather shifts, season changes. The
//      in-game CHRONICLE panel reads this. It is purely descriptive.
//
//   2. The world-event system (`GameEvent`, below) — a planned feature that will
//      MAKE things happen: random encounters, opportunities, disasters with real
//      consequences. It is NOT implemented yet — only the type skeleton remains.
//
// A previous half-built EventSystem rolled `events.jsonc` entries every few ticks
// and dumped them straight into the Chronicle, which read as spam (they weren't
// real gameplay). That engine was removed; `events.jsonc` is intentionally empty.
// Build the real system here when the design is ready — keep its output OUT of the
// raw Chronicle unless an event genuinely produces a chronicle-worthy record.
// ─────────────────────────────────────────────────────────────────────────────

// ── World-event system — SKELETON (not yet implemented) ──────────────────────

export interface GameEvent {
  id: string;
  title: string;
  description: string;
  // Expand (category / severity / triggers / consequences) when the system is built.
}

export interface EventLog {
  id: string;
  eventId: string;
  turn: number;
  title: string;
  description: string;
  choiceMade?: string;
  outcome: string;
  timestamp: Date;
}

/** Event definitions — currently empty (see note above). */
export const EVENT_DATABASE = eventData as unknown as GameEvent[];

// ── Chronicle log ────────────────────────────────────────────────────────────

export interface CombatTurnEntry {
  turn: number;
  attackerName: string;
  defenderName: string;
  hit: boolean;
  damage?: number;
  injury?: string;
  knockdown?: boolean;
  crit?: boolean;
  /** Attack used this swing (weapon name / natural-weapon id, e.g. 'bite', 'kick'). */
  weapon?: string;
  bodyPart?: string;
  damageType?: string;
  partMaxHp?: number;
  partRemainingHp?: number;
  bleeding?: boolean;
  /** Wound this swing inflicted: kind (cut | fracture | puncture | crush | burn) + severity. */
  woundType?: string;
  woundSeverity?: 'minor' | 'serious' | 'critical' | 'destroyed';
}

export interface ActivityLogEntry {
  id: string;
  turn: number;
  timestamp: Date;
  type:
    | 'work'
    | 'building'
    | 'crafting'
    | 'event'
    | 'pawn_action'
    | 'research'
    | 'exploration'
    | 'system'
    | 'combat'
    | 'entity'
    // Living-world records surfaced in the Chronicle.
    | 'weather'
    | 'season'
    // Diagnostic categories (unified logging): low-volume always-on (job, perf) +
    // high-volume verbose traces (ai, needs) gated behind --debug/--profiler.
    | 'ai'
    | 'needs'
    | 'job'
    | 'perf';
  actor?: string; // Pawn ID or 'system'
  action: string;
  target?: string;
  location?: string;
  result: string;
  details?: Record<string, any>;
  severity: 'info' | 'success' | 'warning' | 'error' | 'critical';
  /** Entity IDs involved — used for click-to-jump on the map. */
  entityIds?: string[];
  /** Map coordinates for camera focus. */
  focusX?: number;
  focusY?: number;
  /** Per-turn combat breakdown — shown when expanding a combat log entry. */
  combatBreakdown?: CombatTurnEntry[];
}

/** Log categories = the `ActivityLogEntry.type` union — the single dimension the unified log
 *  pipeline routes/filters on (in-game tab + per-category `.debug/<category>.log` agent files). */
export type LogCategory = ActivityLogEntry['type'];
