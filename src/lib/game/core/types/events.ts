import type { Pawn } from './entities';

export interface MigrantWaveEvent {
  kind: 'migrant-wave';
  id: string;
  turn: number;
  candidates: Pawn[];
}

export interface KingdomArrivalEvent {
  kind: 'kingdom-arrival';
  id: string;
  turn: number;
  kingdomId: string;
  partyKind: 'visitor' | 'caravan';
  partyId: string;
}

export type PendingEvent = MigrantWaveEvent | KingdomArrivalEvent;
