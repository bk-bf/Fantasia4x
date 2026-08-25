import type { ActivityLogEntry, CombatTurnEntry, LogCategory } from '../defs/events';

export interface LogEventInput {
  category: LogCategory;
  severity?: ActivityLogEntry['severity'];
  turn: number;
  message: string;
  data?: Record<string, unknown>;
}

export type CombatTextKind =
  | 'damage'
  | 'crit'
  | 'miss'
  | 'dodge'
  | 'bleed'
  | 'knockdown'
  | 'fracture'
  | 'condition'
  | 'social';

export interface CombatTextRequest {
  worldX: number;
  worldY: number;
  text: string;
  kind: CombatTextKind;
  color?: string;
  dy?: number;
}

export interface CombatLungeRequest {
  attackerId: string;
  dirX: number;
  dirY: number;
}

export interface CombatSoundRequest {
  sound: string;
  worldX: number;
  worldY: number;
}

export interface CombatProjectileRequest {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  effect: string;
}

export interface SimLogSink {
  logActivity(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): string;

  logEvent(e: LogEventInput): void;

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
  pushCombatText(req: CombatTextRequest): void;
  pushAttackLunge(req: CombatLungeRequest): void;
  pushCombatSound(req: CombatSoundRequest): void;
  pushProjectile(req: CombatProjectileRequest): void;

  logEntityDeath(
    entityId: string,
    entityName: string,
    cause: string,
    turn: number,
    focusX: number,
    focusY: number
  ): void;

  threatAlert(
    mobId: string,
    mobName: string,
    pawnName: string,
    turn: number,
    focusX: number,
    focusY: number
  ): void;

  vitalAlert(
    pawnId: string,
    pawnName: string,
    vital: 'malnutrition' | 'dehydration',
    stageLabel: string,
    turn: number,
    focusX: number,
    focusY: number
  ): void;

  pawnDeath(
    pawnId: string,
    pawnName: string,
    cause: string,
    turn: number,
    focusX: number,
    focusY: number
  ): void;
}

const noopSink: SimLogSink = {
  logActivity: () => '',
  logEvent: () => {},
  logCombatSwing: () => {},
  logCombatKill: () => {},
  pushCombatText: () => {},
  pushAttackLunge: () => {},
  pushCombatSound: () => {},
  pushProjectile: () => {},
  logEntityDeath: () => {},
  threatAlert: () => {},
  vitalAlert: () => {},
  pawnDeath: () => {}
};

export let simLog: SimLogSink = noopSink;

export function setSimLogSink(sink: SimLogSink): void {
  simLog = sink;
}

const BUILD_VERBOSE: boolean =
  import.meta.env.VITE_DEBUG_MODE === 'true' || import.meta.env.VITE_DEBUG_LOG === 'true';

export let LOG_VERBOSE: boolean = BUILD_VERBOSE;

export function setVerboseLogging(on: boolean): void {
  LOG_VERBOSE = on || BUILD_VERBOSE;
}

export function isVerboseLogging(): boolean {
  return LOG_VERBOSE;
}

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
