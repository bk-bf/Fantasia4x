export interface GameEvent {
  id: string;
  title: string;
  description: string;
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

export const EVENT_DATABASE: GameEvent[] = [];

export interface CombatTurnEntry {
  turn: number;
  attackerName: string;
  defenderName: string;
  hit: boolean;
  damage?: number;
  injury?: string;
  knockdown?: boolean;
  crit?: boolean;
  weapon?: string;
  bodyPart?: string;
  damageType?: string;
  partMaxHp?: number;
  partRemainingHp?: number;
  bleeding?: boolean;
  woundType?: string;
  woundSeverity?: 'minor' | 'serious' | 'critical' | 'destroyed';
  fatal?: boolean;
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
    | 'social'
    | 'weather'
    | 'season'
    | 'ai'
    | 'needs'
    | 'job'
    | 'item'
    | 'perf';
  actor?: string;
  action: string;
  target?: string;
  location?: string;
  result: string;
  details?: Record<string, any>;
  severity: 'info' | 'success' | 'warning' | 'error' | 'critical';
  entityIds?: string[];
  focusX?: number;
  focusY?: number;
  combatBreakdown?: CombatTurnEntry[];
  pulse?: boolean;
}

export type LogCategory = ActivityLogEntry['type'];
