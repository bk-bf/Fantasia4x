import type { Race, RacialTrait, RaceLore, RaceRelation } from './types';
import raceDbData from '../database/racial-traits.jsonc';
import loreData from '../database/race-lore.jsonc';
import { rng } from './rng';
import { clamp } from './math';

export const RACIAL_TRAIT_DATABASE: RacialTrait[] = raceDbData as unknown as RacialTrait[];

type Size = Race['physicalTraits']['size'];

interface Archetype {
  name: string;
  statFocus: string[];
  statDump: string[];
  sizeBias: Size[];
  traits: string[]; // trait ids that fit thematically
  epithets: string[];
  origins: string[];
  homelands: string[];
  temperaments: string[];
  beliefs: string[];
}

const LORE = loreData as unknown as {
  archetypes: Archetype[];
  phrases: {
    size: Record<string, string[]>;
    build: Record<string, string[]>;
    gait: Record<string, string[]>;
    comparative: Record<string, string[]>;
    mind: Record<string, string[]>;
    perception: { high: string[]; low: string[] };
    charisma: { high: string[]; low: string[] };
    vocation: Record<string, string[]>;
    quirkLeads: string[];
  };
};

const STATS = ['strength', 'dexterity', 'intelligence', 'perception', 'charisma', 'constitution'];

// Trait ids that may not co-occur on one race (mutually exclusive flavour).
const CONFLICT_GROUPS: string[][] = [
  ['flame-touched', 'frost-born'],
  ['hive-mind', 'loner'],
  ['nocturnal', 'photosynthetic'],
  ['ancient', 'berserker-blood']
];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Generate one procedural race biased toward a (random or given) archetype. */
export function generateRace(archetype: Archetype = rng.pick(LORE.archetypes)): Race {
  const statRanges = generateStatRanges(archetype);
  const physicalTraits = generatePhysicalTraits(archetype);
  const racialTraits = generateRacialTraits(archetype);

  const lore: RaceLore = {
    ...generateLoreFields(archetype),
    description: '' // filled below once the full race is assembled
  };

  const race: Race = {
    id: slugify(generateRaceName()),
    name: '', // set together with id below for uniqueness
    archetype: archetype.name,
    statRanges,
    physicalTraits,
    racialTraits,
    lore,
    population: 0
  };
  // name == capitalised id stem; keep them in sync so the slug is derivable from the name.
  race.name = cap(race.id.split('-')[0]);
  race.lore.description = generateRaceDescription(race);
  return race;
}

/** Preroll a pool of 15–25 distinct races (the known-races pokédex backing store). */
export function generateRacePool(count = rng.int(15, 25)): Race[] {
  const pool: Race[] = [];
  const usedIds = new Set<string>();
  let guard = 0;
  while (pool.length < count && guard < count * 20) {
    guard++;
    const race = generateRace();
    if (usedIds.has(race.id)) continue;
    usedIds.add(race.id);
    pool.push(race);
  }
  return pool;
}

/** Stub procedural inter-race relations — symmetric, data + pokédex display only (no mood
 *  wiring this pass). Same-archetype pairs skew friendly; the rest are mild noise. */
export function generateRaceRelations(pool: Race[]): RaceRelation[] {
  const relations: RaceRelation[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      const kinship = a.archetype === b.archetype ? 35 : 0; // shared origin → warmer
      const score = clamp(Math.round(rng.range(-70, 70) + kinship), -100, 100);
      relations.push({ a: a.id, b: b.id, score, disposition: dispositionFor(score) });
    }
  }
  return relations;
}

function dispositionFor(score: number): RaceRelation['disposition'] {
  if (score >= 60) return 'allied';
  if (score >= 20) return 'friendly';
  if (score > -20) return 'neutral';
  if (score > -60) return 'wary';
  return 'hostile';
}

// ─── Stats / physique ────────────────────────────────────────────────────────

function generateStatRanges(archetype: Archetype): Record<string, [number, number]> {
  const ranges: Record<string, [number, number]> = {};
  for (const stat of STATS) {
    let min = rng.int(8, 10);
    let max = rng.int(12, 15);
    if (archetype.statFocus.includes(stat)) {
      min += rng.int(2, 3);
      max += rng.int(2, 4);
    } else if (archetype.statDump.includes(stat)) {
      min = Math.max(5, min - rng.int(2, 3));
      max = Math.max(9, max - rng.int(2, 3));
    } else if (rng.random() < 0.25) {
      // mild incidental specialisation on a non-themed stat
      const shift = rng.random() < 0.5 ? 2 : -2;
      min = Math.max(5, min + shift);
      max = Math.max(min + 2, max + shift);
    }
    ranges[stat] = [min, max];
  }
  return ranges;
}

const SIZE_BOX: Record<Size, { height: [number, number]; weight: [number, number] }> = {
  tiny: { height: [80, 120], weight: [25, 45] },
  small: { height: [120, 150], weight: [45, 70] },
  medium: { height: [150, 190], weight: [60, 100] },
  large: { height: [190, 230], weight: [100, 160] },
  huge: { height: [230, 280], weight: [160, 250] }
};

/**
 * Size category for an actual height (cm). Size is a *description* of height, so a pawn's category
 * follows its real height — a 200 cm pawn reads `large`, regardless of its race's nominal size box
 * (the per-pawn height roll can land outside that box). Thresholds are the SIZE_BOX upper bounds.
 */
export function sizeFromHeight(cm: number): Size {
  if (cm < 120) return 'tiny';
  if (cm < 150) return 'small';
  if (cm < 190) return 'medium';
  if (cm < 230) return 'large';
  return 'huge';
}

function generatePhysicalTraits(archetype: Archetype): Race['physicalTraits'] {
  const sizes: Size[] = ['tiny', 'small', 'medium', 'large', 'huge'];
  // 75% honour the archetype's size bias, else fully random for variety.
  const size =
    rng.random() < 0.75 && archetype.sizeBias.length > 0
      ? rng.pick(archetype.sizeBias)
      : rng.pick(sizes);

  const box = SIZE_BOX[size];
  const hVar = rng.int(15, 35);
  const wVar = rng.int(10, 30);
  return {
    heightRange: [box.height[0] + rng.int(0, hVar), box.height[1] + rng.int(0, hVar)],
    weightRange: [box.weight[0] + rng.int(0, wVar), box.weight[1] + rng.int(0, wVar)],
    size
  };
}

// ─── Traits ──────────────────────────────────────────────────────────────────

function generateRacialTraits(archetype: Archetype): RacialTrait[] {
  const chosen: RacialTrait[] = [];
  const numTraits = rng.int(2, 4);
  const banned = new Set<string>();

  // Weighted pool: archetype-themed trait ids appear extra times so they're favoured.
  const themed = new Set(archetype.traits);
  const weighted: RacialTrait[] = [];
  for (const t of RACIAL_TRAIT_DATABASE) {
    weighted.push(t);
    if (t.id && themed.has(t.id)) weighted.push(t, t); // ×3 weight
  }

  let guard = 0;
  while (chosen.length < numTraits && guard < 100) {
    guard++;
    const t = rng.pick(weighted);
    const tid = t.id ?? t.name;
    if (banned.has(tid)) continue;
    if (chosen.some((c) => (c.id ?? c.name) === tid)) continue;
    chosen.push(t);
    banned.add(tid);
    for (const group of CONFLICT_GROUPS) {
      if (group.includes(tid)) group.forEach((g) => banned.add(g));
    }
  }
  return chosen;
}

// ─── Lore + description ───────────────────────────────────────────────────────

function generateLoreFields(archetype: Archetype): Omit<RaceLore, 'description'> {
  return {
    epithet: rng.pick(archetype.epithets),
    origin: rng.pick(archetype.origins),
    homeland: rng.pick(archetype.homelands),
    temperament: rng.pick(archetype.temperaments),
    belief: rng.pick(archetype.beliefs)
  };
}

const SIZE_BUCKET: Record<Size, string> = {
  tiny: 'diminutive',
  small: 'small',
  medium: 'average',
  large: 'tall',
  huge: 'towering'
};

function mid(range: [number, number]): number {
  return (range[0] + range[1]) / 2;
}

function statBucket(value: number): string {
  if (value >= 14) return 'mighty';
  if (value >= 12) return 'strong';
  if (value >= 9.5) return 'average';
  return 'frail';
}

function buildBucket(phys: Race['physicalTraits']): string {
  const density = mid(phys.weightRange) / mid(phys.heightRange); // kg per cm
  if (density >= 0.7) return 'heavyset';
  if (density >= 0.52) return 'sturdy';
  if (density >= 0.4) return 'lean';
  if (density >= 0.3) return 'wiry';
  return 'gaunt';
}

/**
 * Build a 3–4 sentence immersive race description. Principle: the poetry is *authored*
 * (trait flavorLines + lore clause banks); the numbers only choose which clause/variant
 * to use and which traits to weave in — so the result is always grammatical and on-theme.
 */
export function generateRaceDescription(race: Race): string {
  const P = LORE.phrases;
  const sr = race.statRanges;
  const str = mid(sr.strength ?? [10, 10]);
  const dex = mid(sr.dexterity ?? [10, 10]);
  const con = mid(sr.constitution ?? [10, 10]);
  const int = mid(sr.intelligence ?? [10, 10]);
  const per = mid(sr.perception ?? [10, 10]);
  const cha = mid(sr.charisma ?? [10, 10]);

  // Sentence 1 — physique.
  const sizeP = rng.pick(P.size[SIZE_BUCKET[race.physicalTraits.size]]);
  const buildP = rng.pick(P.build[buildBucket(race.physicalTraits)]);
  const gaitKey =
    dex >= 12
      ? 'quick'
      : dex < 9.5 || buildBucket(race.physicalTraits) === 'heavyset'
        ? 'slow'
        : 'steady';
  const gaitP = rng.pick(P.gait[gaitKey]);
  const compP = rng.pick(P.comparative[comparativeKey(str, dex, con)]);
  const s1 = `The ${race.name}, ${race.lore.epithet}, are ${sizeP} — ${buildP}, ${gaitP} — ${compP}.`;

  // Sentence 2 — temperament + mind + belief.
  const mindP = rng.pick(P.mind[statBucket(int)]);
  const extras: string[] = [];
  if (per >= 12) extras.push(rng.pick(P.perception.high));
  else if (per < 9.5) extras.push(rng.pick(P.perception.low));
  if (cha >= 12) extras.push(rng.pick(P.charisma.high));
  else if (cha < 9.5) extras.push(rng.pick(P.charisma.low));
  const mindClause = [mindP, ...extras].join(', ');
  const s2 = `${cap(race.lore.temperament)} by nature, ${mindClause}; they hold ${race.lore.belief}.`;

  // Sentence 3 — origin + homeland. "They are {origin}" reads well for both the participial
  // ("carved from…") and noun-phrase ("the first to wake…") origin forms.
  const s3 = `They are ${race.lore.origin}, and make their home among ${race.lore.homeland}.`;

  // Sentence 4 — vocation + a defining quirk (authored flavorLine).
  const vocCat = strongestWorkCategory(race.racialTraits);
  const vocP = vocCat && P.vocation[vocCat] ? rng.pick(P.vocation[vocCat]) : null;
  const quirk = pickFlavorLine(race.racialTraits);
  let s4 = '';
  if (vocP && quirk) {
    // lead reads mid-sentence after the semicolon, so lowercase it ("…quarry; stranger still, …")
    s4 = `${cap(vocP)}; ${rng.pick(P.quirkLeads).toLowerCase()} ${quirk}.`;
  } else if (vocP) {
    s4 = `${cap(vocP)}.`;
  } else if (quirk) {
    s4 = `${rng.pick(P.quirkLeads)} ${quirk}.`;
  }

  return [s1, s2, s3, s4].filter(Boolean).join(' ');
}

function comparativeKey(str: number, dex: number, con: number): string {
  const conDex = con - dex;
  const strDex = str - dex;
  if (Math.abs(conDex) < 1.5 && Math.abs(strDex) < 1.5) return 'balanced';
  if (Math.abs(conDex) >= Math.abs(strDex)) return conDex >= 0 ? 'con_over_dex' : 'dex_over_con';
  return strDex >= 0 ? 'str_over_dex' : 'dex_over_str';
}

/** The work category with the strongest trait multiplier across speed/yield/quality. */
function strongestWorkCategory(traits: RacialTrait[]): string | null {
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

/** Prefer the flavor line of a trait carrying a special (resistance / damage reduction). */
function pickFlavorLine(traits: RacialTrait[]): string | null {
  const withLine = traits.filter((t) => t.flavorLine);
  if (withLine.length === 0) return null;
  const special = withLine.filter(
    (t) =>
      t.effects.damageReduction != null ||
      t.effects.blunt_resistance != null ||
      t.effects.cutting_resistance != null ||
      t.effects.piercing_resistance != null ||
      t.effects.fireResistance != null ||
      t.effects.coldResistance != null ||
      t.effects.poisonResistance != null
  );
  return rng.pick(special.length > 0 ? special : withLine).flavorLine ?? null;
}

// ─── Naming ────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateRaceName(): string {
  const prefixes = [
    'Astra',
    'Zeph',
    'Nyx',
    'Vor',
    'Keth',
    'Lum',
    'Drak',
    'Vel',
    'Mor',
    'Syl',
    'Tharn',
    'Krix',
    'Vex',
    'Zol',
    'Quin',
    'Hex',
    'Flux',
    'Ryn',
    'Thal',
    'Skorn'
  ];
  const suffixes = [
    'ani',
    'ori',
    'ith',
    'ara',
    'eon',
    'ys',
    'eth',
    'ian',
    'oth',
    'ael',
    'ix',
    'ock',
    'ung',
    'ast',
    'orn',
    'ek',
    'ul',
    'an',
    'ur',
    'ex'
  ];
  return rng.pick(prefixes) + rng.pick(suffixes);
}
