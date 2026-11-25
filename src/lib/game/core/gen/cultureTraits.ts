import type { Trait } from '../types';
import type { Archetype } from '../defs/cultureLore';
import { culturalTraits, isMundaneRarity, traitId } from '../defs/traits';
import { createTraitBan } from '../rules/body/traitConflicts';
import { rng } from '../util/rng';

export function generateCultureTraitSets(archetype: Archetype): {
  guaranteed: Trait[];
  pool: Trait[];
} {
  const cultural = culturalTraits();
  const mundane = cultural.filter((t) => isMundaneRarity(t.rarity));
  const byRarity = (r: Trait['rarity']) => cultural.filter((t) => t.rarity === r);
  const rare = byRarity('rare');
  const epic = byRarity('epic');
  const mythic = byRarity('mythic');
  const legendary = byRarity('legendary');
  const themed = new Set(archetype.traits);
  const { banned, ban } = createTraitBan();
  const draw = (poolArr: Trait[]): Trait | null => {
    const weighted: Trait[] = [];
    for (const t of poolArr) {
      if (banned.has(traitId(t))) continue;
      weighted.push(t);
      if (t.id && themed.has(t.id)) weighted.push(t, t);
    }
    if (weighted.length === 0) return null;
    const t = rng.pick(weighted);
    ban(traitId(t));
    return t;
  };

  const guaranteed: Trait[] = [];
  const r = rng.random();
  if (legendary.length > 0 && r < 0.015) {
    const t = draw(legendary);
    if (t) guaranteed.push(t);
  } else if (mythic.length > 0 && r < 0.03) {
    const t = draw(mythic);
    if (t) guaranteed.push(t);
  } else if (epic.length > 0 && r < 0.06) {
    const t = draw(epic);
    if (t) guaranteed.push(t);
  } else if (rare.length > 0 && r < 0.15) {
    const t = draw(rare);
    if (t) guaranteed.push(t);
    if (rng.random() < 0.15) {
      const t2 = draw(rare);
      if (t2) guaranteed.push(t2);
    }
  }
  if (guaranteed.length === 0) {
    const t = draw(mundane);
    if (t) guaranteed.push(t);
  }

  const pool: Trait[] = [];
  const target = rng.int(3, 4);
  let guard = 0;
  while (pool.length < target && guard++ < 300) {
    const t = draw(mundane);
    if (!t) break;
    pool.push(t);
  }
  return { guaranteed, pool };
}
