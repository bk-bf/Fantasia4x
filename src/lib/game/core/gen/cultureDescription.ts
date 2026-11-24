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
import { capitalize } from '../util/text';
import { pickDistinctPhrases } from './freshPhrases';

const CORE_SLOTS = 5;

export function generateCultureDescription(culture: Culture): string {
  const P = CULTURE_LORE.phrases;
  const sr = culture.statRanges;
  const str = midpoint(sr.strength ?? [10, 10]);
  const dex = midpoint(sr.dexterity ?? [10, 10]);
  const con = midpoint(sr.constitution ?? [10, 10]);
  const int = midpoint(sr.intelligence ?? [10, 10]);
  const per = midpoint(sr.perception ?? [10, 10]);
  const cha = midpoint(sr.charisma ?? [10, 10]);
  const lore = culture.lore;

  const build = buildBucket(culture.physicalTraits);
  const cultureTraits = [...culture.guaranteedTraits, ...culture.culturalTraitPool];
  const vocCat = strongestWorkCategory(cultureTraits);
  const flavorOptions = flavorLineOptions(cultureTraits);

  const slots: (readonly string[])[] = [
    P.size[sizeBucket(culture.physicalTraits.size)],
    P.build[build],
    P.gait[gaitBucket(dex, build)],
    P.comparative[comparativeKey(str, dex, con)],
    P.mind[statBucket(int)]
  ];
  if (per >= 12) slots.push(P.perception.high);
  else if (per < 9.5) slots.push(P.perception.low);
  if (cha >= 12) slots.push(P.charisma.high);
  else if (cha < 9.5) slots.push(P.charisma.low);
  const extraCount = slots.length - CORE_SLOTS;
  const hasVocation = vocCat !== null && P.vocation[vocCat] !== undefined;
  if (hasVocation) slots.push(P.vocation[vocCat]);
  if (flavorOptions.length > 0) slots.push(flavorOptions, P.quirkLeads);

  const picked = pickDistinctPhrases(
    [culture.name, lore.epithet, lore.temperament, lore.belief, lore.origin, lore.homeland],
    slots
  );
  const [sizeP, buildP, gaitP, compP, mindP] = picked;
  const extras = picked.slice(CORE_SLOTS, CORE_SLOTS + extraCount);
  let next = CORE_SLOTS + extraCount;
  const vocP = hasVocation ? picked[next++] : null;
  const quirk = flavorOptions.length > 0 ? picked[next] : null;
  const lead = flavorOptions.length > 0 ? picked[next + 1] : null;

  const s1 = `The ${culture.name}, ${lore.epithet}, are ${sizeP}, ${buildP}, ${gaitP}, ${compP}.`;
  const mindClause = [mindP, ...extras].join(', ');
  const s2 = `${capitalize(lore.temperament)} by nature, ${mindClause}; they hold ${lore.belief}.`;
  const s3 = `They are ${lore.origin}, and make their home among ${lore.homeland}.`;

  let s4 = '';
  if (vocP && quirk && lead) {
    s4 = `${capitalize(vocP)}; ${lead.toLowerCase()} ${quirk}.`;
  } else if (vocP) {
    s4 = `${capitalize(vocP)}.`;
  } else if (quirk && lead) {
    s4 = `${lead} ${quirk}.`;
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

function flavorLineOptions(traits: Trait[]): string[] {
  const withLine = traits.filter((t) => t.flavorLine);
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
  return (special.length > 0 ? special : withLine).map((t) => t.flavorLine ?? '');
}
