import { describe, expect, it } from 'vitest';
import { generateCulture } from '$lib/game/core/gen/culture';
import { contentWords, pickDistinctPhrases } from '$lib/game/core/gen/freshPhrases';
import { rng } from '$lib/game/core/util/rng';
import loreData from '$lib/game/database/social/culture-lore.json';
import type { Culture } from '$lib/game/core/types';

const SEED_COUNT = 1000;
const QUIRK_LEADS = (loreData as unknown as { phrases: { quirkLeads: string[] } }).phrases
  .quirkLeads;

function escaped(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function phraseText(culture: Culture): string {
  const { lore } = culture;
  const flavorLines = [...culture.guaranteedTraits, ...culture.culturalTraitPool]
    .map((t) => t.flavorLine)
    .filter((line): line is string => !!line);
  const fixed = [
    culture.name,
    lore.epithet,
    lore.temperament,
    lore.belief,
    lore.origin,
    lore.homeland,
    ...flavorLines,
    ...QUIRK_LEADS,
    ' by nature, ',
    'they hold',
    'They are',
    ', and make their home among'
  ];
  return fixed.reduce((text, piece) => text.replace(escaped(piece), ' '), lore.description);
}

function repeatedWords(text: string): string[] {
  const seen = new Set<string>();
  const repeats = new Set<string>();
  for (const w of contentWords(text)) {
    if (seen.has(w)) repeats.add(w);
    seen.add(w);
  }
  return [...repeats];
}

describe('culture description wording', () => {
  it('seed 431 no longer says ponderous twice', () => {
    rng.reseed(431);
    const description = generateCulture().lore.description;
    expect(description.match(/ponderous/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it('never repeats a content word across the generated phrases', () => {
    const offenders: string[] = [];
    for (let seed = 0; seed < SEED_COUNT; seed++) {
      rng.reseed(seed);
      const culture = generateCulture();
      const repeats = repeatedWords(phraseText(culture));
      if (repeats.length > 0) offenders.push(`${seed}: ${repeats.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('skips an option that shares a word with a phrase already taken', () => {
    rng.reseed(1);
    for (let i = 0; i < 50; i++) {
      const [first, second] = pickDistinctPhrases(
        ['ponderous', 'fire'],
        [
          ['ponderous gait', 'swift gait'],
          ['ponderous stride', 'fire walker', 'steady stride']
        ]
      );
      expect(first).toBe('swift gait');
      expect(second).toBe('steady stride');
    }
  });

  it('still returns a phrase when every option repeats a word', () => {
    rng.reseed(1);
    const [only] = pickDistinctPhrases(['ponderous'], [['ponderous gait', 'ponderous stride']]);
    expect(only).toMatch(/^ponderous/);
  });
});
