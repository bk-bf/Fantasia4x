import type { Race, Trait, RaceLore, RaceRelation } from './types';
import traitDbData from '../database/traits.jsonc';
import loreData from '../database/race-lore.jsonc';
import { rng } from './rng';
import { clamp } from './math';

/** The unified trait DB (racial + personal), ADR-023. */
export const TRAIT_DATABASE: Trait[] = traitDbData as unknown as Trait[];

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

// Trait ids that may not co-occur on one pawn/race (mutually exclusive biology / temperament, and
// base↔evolution pairs so a pawn never carries both a seed trait and the power it grows into).
const CONFLICT_GROUPS: string[][] = [
  ['stocky', 'rangy'],
  ['sturdy', 'frail'],
  ['bright', 'dull'],
  ['thick-skinned', 'thin-skinned', 'scaled-hide', 'iron-skin', 'thick-fur'], // one kind of hide
  ['heavy-boned', 'stone-bones', 'brittle-boned'], // dense vs brittle bone — one skeleton
  ['keen-eyed', 'nearsighted'], // one visual acuity
  ['frost-loving', 'frost-born', 'warm-blooded', 'ever-warm', 'cold-blooded', 'flame-touched', 'thin-blooded'], // one thermal identity
  ['adrenaline', 'berserker-blood'],
  ['night-owl', 'nocturnal', 'night-blind'], // one night-sight identity
  ['fast-healer', 'regenerative'],
  ['nocturnal', 'photosynthetic'],
  // personal temperament conflicts
  ['industrious', 'lazy'],
  ['meticulous', 'slapdash'],
  ['curious', 'incurious'],
  ['gregarious', 'loner', 'ill-tempered']
];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Generate one procedural race biased toward a (random or given) archetype. */
export function generateRace(archetype: Archetype = rng.pick(LORE.archetypes)): Race {
  const statRanges = generateStatRanges(archetype);
  const physicalTraits = generatePhysicalTraits(archetype);
  const { guaranteed, pool } = generateRaceTraitSets(archetype);

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
    guaranteedTraits: guaranteed,
    racialTraitPool: pool,
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

const RACIAL = () => TRAIT_DATABASE.filter((t) => (t.scope ?? 'racial') === 'racial');
const PERSONAL = () => TRAIT_DATABASE.filter((t) => t.scope === 'personal');
/** Pure-downside FLAWS (rarity 'negative', either scope) — drawn as an individual Gaussian-count layer
 *  (drawPawnTraits), never as race identity or a positive-pool pick. */
const NEGATIVE = () => TRAIT_DATABASE.filter((t) => t.rarity === 'negative');
const tid = (t: Trait) => t.id ?? t.name;
/** common/uncommon are the "mundane" variety pool; rare/epic/legendary are the rare identity powers.
 *  'negative' is NOT mundane — flaws are excluded from every positive pool (identity, race pool, personal). */
const isMundaneRarity = (r: Trait['rarity']) => (r ?? 'common') === 'common' || r === 'uncommon';

/** Bell-curve COUNT of negative traits a pawn spawns with (ADR-028): a half-normal (|Gaussian|) rounded
 *  and clamped to 0–4, so MOST pawns carry none or one flaw and a rare wretch carries four. σ tunes the
 *  spread — at 1.25: ≈31% carry 0, 44% one, 21% two, ~4% three, ~0.5% four (a four-flaw wretch shows up
 *  roughly once every ~200 pawns). Lower σ → cleaner colony; raise it for a harsher, more flawed world. */
const NEGATIVE_TRAIT_SIGMA = 1.25;
const MAX_NEGATIVE_TRAITS = 4;
function rollNegativeCount(): number {
  return Math.max(0, Math.min(MAX_NEGATIVE_TRAITS, Math.round(Math.abs(rng.gaussian(0, NEGATIVE_TRAIT_SIGMA)))));
}

/** A pawn's rolled base physique, for gating physically-contradictory traits (ADR-028 `requires`). */
export interface PawnPhysique {
  weight: number;
  height: number;
}
/** True if the pawn's physique satisfies the trait's `requires` gate (or the trait has none / no
 *  physique supplied). `build` = weight ÷ height (kg/cm) — the lean↔heavy axis, so Gaunt can't land on a
 *  heavyset mass and Stocky can't land on a wisp. */
export function pawnMeetsRequires(t: Trait, phys?: PawnPhysique): boolean {
  const r = t.requires;
  if (!r || !phys) return true;
  const build = phys.height > 0 ? phys.weight / phys.height : 0;
  if (r.minWeightKg != null && phys.weight < r.minWeightKg) return false;
  if (r.maxWeightKg != null && phys.weight > r.maxWeightKg) return false;
  if (r.minHeightCm != null && phys.height < r.minHeightCm) return false;
  if (r.maxHeightCm != null && phys.height > r.maxHeightCm) return false;
  if (r.minBuild != null && build < r.minBuild) return false;
  if (r.maxBuild != null && build > r.maxBuild) return false;
  return true;
}

/**
 * A RACE's trait identity (ADR-023, per-race rarity). Rolls the spec's rarity ONCE per race —
 * ~2.5% legendary, else ~10% one supernatural / ~5% two, else pure mundane — into `guaranteed`
 * (shared by every member of the race), then fills a `pool` of mundane traits each pawn draws from
 * for individual variety. Archetype-themed ids are ×3-weighted; conflict groups are honoured.
 */
function generateRaceTraitSets(archetype: Archetype): { guaranteed: Trait[]; pool: Trait[] } {
  const racial = RACIAL();
  // Rarity CLASSES (TRAIT-SYSTEM-V2 §2 · ADR-028): common/uncommon = the mundane variety pool; the
  // capability tiers rare < epic < mythic < legendary are each drawn at a DECREASING per-race rate, so a
  // higher tier is genuinely harder to roll (iron skin at epic is much rarer than a plain rare).
  const mundane = racial.filter((t) => isMundaneRarity(t.rarity));
  const byRarity = (r: Trait['rarity']) => racial.filter((t) => t.rarity === r);
  const rare = byRarity('rare');
  const epic = byRarity('epic');
  const mythic = byRarity('mythic');
  const legendary = byRarity('legendary');
  const themed = new Set(archetype.traits);
  const banned = new Set<string>();
  const ban = (id: string) => {
    banned.add(id);
    for (const g of CONFLICT_GROUPS) if (g.includes(id)) g.forEach((x) => banned.add(x));
  };
  // Weighted draw of ONE unbanned trait from a tier pool (archetype-themed ×3); bans it + conflicts.
  const draw = (poolArr: Trait[]): Trait | null => {
    const weighted: Trait[] = [];
    for (const t of poolArr) {
      if (banned.has(tid(t))) continue;
      weighted.push(t);
      if (t.id && themed.has(t.id)) weighted.push(t, t);
    }
    if (weighted.length === 0) return null;
    const t = rng.pick(weighted);
    ban(tid(t));
    return t;
  };

  const guaranteed: Trait[] = [];
  // Per-race rarity gate — ONE roll into CUMULATIVE bands, rarest first, so a higher tier is strictly
  // less likely (legendary 1.5% · mythic 1.5% · epic 3% · rare 9% → ~15% carry some capability, the rest
  // mundane). Bands are kept TIGHT for the top tiers so each individual epic (e.g. Iron Skin) lands ~1%
  // — rarer than a plain rare — despite the smaller pool. Rare occasionally grants a SECOND trait.
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
  // Every race reads as a recognizable "people": if no capability/legendary rolled, give it ONE
  // signature MUNDANE identity trait (a capability already IS the identity, so don't stack on it).
  if (guaranteed.length === 0) {
    const t = draw(mundane);
    if (t) guaranteed.push(t);
  }

  // A SMALL mundane variety pool (3–4) each pawn draws from — keeps a race's identity tight and
  // legible rather than a grab-bag of nine traits.
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

/** Spawn caps (ADR-023): at most 2 racial + 3 personal traits, so a fresh pawn carries ≤5 traits.
 *  (A future evolution/growth system can push past these — this is the AT-SPAWN budget.) */
const MAX_RACIAL_TRAITS = 2;
const MAX_PERSONAL_TRAITS = 3;

/**
 * Draw ONE PAWN's combined trait set (ADR-023, capped at spawn): up to {@link MAX_RACIAL_TRAITS}
 * racial (the race's guaranteed identity first — legendary bundles expand a sub-capability PER PAWN so
 * two dragon-blooded differ — then filled from the race's mundane pool) + up to
 * {@link MAX_PERSONAL_TRAITS} personal. Conflict groups (incl. base↔evolution) are honoured throughout.
 * `physique` (the pawn's rolled weight/height) gates physically-contradictory traits (ADR-028 `requires`):
 * a trait whose physique gate fails is skipped from this pawn — no Gaunt on a 250 kg mass.
 */
export function drawPawnTraits(race: Race, physique?: PawnPhysique): Trait[] {
  const out: Trait[] = [];
  const banned = new Set<string>();
  const ban = (id: string) => {
    banned.add(id);
    for (const g of CONFLICT_GROUPS) if (g.includes(id)) g.forEach((x) => banned.add(x));
  };
  const fits = (t: Trait) => pawnMeetsRequires(t, physique);
  let racialCount = 0;
  const takeRacial = (t: Trait): boolean => {
    if (racialCount >= MAX_RACIAL_TRAITS || banned.has(tid(t)) || !fits(t)) return false;
    ban(tid(t));
    out.push(t);
    racialCount++;
    return true;
  };

  // Guaranteed racial identity FIRST (within the cap). A legendary bundle's banner takes one slot,
  // then a rolled sub-capability fills the remaining slot (the rest are acquired later).
  for (const g of race.guaranteedTraits) {
    if (racialCount >= MAX_RACIAL_TRAITS) break;
    // A legendary OR mythic BUNDLE takes one banner slot, then rolls a sub-capability per pawn (so two
    // dragon-blooded / two amphibians differ); the rest are acquired later.
    if ((g.rarity === 'legendary' || g.rarity === 'mythic') && g.subCapabilities?.length) {
      takeRacial({ ...g, subCapabilities: undefined });
      const subs = [...g.subCapabilities];
      while (racialCount < MAX_RACIAL_TRAITS && subs.length > 0) {
        takeRacial(subs.splice(rng.int(0, subs.length - 1), 1)[0]);
      }
    } else {
      takeRacial(g);
    }
  }
  // Fill any remaining racial slot(s) from the race's mundane pool (per-pawn variety). Physique-gated.
  {
    const bag = race.racialTraitPool.filter((t) => !banned.has(tid(t)) && fits(t));
    while (racialCount < MAX_RACIAL_TRAITS && bag.length > 0) {
      takeRacial(bag.splice(rng.int(0, bag.length - 1), 1)[0]);
    }
  }

  // 0–3 POSITIVE personal quirks (weighted toward a couple), honouring personal conflict groups.
  // Flaws (rarity 'negative') are excluded here — they're the separate Gaussian layer below.
  const r = rng.random();
  const nPersonal = r < 0.2 ? 0 : r < 0.55 ? 1 : r < 0.85 ? 2 : 3;
  const pbag = PERSONAL().filter((t) => t.rarity !== 'negative' && !banned.has(tid(t)) && fits(t));
  let personalCount = 0;
  while (personalCount < nPersonal && pbag.length > 0) {
    const t = pbag.splice(rng.int(0, pbag.length - 1), 1)[0];
    if (banned.has(tid(t))) continue;
    ban(tid(t));
    out.push(t);
    personalCount++;
  }

  // ADR-028 FLAW layer: a bell-curve (Gaussian) COUNT of negative traits, drawn from the whole flaw pool
  // (racial physiology + personal temperament + afflictions), honouring conflict groups + everything
  // already taken. Independent of the positive budget — MOST pawns get none/one, a rare wretch gets four.
  const nNeg = rollNegativeCount();
  const nbag = NEGATIVE().filter((t) => !banned.has(tid(t)) && fits(t));
  let negCount = 0;
  while (negCount < nNeg && nbag.length > 0) {
    const t = nbag.splice(rng.int(0, nbag.length - 1), 1)[0];
    if (banned.has(tid(t))) continue;
    ban(tid(t));
    out.push(t);
    negCount++;
  }
  return out;
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

export type StatBucket = 'mighty' | 'strong' | 'average' | 'frail';

/** Bucket a raw stat value into a coarse tier — the single source of the mighty/strong/average/frail
 *  thresholds, reused by the migrant-wave UI so it can describe a pawn without leaking the number. */
export function statBucket(value: number): StatBucket {
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

  // Sentence 4 — vocation + a defining quirk (authored flavorLine). Drawn from the race's identity +
  // pool (the traits any member might carry), since a race no longer has one fixed trait list.
  const raceTraits = [...race.guaranteedTraits, ...race.racialTraitPool];
  const vocCat = strongestWorkCategory(raceTraits);
  const vocP = vocCat && P.vocation[vocCat] ? rng.pick(P.vocation[vocCat]) : null;
  const quirk = pickFlavorLine(raceTraits);
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

/** Prefer the flavor line of a trait carrying a special (resistance / damage reduction). */
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
