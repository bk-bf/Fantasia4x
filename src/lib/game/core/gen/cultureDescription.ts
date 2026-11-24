import type { Culture, Trait } from '../types';
import { CULTURE_LORE } from '../defs/cultureLore';
import { isMundaneRarity } from '../defs/traits';
import {
  buildBucket,
  comparativeKey,
  gaitBucket,
  midpoint,
  sizeBucket,
  statBucket
} from '../rules/social/cultureBuckets';
import { rng } from '../util/rng';
import { capitalize } from '../util/text';

export function generateCultureDescription(culture: Culture): string {
  const P = CULTURE_LORE.phrases;
  const sr = culture.statRanges;
  const str = midpoint(sr.strength ?? [10, 10]);
  const dex = midpoint(sr.dexterity ?? [10, 10]);
  const con = midpoint(sr.constitution ?? [10, 10]);
  const int = midpoint(sr.intelligence ?? [10, 10]);
  const per = midpoint(sr.perception ?? [10, 10]);
  const cha = midpoint(sr.charisma ?? [10, 10]);

  const build = buildBucket(culture.physicalTraits);
  const sizeP = rng.pick(P.size[sizeBucket(culture.physicalTraits.size)]);
  const buildP = rng.pick(P.build[build]);
  const gaitP = rng.pick(P.gait[gaitBucket(dex, build)]);
  const compP = rng.pick(P.comparative[comparativeKey(str, dex, con)]);
  const s1 = `The ${culture.name}, ${culture.lore.epithet}, are ${sizeP}, ${buildP}, ${gaitP}, ${compP}.`;

  const mindP = rng.pick(P.mind[statBucket(int)]);
  const extras: string[] = [];
  if (per >= 12) extras.push(rng.pick(P.perception.high));
  else if (per < 9.5) extras.push(rng.pick(P.perception.low));
  if (cha >= 12) extras.push(rng.pick(P.charisma.high));
  else if (cha < 9.5) extras.push(rng.pick(P.charisma.low));
  const mindClause = [mindP, ...extras].join(', ');
  const s2 = `${capitalize(culture.lore.temperament)} by nature, ${mindClause}; they hold ${culture.lore.belief}.`;

  const s3 = `They are ${culture.lore.origin}, and make their home among ${culture.lore.homeland}.`;

  const cultureTraits = [...culture.guaranteedTraits, ...culture.culturalTraitPool];
  const vocCat = strongestWorkCategory(cultureTraits);
  const vocP = vocCat && P.vocation[vocCat] ? rng.pick(P.vocation[vocCat]) : null;
  const quirk = pickFlavorLine(cultureTraits);
  let s4 = '';
  if (vocP && quirk) {
    s4 = `${capitalize(vocP)}; ${rng.pick(P.quirkLeads).toLowerCase()} ${quirk}.`;
  } else if (vocP) {
    s4 = `${capitalize(vocP)}.`;
  } else if (quirk) {
    s4 = `${rng.pick(P.quirkLeads)} ${quirk}.`;
  }

  return [s1, s2, s3, s4].filter(Boolean).join(' ');
}

function strongestWorkCategory(traits: Trait[]): string | null {
  let best: string | null = null;
  let bestMul = 1.0;
  for (const t of traits) {
    for (const key of ['workSpeed', 'workYield', 'workQuality'] as const) {
      const map = t.effects[key];
      if (!map) continue;
      for (const [cat, mul] of Object.entries(map)) {
        if (cat === 'all') continue;
        if (mul > bestMul) {
          bestMul = mul;
          best = cat;
        }
      }
    }
  }
  return best;
}

function pickFlavorLine(traits: Trait[]): string | null {
  const withLine = traits.filter((t) => t.flavorLine);
  if (withLine.length === 0) return null;
  const special = withLine.filter(
    (t) =>
      !isMundaneRarity(t.rarity) ||
      t.effects.blunt_resistance != null ||
      t.effects.cutting_resistance != null ||
      t.effects.piercing_resistance != null ||
      t.effects.fireResistance != null ||
      t.effects.coldResistance != null ||
      t.effects.poisonResistance != null
  );
  return rng.pick(special.length > 0 ? special : withLine).flavorLine ?? null;
}
