import type { ActivityLogEntry, CombatTurnEntry } from './Events';

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
export type CombatTextKind = 'damage' | 'crit' | 'miss' | 'dodge' | 'bleed' | 'knockdown';

/** A world-space floating-text request (tile coordinates, never pixels). */
export interface CombatTextRequest {
  worldX: number;
  worldY: number;
  text: string;
  kind: CombatTextKind;
}

export interface SimLogSink {
  /** Append a raw chronicle entry; returns the generated entry id. */
  logActivity(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): string;

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

  // ----- entities (services/EntityService) -----
  logHuntStart(
    hunterId: string,
    hunterName: string,
    preyId: string,
    preyName: string,
    turn: number,
    focusX: number,
    focusY: number
  ): void;
  logFlee(
    entityId: string,
    entityName: string,
    threatId: string | undefined,
    threatName: string | undefined,
    turn: number,
    focusX: number,
    focusY: number
  ): void;
  logEntityDeath(
    entityId: string,
    entityName: string,
    cause: string,
    turn: number,
    focusX: number,
    focusY: number
  ): void;
  logEntityStateChange(
    entityId: string,
    entityName: string,
    fromState: string,
    toState: string,
    turn: number,
    focusX: number,
    focusY: number
  ): void;
}

/** Default no-op sink: a headless sim (and the test suite) logs nothing until a real sink is set. */
const noopSink: SimLogSink = {
  logActivity: () => '',
  logCombatSwing: () => {},
  logCombatKill: () => {},
  pushCombatText: () => {},
  logHuntStart: () => {},
  logFlee: () => {},
  logEntityDeath: () => {},
  logEntityStateChange: () => {}
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
