import type { Kingdom } from '../types';
import wildKingdomsData from '../../database/social/wild-kingdoms.json';

interface RawWildKingdom {
  id: string;
  name: string;
  relationBias: Kingdom['relationBias'];
  epithet: string;
  temperament: string;
  leaderName: string;
  capitalName: string;
}

export const WILD_KINGDOMS: Kingdom[] = (wildKingdomsData as RawWildKingdom[]).map((raw) => ({
  id: raw.id,
  name: raw.name,
  cultureMix: [],
  relationBias: raw.relationBias,
  wild: true,
  knowledge: 0,
  lore: {
    epithet: raw.epithet,
    temperament: raw.temperament,
    leaderName: raw.leaderName,
    wealthBand: 'destitute',
    capitalName: raw.capitalName,
    settlements: { towns: 0, villages: 0 },
    history: [],
    figures: [],
    famedItems: { created: [], held: [] }
  }
}));

const WILD_KINGDOM_IDS: Set<string> = new Set(WILD_KINGDOMS.map((k) => k.id));

export function isWildKingdomId(id: string): boolean {
  return WILD_KINGDOM_IDS.has(id);
}
