import type { GameState, Pawn, Mob, WorldTile, DroppedItem } from '../core/types';

export type EntitySync<T extends { id: string }> =
  | { full: T[] }
  | { upserts: Array<Partial<T> & { id: string }>; removed: string[]; order: string[] };

export interface SimCommand {
  type: string;
  payload?: unknown;
  save?: boolean;
}

export type MainToWorker =
  | { kind: 'init'; state: GameState; seed: number }
  | { kind: 'command'; cmd: SimCommand }
  | { kind: 'setSpeed'; speed: number }
  | { kind: 'setPaused'; paused: boolean }
  | { kind: 'requestSave' };

export interface SimLogEvent {
  m: string;
  a: unknown[];
}

export type WorkerToMain =
  | { kind: 'ready' }
  | {
      kind: 'snapshot';
      state: Partial<GameState>;
      pawns: EntitySync<Pawn>;
      mobs: EntitySync<Mob>;
      drops?: EntitySync<DroppedItem>;
      worldMap?: GameState['worldMap'];
      worldMapDelta?: Array<{ y: number; x: number; tile: Partial<WorldTile> }>;
      flush: boolean;
      commit?: boolean;
    }
  | { kind: 'fullState'; state: GameState }
  | { kind: 'simlog'; events: SimLogEvent[] }
  | { kind: 'error'; error: string };

export interface RenderSnapshot {
  turn: number;
  entityPositions: Float32Array;
  hud: unknown;
}
