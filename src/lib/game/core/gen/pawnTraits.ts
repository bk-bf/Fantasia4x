import type { Culture, Trait } from '../types';
import { TRAIT_DATABASE, negativeTraits, personalTraits, traitId } from '../defs/traits';
import { createTraitBan } from '../rules/body/traitConflicts';
import { pawnMeetsRequires, type PawnPhysique } from '../rules/body/traitRequirements';
import { rng } from '../util/rng';

const NEGATIVE_TRAIT_SIGMA = 1.25;
const MAX_NEGATIVE_TRAITS = 4;
const MAX_CULTURAL_TRAITS = 2;
const GATEWAY_SECOND_CHANCE = 0.05;

function rollNegativeCount(): number {
  return Math.max(
    0,
    Math.min(MAX_NEGATIVE_TRAITS, Math.round(Math.abs(rng.gaussian(0, NEGATIVE_TRAIT_SIGMA))))
  );
}

export function drawPawnTraits(
  culture: Culture,
  physique?: PawnPhysique,
  affinity?: { boost: Set<string>; guaranteed: string[] }
): Trait[] {
  const out: Trait[] = [];
  const { banned, ban } = createTraitBan();
  const fits = (t: Trait) => pawnMeetsRequires(t, physique);
  let culturalCount = 0;
  const isGateway = (t: Trait) => t.lineageExclusive === false && (t.awakens?.length ?? 0) > 0;
  let gatewayCount = 0;
  const takeCultural = (t: Trait): boolean => {
    if (culturalCount >= MAX_CULTURAL_TRAITS || banned.has(traitId(t)) || !fits(t)) return false;
    if (isGateway(t)) {
      if (gatewayCount >= 2) return false;
      if (gatewayCount === 1 && rng.random() >= GATEWAY_SECOND_CHANCE) return false;
      gatewayCount++;
    }
    ban(traitId(t));
    out.push(t);
    culturalCount++;
    return true;
  };

  for (const g of culture.guaranteedTraits) {
    if (culturalCount >= MAX_CULTURAL_TRAITS) break;
    if ((g.rarity === 'legendary' || g.rarity === 'mythic') && g.lineage?.length) {
      takeCultural(g);
      const lineageId = g.lineage[0];
      const pool = TRAIT_DATABASE.filter(
        (t) =>
          t.id !== g.id &&
          t.lineage?.includes(lineageId) &&
          (t.stage ?? 1) === 1 &&
          !banned.has(traitId(t)) &&
          fits(t)
      );
      while (culturalCount < MAX_CULTURAL_TRAITS && pool.length > 0) {
        if (takeCultural(pool.splice(rng.int(0, pool.length - 1), 1)[0])) break;
      }
    } else {
      takeCultural(g);
    }
  }
  {
    const bag = culture.culturalTraitPool.filter((t) => !banned.has(traitId(t)) && fits(t));
    while (culturalCount < MAX_CULTURAL_TRAITS && bag.length > 0) {
      takeCultural(bag.splice(rng.int(0, bag.length - 1), 1)[0]);
    }
  }

  if (affinity) {
    for (const id of affinity.guaranteed) {
      const t = TRAIT_DATABASE.find((x) => x.id === id);
      if (t && !banned.has(traitId(t)) && fits(t)) {
        ban(traitId(t));
        out.push(t);
      }
    }
  }

  const r = rng.random();
  const nPersonal = r < 0.2 ? 0 : r < 0.55 ? 1 : r < 0.85 ? 2 : 3;
  const pbag = personalTraits().filter(
    (t) => t.rarity !== 'negative' && !banned.has(traitId(t)) && fits(t)
  );
  const boost = affinity?.boost;
  const pickWeight = (t: Trait) => (boost?.has(traitId(t)) ? 5 : 1);
  let personalCount = 0;
  while (personalCount < nPersonal && pbag.length > 0) {
    const total = pbag.reduce((s, t) => s + pickWeight(t), 0);
    let roll = rng.random() * total;
    let idx = pbag.length - 1;
    for (let i = 0; i < pbag.length; i++) {
      roll -= pickWeight(pbag[i]);
      if (roll < 0) {
        idx = i;
        break;
      }
    }
    const t = pbag.splice(idx, 1)[0];
    if (banned.has(traitId(t))) continue;
    ban(traitId(t));
    out.push(t);
    personalCount++;
  }

  const nNeg = rollNegativeCount();
  const nbag = negativeTraits().filter((t) => !banned.has(traitId(t)) && fits(t));
  let negCount = 0;
  while (negCount < nNeg && nbag.length > 0) {
    const t = nbag.splice(rng.int(0, nbag.length - 1), 1)[0];
    if (banned.has(traitId(t))) continue;
    ban(traitId(t));
    out.push(t);
    negCount++;
  }
  return out;
}
