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

/** Accumulated damage as a fraction of the part's max HP per spawn severity (severityFromFrac bands). */
const SPAWN_WOUND_DAMAGE_FRAC: Record<WoundSeverity, number> = {
  minor: 0.2,
  serious: 0.5,
  critical: 0.8,
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
 * Apply every drawn `wound`-kind trait's injuries to the pawn's (freshly built, privately owned)
 * limb tree, then mirror the flat `injuries`/`pain` fields the way Combat does after a hit.
 * NEVER LETHAL (locked decision 2026-07-06): vital/critical parts are refused outright, and
 * `destroyed` is downgraded to `critical` on any part that CONTAINS others (no severed-container
 * cascade — a newborn can't spawn dead) or on a pure bone (fracture-only).
 */
export function applyTraitWounds(pawn: Pawn): void {
  const limbs = pawn.limbs;
  if (!limbs) return;
  let stamped = false;
  for (const trait of pawn.traits ?? []) {
    for (const spec of trait.wounds ?? []) {
      const partId = maybeFlipPairedSide(spec.part);
      const def = PART_DEF_MAP[partId];
      if (!def || def.isVital || def.isCritical) continue; // heart/brain: never stampable
      let severity = spec.severity;
      if (severity === 'destroyed' && (containedParts(partId).size > 0 || def.skeleton)) {
        severity = 'critical'; // no container cascade, no severed bones — the non-lethal cap
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
  // ADR-023: each pawn draws its OWN trait set (guaranteed identity + 1–2 mundane pool + 0–2
  // personal), so same-race pawns differ. Stats then fold in the drawn traits' bonuses.
  const traits = drawPawnTraits(race);
  const finalStats = applyRacialTraitBonuses(baseStats, traits);
  const physicalTraits = rollPhysicalTraits(race.physicalTraits);
  // TRAIT-SYSTEM-V2 §1: bodyMod weight (heavy bones) mass BEFORE the blood pool is derived from weight.
  physicalTraits.weight += traitBodyWeightDelta(traits);
  const maxBloodVolume = calcMaxBloodVolume(physicalTraits, finalStats);
  const maxStamina = calcMaxStamina(finalStats);

  const pawn: Pawn = {
    id: `pawn-${index}`,
    debugId: _pawnDebugIdCounter++,
    name: generatePawnName(),
    stats: finalStats,
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

  // TRAIT-SYSTEM-V2 §1: apply bodyMod structural changes (dense/brittle bone, thick/thin hide) to the
  // limb tree, THEN stamp any wound-kind traits as real permanent injuries (against the adjusted maxHp).
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
