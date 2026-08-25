export interface KingdomCultureShare {
  cultureId: string;
  weight: number;
}

export type WealthBand = 'destitute' | 'modest' | 'prosperous' | 'wealthy' | 'opulent';

export interface KingdomFamedItems {
  created: string[];
  held: string[];
}

export interface KingdomLore {
  epithet: string;
  temperament: string;
  leaderName: string;
  wealthBand: WealthBand;
  capitalName: string;
  settlements: { towns: number; villages: number };
  history: string[];
  figures: string[];
  famedItems: KingdomFamedItems;
}

export interface KingdomKnownFacets {
  leaderName: string;
  wealthBand: WealthBand;
  famedItems: KingdomFamedItems;
  asOfTurn: number;
}

export interface Kingdom {
  id: string;
  name: string;
  cultureMix: KingdomCultureShare[];
  relationBias: 'always_hostile' | 'derived';
  lore: KingdomLore;
  knowledge: number;
  discovered?: boolean;
  knownVia?: string;
  known?: KingdomKnownFacets;
  lastContactTurn?: number;
}

export const COLONY_RELATION_ID = 'colony';

export interface CaravanGood {
  itemId: string;
  qty: number;
  quality?: number;
}

export interface KingdomParty {
  id: string;
  kingdomId: string;
  kind: 'visitor' | 'caravan';
  mobIds: string[];
  traderMobId?: string;
  arrivedTurn: number;
  departTurn: number;
  stock: CaravanGood[];
  gold: number;
  kinVisitorId?: string;
}

export interface KingdomRelation {
  a: string;
  b: string;
  score: number;
  disposition: 'allied' | 'friendly' | 'neutral' | 'wary' | 'hostile';
}
