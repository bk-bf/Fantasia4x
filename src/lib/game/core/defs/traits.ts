import type { Trait } from '../types';
import traitDbData from '../../database/pawns/traits.json';

export const TRAIT_DATABASE: Trait[] = traitDbData as unknown as Trait[];

export const culturalTraits = () =>
  TRAIT_DATABASE.filter((t) => (t.scope ?? 'cultural') === 'cultural');
export const personalTraits = () => TRAIT_DATABASE.filter((t) => t.scope === 'personal');
export const negativeTraits = () => TRAIT_DATABASE.filter((t) => t.rarity === 'negative');

export const traitId = (t: Trait) => t.id ?? t.name;
export const isMundaneRarity = (r: Trait['rarity']) =>
  (r ?? 'common') === 'common' || r === 'uncommon';
