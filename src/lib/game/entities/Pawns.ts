import type { Pawn, EntityNeeds, PawnState, Race, EntityStats, Trait, Injury } from '../core/types';
import { createPawnInventory, createPawnEquipment } from '../core/PawnEquipment';
import { drawPawnTraits } from '../core/Race';
import { createBodyPlanLimbs } from '../systems/Combat';
import { DEFAULT_PLAN, PART_DEF_MAP, containedParts } from '../core/BodyParts';
import type { WoundSeverity } from '../core/Wounds';
import { rng } from '../core/rng';

// Module-level counter for sequential debug IDs across all generated pawns.
let _pawnDebugIdCounter = 1;

/** Stamina pool derived from constitution and dexterity — shared by Pawn and Mob. */
export function calcMaxStamina(stats: EntityStats): number {
  return 50 + (stats.constitution - 10) * 4 + (stats.dexterity - 10) * 2;
}

/**
 * Blood pool recovery rate per second when not bleeding.
 * Formula matches blood_regeneration ability: 1.0 + (CON − 10) × 0.08.
 * Base rate 0.05 /s gives ~0→100 in 2000 s at CON 10; scales with CON.
 */
export function calcBloodRegenRate(stats: EntityStats): number {
  return (1.0 + (stats.constitution - 10) * 0.08) * 0.05;
}

/** Blood pool derived from body weight and constitution. */
export function calcMaxBloodVolume(physicalTraits: { weight: number }, stats: EntityStats): number {
  return Math.round(physicalTraits.weight * 1.4 + (stats.constitution - 10) * 2);
}

// ── TRAIT-SYSTEM-V2 §4: wound-granter traits ──────────────────────────────────
// A `wound`-kind trait (one-eyed, hard-of-hearing, bad back) stamps a REAL, permanent, healed-over
// injury on the freshly-rolled body — it shows in the health tab and flows through the body model
// (a destroyed eye halves `sight`; a lost ear dulls `hearing`), never a hidden stat fudge.

/**
 * How much of a part's max HP a PERMANENT trait-stamped SCAR shaves. A scar is healed-over tissue, NOT a
 * fresh battle wound, so it takes only a small slice — at most ~10% (at `critical`) — never the 20–80% a
 * COMBAT wound of the same severity band inflicts. So even a "critical" facial scar leaves the head near
 * full (45 → ~40), not one blow from caving in. The tier's real teeth is the chronic PAIN below, not the
 * HP dent. `destroyed` is the exception — a LOST part (eye/hand/whole limb, §5a) is fully gone.
 */
const SPAWN_WOUND_DAMAGE_FRAC: Record<WoundSeverity, number> = {
  minor: 0.03,
  serious: 0.06,
  critical: 0.1,
  destroyed: 1
};
/** Chronic ache of a lesser permanent wound (a destroyed part is a long-healed stump — painless). */
const SPAWN_WOUND_PAIN: Record<WoundSeverity, number> = {
  minor: 0,
  serious: 3,
  critical: 6,
  destroyed: 0
};

/** For a paired part (leftEye/rightEar…), flip to its twin half the time — variety, not a mechanic. */
function maybeFlipPairedSide(partId: string): string {
  const twin = partId.startsWith('left')
    ? 'right' + partId.slice(4)
    : partId.startsWith('right')
      ? 'left' + partId.slice(5)
      : undefined;
  return twin && PART_DEF_MAP[twin] && rng.random() < 0.5 ? twin : partId;
}

/**
 * TRAIT-LIBRARY-EXPANSION §3d — à-la-carte body composition: graft the limbs a trait declares
 * (`grafts: [{limb, parts}]`) onto the pawn's (freshly built, privately owned) limb tree, pulling part
 * defs from the GLOBAL limbmap catalog (any plan's parts are addressable — avian wings, quadruped tail…).
 * A grafted limb is a REAL limb: hittable (rollBodyPartOf reads the live tree), losable, and the host
 * for the trait's natural gear. Runs BEFORE bodyMods/wounds so those apply to the full body. Idempotent
 * per limb id (two wing traits can't double-graft).
 */
export function applyTraitGrafts(pawn: Pawn): void {
  const limbs = pawn.limbs;
  if (!limbs) return;
  for (const trait of pawn.traits ?? []) {
    for (const g of trait.grafts ?? []) {
      if (limbs.some((l) => l.id === g.limb)) continue; // already present (plan or earlier graft)
      const parts = g.parts
        .filter((pid) => PART_DEF_MAP[pid])
        .map((pid) => {
          const def = PART_DEF_MAP[pid]!;
          const maxHp = Math.max(1, Math.round(def.maxHp));
          return { id: pid, health: maxHp, maxHp, isMissing: false, injuries: [] };
        });
      if (parts.length === 0) continue;
      limbs.push({ id: g.limb, health: 100, isMissing: false, bleedRate: 0, parts });
    }
  }
}

/**
 * Apply every drawn `wound`-kind trait's injuries to the pawn's (freshly built, privately owned)
 * limb tree, then mirror the flat `injuries`/`pain` fields the way Combat does after a hit.
 * NEVER LETHAL (locked decision 2026-07-06): vital/critical parts are refused outright, and
 * `destroyed` is downgraded to `critical` on any part that CONTAINS others (no severed-container
 * cascade — a newborn can't spawn dead) or on a pure bone (fracture-only).
 * §5a lost limbs: a spec with `amputate: true` instead removes the WHOLE parent limb (a true old
 * amputation — every part missing, limb.isMissing, one permanent stump wound on the named part);
 * refused on limbs holding a vital/critical organ (head/torso stay whole — the same non-lethal cap).
 */
export function applyTraitWounds(pawn: Pawn): void {
  const limbs = pawn.limbs;
  if (!limbs) return;
  let stamped = false;
  for (const trait of pawn.traits ?? []) {
    for (const spec of trait.wounds ?? []) {
      const partId = maybeFlipPairedSide(spec.part);
      if (spec.amputate) {
        const limb = limbs.find((l) => l.parts?.some((p) => p.id === partId));
        if (!limb || limb.isMissing) continue;
        // Non-lethal cap: never amputate a limb whose parts include a vital/critical organ.
        if ((limb.parts ?? []).some((p) => PART_DEF_MAP[p.id]?.isVital || PART_DEF_MAP[p.id]?.isCritical))
          continue;
        for (const p of limb.parts ?? []) {
          p.health = 0;
          p.isMissing = true;
        }
        const stumpPart = limb.parts?.find((p) => p.id === partId);
        stumpPart?.injuries.push({
          bodyPart: partId,
          type: spec.type ?? 'cut',
          severity: 'destroyed',
          damage: stumpPart.maxHp,
          bleeding: 0, // an OLD amputation — long since healed over
          painContribution: 0,
          infected: false,
          clotProgress: 3,
          inflictedAt: 0,
          permanent: true
        });
        limb.health = 0;
        limb.isMissing = true;
        limb.bleedRate = 0;
        stamped = true;
        continue;
      }
      const def = PART_DEF_MAP[partId];
      if (!def || def.isVital || def.isCritical) continue; // heart/brain: never stampable
      let severity = spec.severity;
      // Non-lethal cap on `destroyed`: a pure bone can't sever, and a container whose closure holds a
      // VITAL organ is downgraded (a newborn can't spawn dead). A container of only NON-vital parts
      // (a hand with its fingers, a foot with its toes — §5a) may be destroyed: its contents go with it.
      let cascadeIds: Set<string> | null = null;
      if (severity === 'destroyed' && (containedParts(partId).size > 0 || def.skeleton)) {
        const contents = containedParts(partId);
        const holdsVital = [...contents].some(
          (id) => PART_DEF_MAP[id]?.isVital || PART_DEF_MAP[id]?.isCritical
        );
        if (def.skeleton || holdsVital) severity = 'critical';
        else cascadeIds = contents;
      }
      const limb = limbs.find((l) => l.parts?.some((p) => p.id === partId));
      const part = limb?.parts?.find((p) => p.id === partId);
      if (!limb || !part || part.isMissing) continue;
      const damage = Math.round(part.maxHp * SPAWN_WOUND_DAMAGE_FRAC[severity] * 10) / 10;
      const wound: Injury = {
        bodyPart: partId,
        type: spec.type ?? 'cut',
        severity,
        damage,
        bleeding: 0, // healed over long ago
        painContribution: SPAWN_WOUND_PAIN[severity],
        infected: false,
        clotProgress: 3, // fully clotted
        inflictedAt: 0,
        permanent: true
      };
      part.injuries.push(wound);
      part.health = Math.max(0, part.maxHp - damage);
      if (severity === 'destroyed') part.isMissing = true;
      // §5a: a destroyed non-vital container takes its contents with it (a lost hand takes the fingers).
      if (cascadeIds) {
        for (const p of limb.parts ?? []) {
          if (cascadeIds.has(p.id) && !p.isMissing) {
            p.health = 0;
            p.isMissing = true;
          }
        }
      }
      // Roll the limb's health up from its parts (same mass-weighted formula as Combat).
      const partMaxTotal = (limb.parts ?? []).reduce((s, p) => s + p.maxHp, 0);
      const partHealthTotal = (limb.parts ?? []).reduce((s, p) => s + p.health, 0);
      if (partMaxTotal > 0) limb.health = Math.round((partHealthTotal / partMaxTotal) * 100);
      stamped = true;
    }
  }
  if (!stamped) return;
  // Mirror the flat injuries list + pain total exactly like Combat._applyInjuryToEntity.
  const flat: Injury[] = [];
  let painTotal = 0;
  for (const l of limbs) {
    for (const p of l.parts ?? []) {
      for (const w of p.injuries) {
        flat.push(w);
        painTotal += w.painContribution;
      }
    }
  }
  pawn.injuries = flat;
  pawn.pain = Math.max(0, Math.min(100, Math.round(painTotal)));
}

/** Sum a drawn trait set's `bodyMod` body-weight deltas (heavy bones add mass). Applied to the rolled
 *  weight BEFORE the blood pool is derived, so a heavy-boned pawn carries a proportionally larger pool. */
function traitBodyWeightDelta(traits: Trait[]): number {
  let delta = 0;
  for (const t of traits)
    for (const m of t.bodyMods ?? []) delta += m.weightKg ?? 0;
  return delta;
}

/**
 * Apply every drawn `bodyMod`-kind trait's structural changes to the pawn's (freshly built, privately
 * owned) limb tree — scaling matching parts' maxHp so the effect lives in the real body model:
 * `skeleton` targets raise/lower the fracture budget (dense vs brittle bone), `flesh` targets the
 * wound tolerance of the soft padding (thick vs thin hide). Full health is preserved (maxHp and health
 * scale together), so capacities read normal until the part is actually hurt. Body-weight deltas are
 * folded in earlier (traitBodyWeightDelta), before the blood pool is derived.
 */
export function applyTraitBodyMods(pawn: Pawn): void {
  const limbs = pawn.limbs;
  if (!limbs) return;
  for (const trait of pawn.traits ?? []) {
    for (const m of trait.bodyMods ?? []) {
      if (m.hpMult == null || m.hpMult === 1) continue;
      for (const limb of limbs) {
        for (const part of limb.parts ?? []) {
          const def = PART_DEF_MAP[part.id];
          if (!def) continue;
          const matches =
            m.target === 'skeleton'
              ? def.skeleton === true
              : m.target === 'flesh'
                ? (def.hitWeight ?? 0) > 0
                : part.id === m.target;
          if (!matches) continue;
          const full = part.health >= part.maxHp;
          part.maxHp = Math.max(1, Math.round(part.maxHp * m.hpMult));
          if (full) part.health = part.maxHp; // freshly generated → keep it topped up
        }
      }
    }
  }
}

/** Roll a single pawn from a specific race (stats within the race's ranges, traits copied,
 *  race identity stamped). Shared by single-race and mixed-colony generation. */
export function buildPawnFromRace(race: Race, index: number): Pawn {
  const baseStats = rollStatsFromRanges(race.statRanges);
  // Roll the base physique FIRST — it gates physically-contradictory traits (ADR-028 `requires`: no
  // Gaunt on a 250 kg mass), so the trait draw needs to know weight/height.
  const physicalTraits = rollPhysicalTraits(race.physicalTraits);
  // ADR-023: each pawn draws its OWN trait set (guaranteed identity + 1–2 mundane pool + 0–2 personal,
  // physique-gated), so same-race pawns differ. Stats then fold in the drawn traits' bonuses.
  const traits = drawPawnTraits(race, physicalTraits);
  const finalStats = applyRacialTraitBonuses(baseStats, traits);
  // TRAIT-SYSTEM-V2 §1: bodyMod weight (heavy bones) mass folded in AFTER the draw (it doesn't change
  // the base build the gate reads) but BEFORE the blood pool is derived from weight.
  physicalTraits.weight += traitBodyWeightDelta(traits);
  const maxBloodVolume = calcMaxBloodVolume(physicalTraits, finalStats);
  const maxStamina = calcMaxStamina(finalStats);
  // PAWN-GROWTH: talent-star fav stats + per-stat growth ceilings, a rolled adult age, and a fixed
  // random birthday (age++ + a doubled growth offer land on it).
  const { maxStats, favStats } = rollGrowthProfile(finalStats, race.statRanges);

  const pawn: Pawn = {
    id: `pawn-${index}`,
    debugId: _pawnDebugIdCounter++,
    name: generatePawnName(),
    stats: finalStats,
    maxStats,
    favStats,
    age: rng.int(16, 45),
    birthDayOfYear: rng.int(0, 359),
    physicalTraits,
    raceId: race.id,
    raceName: race.name,
    traits,
    inventory: createPawnInventory(),
    equipment: createPawnEquipment(),
    needs: {
      hunger: 0,
      fatigue: 0,
      sleep: 0,
      lastSleep: 0,
      lastMeal: 0
    },
    state: {
      mood: 50,
      isWorking: false,
      isSleeping: false,
      isEating: false
    },
    currentState: 'Idle',
    skills: {},
    // Survival & Health
    isAlive: true,
    maxBloodVolume,
    bloodVolume: maxBloodVolume,
    conditions: [],
    // Combat — stamina
    stamina: maxStamina,
    maxStamina,
    // Pawns are the humanoid body plan (limbmap.jsonc) at bodyScale 1.0.
    limbs: createBodyPlanLimbs(DEFAULT_PLAN, 1)
  };

  // §3d graft trait-declared limbs (wings/tail/beak) FIRST so bodyMods/wounds see the full body, then
  // TRAIT-SYSTEM-V2 §1: apply bodyMod structural changes (dense/brittle bone, thick/thin hide) to the
  // limb tree, THEN stamp any wound-kind traits as real permanent injuries (against the adjusted maxHp).
  applyTraitGrafts(pawn);
  applyTraitBodyMods(pawn);
  applyTraitWounds(pawn);

  return pawn;
}

/** Generate `count` pawns from a single race (back-compat: extra-pawn backfill path). */
export function generatePawns(race: Race, count = 3): Pawn[] {
  return Array.from({ length: count }, (_, i) => buildPawnFromRace(race, i));
}

/** Generate a fully-mixed starting colony: each pawn is rolled from a random pool race. */
export function generateColonyPawns(racePool: Race[], count = 5): Pawn[] {
  if (racePool.length === 0) return [];
  return Array.from({ length: count }, (_, i) => buildPawnFromRace(rng.pick(racePool), i));
}

// UPDATED: Simplified categorization focused on basic abilities
export function categorizeStats(
  stats: Record<string, { value: number; sources: string[] }>
): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    'Basic Physical': [],
    'Basic Mental': [],
    'Basic Survival': [],
    Skills: [],
    Special: []
  };

  Object.keys(stats).forEach((statName) => {
    const lowerName = statName.toLowerCase();

    // Skills
    if (lowerName.startsWith('skill_')) {
      categories['Skills'].push(statName);
    }
    // Basic Physical abilities
    else if (
      lowerName.includes('carry') ||
      lowerName.includes('movement') ||
      lowerName.includes('swimming') ||
      lowerName.includes('vision')
    ) {
      categories['Basic Physical'].push(statName);
    }
    // Basic Mental abilities
    else if (
      lowerName.includes('learning') ||
      lowerName.includes('social') ||
      lowerName.includes('intuition') ||
      lowerName.includes('knowledge') ||
      lowerName.includes('experience')
    ) {
      categories['Basic Mental'].push(statName);
    }
    // Basic Survival abilities
    else if (
      lowerName.includes('health') ||
      lowerName.includes('disease') ||
      lowerName.includes('vitality')
    ) {
      categories['Basic Survival'].push(statName);
    }
    // Everything else goes to Special (ModifierSystem handled abilities)
    else {
      categories['Special'].push(statName);
    }
  });

  // Remove empty categories
  Object.keys(categories).forEach((category) => {
    if (categories[category].length === 0) {
      delete categories[category];
    }
  });

  return categories;
}

// SIMPLIFIED: Basic stat descriptions only
export function getStatDescription(
  statName: string,
  statData: { value: number; sources: string[] }
): string {
  const descriptions: Record<string, string> = {
    // Basic Physical
    carryCapacity: 'Maximum weight that can be carried (kg)',
    movementSpeed: 'Movement points per turn',
    swimmingSpeed: 'Movement speed in water',
    visionRange: 'Maximum sight distance (meters)',

    // Basic Mental
    learningSpeed: 'Multiplier for skill development',
    socialInfluence: 'Effectiveness in diplomacy and trade',
    intuition: 'Ability to detect danger and opportunities',
    knowledgeStorage: 'Capacity to store information',
    experienceGain: 'Rate of learning from practical activities',

    // Basic Survival
    healthRegenRate: 'Health points recovered per turn',
    diseaseResistance: 'Resistance to illness and poison',
    vitality: 'Overall health and constitution',

    // Skills
    skill_mining: 'Experience in mineral extraction',
    skill_woodcutting: 'Experience in wood harvesting',
    skill_crafting: 'Experience in item creation',
    skill_hunting: 'Experience in hunting animals',
    skill_fishing: 'Experience in catching fish',
    skill_foraging: 'Experience in gathering resources',
    skill_research: 'Experience in knowledge discovery',
    skill_construction: 'Experience in building structures'
  };

  // Handle generic skill descriptions
  if (statName.startsWith('skill_')) {
    const skillName = statName.replace('skill_', '');
    return descriptions[statName] || `Experience in ${skillName}`;
  }

  return descriptions[statName] || 'Special stat with unique effects';
}

// --- Existing utility functions (unchanged) ---

function rollStatsFromRanges(statRanges: Record<string, [number, number]>): EntityStats {
  const stats: any = {};

  Object.entries(statRanges).forEach(([statName, [min, max]]) => {
    stats[statName] = min + Math.floor(rng.random() * (max - min + 1));
  });

  return stats as EntityStats;
}

/** The six core-attribute keys. */
const STAT_KEYS: (keyof EntityStats)[] = [
  'strength',
  'dexterity',
  'intelligence',
  'perception',
  'charisma',
  'constitution'
];

/**
 * PAWN-GROWTH: roll a pawn's two favoured ("talent-star") stats + per-stat growth ceilings. Favoured
 * stats are drawn weighted toward the race's strongest stats (widest [min,max] = its focus), then get
 * the highest caps (~85–100); the rest cap ~62–82. Every cap sits at least +15 above the rolled stat so
 * there's always room to grow. Caps are what a stat can climb to over many growth events.
 */
function rollGrowthProfile(
  finalStats: EntityStats,
  statRanges: Record<string, [number, number]>
): { maxStats: EntityStats; favStats: [keyof EntityStats, keyof EntityStats] } {
  // Weight fav selection toward the race's focus stats (wider range ⇒ higher weight), so a warlike
  // race tends to favour STR/CON — but any stat can be a pawn's talent.
  const pool: (keyof EntityStats)[] = [];
  for (const stat of STAT_KEYS) {
    const [min, max] = statRanges[stat] ?? [10, 15];
    const weight = 1 + Math.max(0, Math.round((max - min + (max - 18)) / 3)); // focus stats weigh more
    for (let i = 0; i < weight; i++) pool.push(stat);
  }
  const favA = rng.pick(pool);
  let favB = rng.pick(pool);
  let guard = 0;
  while (favB === favA && guard++ < 20) favB = rng.pick(STAT_KEYS);
  const favStats: [keyof EntityStats, keyof EntityStats] = [favA, favB];

  const maxStats = {} as EntityStats;
  for (const stat of STAT_KEYS) {
    const isFav = stat === favA || stat === favB;
    const base = isFav ? rng.int(85, 100) : rng.int(62, 82);
    maxStats[stat] = Math.max(base, finalStats[stat] + 15);
  }
  return { maxStats, favStats };
}

function applyRacialTraitBonuses(baseStats: EntityStats, traits: Trait[]): EntityStats {
  const modifiedStats = { ...baseStats };

  traits.forEach((trait) => {
    Object.entries(trait.effects).forEach(([effectName, effectValue]) => {
      if (effectName.endsWith('Bonus') && typeof effectValue === 'number') {
        const statName = effectName.replace('Bonus', '').toLowerCase() as keyof EntityStats;
        if (modifiedStats[statName] !== undefined) {
          modifiedStats[statName] += effectValue;
        }
      } else if (effectName.endsWith('Penalty') && typeof effectValue === 'number') {
        const statName = effectName.replace('Penalty', '').toLowerCase() as keyof EntityStats;
        if (modifiedStats[statName] !== undefined) {
          modifiedStats[statName] = Math.max(1, modifiedStats[statName] + effectValue);
        }
      }
    });
  });

  return modifiedStats;
}

function rollPhysicalTraits(racePhysicalTraits: any): any {
  const { heightRange, weightRange, size } = racePhysicalTraits;

  return {
    height: heightRange[0] + Math.floor(rng.random() * (heightRange[1] - heightRange[0] + 1)),
    weight: weightRange[0] + Math.floor(rng.random() * (weightRange[1] - weightRange[0] + 1)),
    size: size
  };
}
function generatePawnName(): string {
  const firstNames = [
    'Aria',
    'Brom',
    'Celia',
    'Dain',
    'Enna',
    'Finn',
    'Greta',
    'Hale',
    'Ivy',
    'Jax',
    'Kira',
    'Lark',
    'Mira',
    'Nix',
    'Opal',
    'Pike',
    'Quinn',
    'Ren',
    'Sage',
    'Thea',
    'Uma',
    'Vale',
    'Wren',
    'Xara',
    'Yuki',
    'Zara',
    'Axel',
    'Blair',
    'Clay',
    'Dawn',
    'Echo',
    'Frost',
    'Gage',
    'Haven',
    'Indigo',
    'Jade',
    'Knox',
    'Luna',
    'Moss',
    'Nova',
    'Onyx',
    'Petra',
    'Quest',
    'River',
    'Storm',
    'Thorn',
    'Unity',
    'Vex',
    'Wolf',
    'Zephyr'
  ];

  const surnames = [
    'Ashbrook',
    'Blackwood',
    'Clearwater',
    'Darkstone',
    'Emberfall',
    'Frostborn',
    'Goldleaf',
    'Hawthorne',
    'Ironforge',
    'Jadeheart',
    'Kindred',
    'Lightbringer',
    'Moonwhisper',
    'Nightfall',
    'Oakheart',
    'Proudfoot',
    'Quicksilver',
    'Ravenclaw',
    'Starweaver',
    'Thornfield',
    'Underhill',
    'Valorheart',
    'Wildstorm',
    'Wyvernheart',
    'Brightblade',
    'Copperstone',
    'Driftwood',
    'Earthsong',
    'Fireforge',
    'Graymane',
    'Healingsong',
    'Ironback',
    'Jewelcrest',
    'Keenblade',
    'Littlewater',
    'Miralake'
  ];

  const firstName = firstNames[Math.floor(rng.random() * firstNames.length)];
  const surname = surnames[Math.floor(rng.random() * surnames.length)];

  return `${firstName} ${surname}`;
}

// --- Business logic moved to PawnService.ts ---
// All need management, state updates, and turn processing now handled by PawnService
