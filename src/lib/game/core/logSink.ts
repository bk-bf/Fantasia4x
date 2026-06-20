import type { ActivityLogEntry, CombatTurnEntry, LogCategory } from './Events';

/**
 * A lean structured log entry for the unified log pipeline (combat/work/event narrative still use
 * the richer `logActivity`). Routed by `category` to the in-game debug tab + `.debug/<category>.log`.
 */
export interface LogEventInput {
  category: LogCategory;
  severity?: ActivityLogEntry['severity'];
  turn: number;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * P-3: log/feedback sink for the simulation layer.
 *
 * Services and systems (Combat, EntityService, pawn state machine) emit chronicle entries and
 * floating combat text through this interface instead of importing the Svelte stores directly —
 * which would invert the layer direction (sim → stores) and tie headless sims/tests to the UI.
 * The store layer registers the real sink at startup (see `stores/simLogBridge.ts`); headless
 * runs keep the no-op default, so nothing logs unless a sink is wired in.
 */

/** Kind of floating combat label — mirrors the renderer's combat-feedback channel. */
export type CombatTextKind =
  | 'damage'
  | 'crit'
  | 'miss'
  | 'dodge'
  | 'bleed'
  | 'knockdown'
  // A data-driven condition-onset label (name from conditions.jsonc); colour comes via `color`.
  | 'condition';

/** A world-space floating-text request (tile coordinates, never pixels). */
export interface CombatTextRequest {
  worldX: number;
  worldY: number;
  text: string;
  kind: CombatTextKind;
  /** Explicit CSS colour (used by `kind: 'condition'`, whose colour is data-driven from
   *  conditions.jsonc rather than a fixed per-kind CSS class). Ignored by the fixed combat kinds. */
  color?: string;
  /** Extra vertical pixel offset applied on top of the tile→screen position. Lets a secondary
   *  cue (a bleed/knockdown label) stack BELOW the damage number that shares the same tile and
   *  spawn instant, instead of rising on top of it and hiding the number. */
  dy?: number;
}

/** A visual lunge request: nudge the attacker's glyph toward the struck tile and back. */
export interface CombatLungeRequest {
  attackerId: string;
  /** Unit direction toward the target (tile space). */
  dirX: number;
  dirY: number;
}

/** A ranged projectile to animate from shooter tile → target tile (visual only; the hit is already
 *  resolved hitscan). `effect` selects the particle style (from the ammo/weapon `projectile` field). */
export interface CombatProjectileRequest {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  effect: string; // 'arrow' | 'bolt' | 'stone' | 'spear'
}

export interface SimLogSink {
  /** Append a raw chronicle entry; returns the generated entry id. */
  logActivity(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): string;

  /** Append a lean structured diagnostic entry (perf/ai/needs/job/system) to the unified log. */
  logEvent(e: LogEventInput): void;

  // ----- combat (systems/Combat) -----
  logCombatSwing(
    attackerId: string,
    attackerName: string,
    defenderId: string,
    defenderName: string,
    turn: number,
    focusX: number,
    focusY: number,
    swing: CombatTurnEntry
  ): void;
  logCombatKill(
    attackerId: string,
    attackerName: string,
    defenderId: string,
    defenderName: string,
    turn: number,
    focusX: number,
    focusY: number,
    weapon?: string
  ): void;
  /** Push a floating combat label for the renderer. */
  pushCombatText(req: CombatTextRequest): void;
  /** Push an attacker-glyph lunge for the renderer (visual only). */
  pushAttackLunge(req: CombatLungeRequest): void;
  /** Push a ranged projectile to animate shooter→target (visual only). */
  pushProjectile(req: CombatProjectileRequest): void;

  // ----- entities (services/EntityService) -----
  logEntityDeath(
    entityId: string,
    entityName: string,
    cause: string,
    turn: number,
    focusX: number,
    focusY: number
  ): void;
}

/** Default no-op sink: a headless sim (and the test suite) logs nothing until a real sink is set. */
const noopSink: SimLogSink = {
  logActivity: () => '',
  logEvent: () => {},
  logCombatSwing: () => {},
  logCombatKill: () => {},
  pushCombatText: () => {},
  pushAttackLunge: () => {},
  pushProjectile: () => {},
  logEntityDeath: () => {}
};

/**
 * The active sink. Exported as a live binding so call sites read the current value each time —
 * imports captured before `setSimLogSink` runs still resolve to the registered sink at call time.
 */
export let simLog: SimLogSink = noopSink;

/** Register the real sink (called once from the store layer at startup). */
export function setSimLogSink(sink: SimLogSink): void {
  simLog = sink;
}

/**
 * Verbose-logging gate. High-volume per-tick traces (per-pawn needs/AI decisions, entity snapshots)
 * are emitted ONLY under `--debug` (VITE_DEBUG_MODE) or the standalone `--log` (VITE_DEBUG_LOG) flag,
 * which also surfaces the in-game DEBUG log tab. In a normal run — and crucially under `--profiler`
 * (which enables neither) — they cost nothing: `vlog` returns before building the message, so the sim
 * profiles clean and there's no firehose. To watch the log during a profiler/electron run, opt in
 * explicitly with `--log`. Light perf logging (the 1 Hz TPS sampler) is separate and always on.
 */
export const LOG_VERBOSE: boolean =
  import.meta.env.VITE_DEBUG_MODE === 'true' || import.meta.env.VITE_DEBUG_LOG === 'true';

/**
 * Gated verbose log. No-op (and the message thunk is never invoked) unless `LOG_VERBOSE`. Pass a
 * thunk for hot-path callers so the string is only built when verbose logging is actually on.
 */
export function vlog(
  category: LogCategory,
  turn: number,
  message: string | (() => string),
  severity: ActivityLogEntry['severity'] = 'info'
): void {
  if (!LOG_VERBOSE) return;
  simLog.logEvent({
    category,
    severity,
    turn,
    message: typeof message === 'function' ? message() : message
  });
}
