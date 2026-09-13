import type { WealthBand } from '../types';
import backgroundsData from '../../database/pawns/backgrounds.json';

export interface Background {
  id: string;
  slot?: 'childhood' | 'adulthood';
  title: string;
  description: string;
  weight?: number;
  founderWeight?: number;
  kingdomWealth?: WealthBand[];
  raider?: boolean;
  stateless?: boolean;
  opens?: string[];
  requires?: string[];
  knows?: string;
  traitAffinity?: string[];
  traitGuaranteed?: string[];
  experience?: Record<string, [number, number]>;
  prestige?: [number, number];
  homeKnowledge?: [number, number];
  worldliness?: number;
  worldKnowledge?: [number, number];
}

const DATA = backgroundsData as unknown as {
  childhoods: Background[];
  adulthoods: Background[];
};
export const CHILDHOODS: Background[] = DATA.childhoods.map((b) => ({ ...b, slot: 'childhood' }));
export const ADULTHOODS: Background[] = DATA.adulthoods.map((b) => ({ ...b, slot: 'adulthood' }));
const BY_ID = new Map<string, Background>([...CHILDHOODS, ...ADULTHOODS].map((b) => [b.id, b]));

export function getBackgroundById(id: string | undefined): Background | undefined {
  return id ? BY_ID.get(id) : undefined;
}
