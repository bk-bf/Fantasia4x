// Kingdom types (KINGDOMS-TRADE). A Kingdom is a political group generated downstream from the
// culture pool — a weighted blend of cultures on a mono→multi-cultural spectrum. The colony learns
// about kingdoms gradually: hidden `knowledge` xp unlocks `KingdomLore` in tiers, and the mutable
// facets (leader, wealth, famed items) drift at runtime so learned knowledge can go stale.

/** One culture's share of a kingdom's make-up. Weights sum to 1; one dominant → mono-cultural. */
export interface KingdomCultureShare {
  cultureId: string;
  weight: number;
}

/** Wealth bands — drive caravan gear rungs, goods tiers, and settlement counts. */
export type WealthBand = 'destitute' | 'modest' | 'prosperous' | 'wealthy' | 'opulent';

/** Items a kingdom is famed for — forged by them, or once-held / now-held treasures. */
export interface KingdomFamedItems {
  created: string[];
  held: string[];
}

/**
 * A kingdom's full lore sheet. Everything is generated up front; the hidden knowledge level
 * gates what the UI reveals (tier in trailing comment). Leader, wealth band, and famed items
 * are the MUTABLE facets — they drift at runtime (KingdomService).
 */
export interface KingdomLore {
  epithet: string; // tier 0
  temperament: string; // tier 0
  leaderName: string; // tier 1 (mutable)
  wealthBand: WealthBand; // tier 1 (mutable)
  capitalName: string; // tier 2
  settlements: { towns: number; villages: number }; // tier 2
  history: string[]; // tier 3
  figures: string[]; // tier 3
  famedItems: KingdomFamedItems; // tier 4 (mutable)
}

/**
 * The mutable facets as the colony LAST LEARNED them. Refreshed on contact (visit/trade); when the
 * live lore drifts afterwards, the UI keeps rendering this snapshot — greyed "as last you knew"
 * once contact is older than ~a month. Immutable tiers read the live lore directly (they don't rot).
 */
export interface KingdomKnownFacets {
  leaderName: string;
  wealthBand: WealthBand;
  famedItems: KingdomFamedItems;
  /** Turn the snapshot was last refreshed by contact. */
  asOfTurn: number;
}

export interface Kingdom {
  id: string;
  name: string;
  /** Weighted culture composition — 1 dominant → many even = mono → multi-cultural. */
  cultureMix: KingdomCultureShare[];
  /** Raider kingdoms override the derived relation graph to always-hostile (never trade). */
  relationBias: 'always_hostile' | 'derived';
  lore: KingdomLore;
  /** Hidden xp the colony has accrued about this kingdom; gates lore tiers. */
  knowledge: number;
  /** First contact made — gates the Kingdoms tab listing (pokédex pattern). */
  discovered?: boolean;
  /** How this kingdom first became known (attribution): the name of the colonist who remembered it
   *  from their homeland/travels, or undefined for a kingdom met through a visitor/caravan. */
  knownVia?: string;
  /** Snapshot of the mutable facets as last learned (staleness rendering). */
  known?: KingdomKnownFacets;
  /** Turn of the last friendly contact (visitor/caravan/trade) — staleness clock. */
  lastContactTurn?: number;
}

/** Reserved participant id for the player colony in the kingdom relation graph. */
export const COLONY_RELATION_ID = 'colony';

/** One line of a caravan's wares (or of the colony's offer). Quality is an ItemQuality tier
 *  (0–5); undefined = standard. */
export interface CaravanGood {
  itemId: string;
  qty: number;
  quality?: number;
}

/**
 * A visiting party from a kingdom, live on the map (KINGDOMS-TRADE §3). Members are Mobs
 * carrying `kingdomId`/`partyId`; the party record tracks lifecycle + the caravan's wares.
 */
export interface KingdomParty {
  id: string;
  kingdomId: string;
  kind: 'visitor' | 'caravan';
  /** Mob ids of the party members (trader/guards/visitors/pack beasts). */
  mobIds: string[];
  /** The trader/royal lead — the barter interaction target (carries the "?" marker). */
  traderMobId?: string;
  arrivedTurn: number;
  /** Turn the party packs up and leaves the map. */
  departTurn: number;
  /** Caravan wares (empty for visitor parties). Mutated by completed trades. */
  stock: CaravanGood[];
  /** Gold bars the caravan carries to settle lopsided trades. */
  gold: number;
}

/** Symmetric kingdom↔kingdom (and colony↔kingdom, via COLONY_RELATION_ID) relation. */
export interface KingdomRelation {
  a: string; // kingdom id or COLONY_RELATION_ID
  b: string; // kingdom id
  score: number; // -100 (hostile) .. +100 (allied), symmetric
  disposition: 'allied' | 'friendly' | 'neutral' | 'wary' | 'hostile';
}
