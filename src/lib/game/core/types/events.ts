// World-event types (the migrant-wave feature is the first consumer).
//
// A *pending event* is a world event that has fired and now awaits a player decision. The sim
// (worker-authoritative) raises one by setting `GameState.pendingEvent`; the UI's EventModalHost
// dispatches on `kind` to the right modal; a resolution command (e.g. `commitMigrants`) clears it.
// This is a thin, reusable seam — future events (raids, disasters, trade caravans…) add a new `kind`
// to the union + a body component + a resolution command, without touching the transport.
//
// NOT to be confused with the descriptive Chronicle log (`ActivityLogEntry` in core/Events.ts), which
// only RECORDS what happened.

import type { Pawn } from './entities';

/**
 * Migrant wave: a handful of hopefuls (rolled at a season boundary, count weighted by how developed
 * the colony is) seeking to join. Each candidate is a fully-rolled `Pawn` — generation is
 * sim-authoritative, so accepting one just moves it into the colony. The player accepts or rejects
 * each individually; nothing joins until confirmed.
 */
export interface MigrantWaveEvent {
  kind: 'migrant-wave';
  id: string;
  /** Sim turn the wave fired on. */
  turn: number;
  candidates: Pawn[];
}

/**
 * KINGDOMS-TRADE §3: a kingdom's party (friendly visitors, or a trade caravan) has arrived on the
 * map. The party is already spawned when this fires — the modal announces who came; resolution just
 * acknowledges (trading itself is player-initiated later, via the trader's right-click Trade verb).
 */
export interface KingdomArrivalEvent {
  kind: 'kingdom-arrival';
  id: string;
  /** Sim turn the party arrived on. */
  turn: number;
  kingdomId: string;
  partyKind: 'visitor' | 'caravan';
  /** The spawned party (GameState.kingdomParties) this event announces. */
  partyId: string;
}

/** A world event awaiting a player decision. Discriminated by `kind`. */
export type PendingEvent = MigrantWaveEvent | KingdomArrivalEvent;
