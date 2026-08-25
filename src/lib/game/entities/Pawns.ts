import type {
  Pawn,
  EntityNeeds,
  PawnState,
  Culture,
  EntityStats,
  Trait,
  Injury,
  Kingdom,
  KinKind
} from '../core/types';
import { createPawnInventory, createPawnEquipment } from '../core/rules/gear/equipment';
import { drawPawnTraits, SPAWN_STAT_CAP } from '../core/gen/culture';
import {
  type Background,
  rollOrigin,
  rollBackgrounds,
  backgroundTraitAffinity,
  applyBackgroundExperience,
  backgroundPrestige
} from '../core/defs/backgrounds';
import { createBodyPlanLimbs } from '../systems/Combat';
import { DEFAULT_PLAN, PART_DEF_MAP, containedParts } from '../core/defs/bodyParts';
import { SCARRING_CONFIG, makeScarInjury } from '../core/defs/wounds';
import {
  getTraitById,
  resolveTraitGamble,
  rollFlawTrait,
  rollLineageTrait,
  seedAwakeningPaths
} from '../core/defs/lineages';
import { KIN_INVERSE } from '../core/rules/social/social';
import { itemDefById } from '../core/defs/items';
import { seedWorkLevels, rollWorkStyle } from '../core/rules/body/workExperience';
import { rng } from '../core/util/rng';
import { rollAptitudes } from '../core/rules/body/aptitudes';

let _pawnDebugIdCounter = 1;

export function resetPawnDebugIds(): void {
  _pawnDebugIdCounter = 1;
}

export function calcMaxStamina(stats: EntityStats): number {
  return 50 + (stats.constitution - 10) * 4 + (stats.dexterity - 10) * 2;
}

export function calcBloodRegenRate(stats: EntityStats): number {
  return (1.0 + (stats.constitution - 10) * 0.08) * 0.05;
}

export function calcMaxBloodVolume(physicalTraits: { weight: number }, stats: EntityStats): number {
  return Math.round(physicalTraits.weight * 1.4 + (stats.constitution - 10) * 2);
}

function maybeFlipPairedSide(partId: string): string {
  const twin = partId.startsWith('left')
    ? 'right' + partId.slice(4)
    : partId.startsWith('right')
      ? 'left' + partId.slice(5)
      : undefined;
  return twin && PART_DEF_MAP[twin] && rng.random() < 0.5 ? twin : partId;
}

export function applyTraitGrafts(pawn: Pawn): void {
  const limbs = pawn.limbs;
  if (!limbs) return;
  for (const trait of pawn.traits ?? []) {
    for (const g of trait.grafts ?? []) {
      if (limbs.some((l) => l.id === g.limb)) continue;
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

export function applyTraitWounds(pawn: Pawn, only?: Trait): void {
  const limbs = pawn.limbs;
  if (!limbs) return;
  let stamped = false;
  for (const trait of only ? [only] : (pawn.traits ?? [])) {
    for (const spec of trait.wounds ?? []) {
      const partId = maybeFlipPairedSide(spec.part);
      if (spec.amputate) {
        const limb = limbs.find((l) => l.parts?.some((p) => p.id === partId));
        if (!limb || limb.isMissing) continue;
        if (
          (limb.parts ?? []).some(
            (p) => PART_DEF_MAP[p.id]?.isVital || PART_DEF_MAP[p.id]?.isCritical
          )
        )
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
          bleeding: 0,
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
      if (!def || def.isVital || def.isCritical) continue;
      let severity = spec.severity;
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
      const baseType = spec.type ?? 'cut';
      const wound: Injury =
        severity === 'destroyed'
          ? {
              bodyPart: partId,
              type: baseType,
              severity,
              peakSeverity: severity,
              damage: Math.round(part.maxHp * SCARRING_CONFIG.damageFrac.destroyed * 10) / 10,
              bleeding: 0,
              painContribution: SCARRING_CONFIG.pain.destroyed,
              infected: false,
              clotProgress: 3,
              inflictedAt: 0,
              permanent: true
            }
          : makeScarInjury(partId, baseType, severity, part.maxHp);
      part.injuries.push(wound);
      part.health = Math.max(0, part.maxHp - wound.damage);
      if (severity === 'destroyed') part.isMissing = true;
      if (cascadeIds) {
        for (const p of limb.parts ?? []) {
          if (cascadeIds.has(p.id) && !p.isMissing) {
            p.health = 0;
            p.isMissing = true;
          }
        }
      }
      const partMaxTotal = (limb.parts ?? []).reduce((s, p) => s + p.maxHp, 0);
      const partHealthTotal = (limb.parts ?? []).reduce((s, p) => s + p.health, 0);
      if (partMaxTotal > 0) limb.health = Math.round((partHealthTotal / partMaxTotal) * 100);
      stamped = true;
    }
  }
  if (!stamped) return;
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

function traitBodyWeightDelta(traits: Trait[]): number {
  let delta = 0;
  for (const t of traits) for (const m of t.bodyMods ?? []) delta += m.weightKg ?? 0;
  return delta;
}

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
          if (full) part.health = part.maxHp;
        }
      }
    }
  }
}

export function applyGainedTrait(pawn: Pawn, trait: Trait): void {
  for (const [k, v] of Object.entries(trait.effects ?? {})) {
    if (typeof v !== 'number' || !k.endsWith('Bonus')) continue;
    const s = k.replace('Bonus', '').toLowerCase() as keyof EntityStats;
    if (pawn.stats[s] !== undefined) pawn.stats[s] = Math.max(1, pawn.stats[s] + v);
  }
  if (trait.grafts?.length) {
    applyTraitGrafts(pawn);
    for (const g of trait.grafts)
      for (const pid of g.parts) {
        const per = PART_DEF_MAP[pid]?.grants?.perceptionBonus;
        if (typeof per === 'number') pawn.stats.perception += per;
      }
  }
  if (trait.wounds?.length) applyTraitWounds(pawn, trait);
  if (trait.grafts?.some((g) => g.parts.includes('spinneret'))) pawn.silkSpinner = true;
  if (trait.bloodNeed) {
    pawn.bloodNeedKind = trait.bloodNeed;
    if (pawn.needs && pawn.needs.bloodHunger === undefined) pawn.needs.bloodHunger = 0;
  }
  for (const m of trait.bodyMods ?? []) {
    if (m.hpMult == null || m.hpMult === 1) continue;
    for (const limb of pawn.limbs ?? [])
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
        if (full) part.health = part.maxHp;
      }
  }
}

export function applyConsumable(
  pawn: Pawn,
  itemId: string,
  rand: () => number,
  durationMult = 1
): Pawn {
  const def = itemDefById(itemId);
  if (!def) return pawn;
  const next: Pawn = { ...pawn, stats: { ...pawn.stats }, traits: [...(pawn.traits ?? [])] };
  let changed = false;

  if (def.grantsConditions?.length && def.conditionDurationTurns) {
    const timers = { ...(next.conditionTimers ?? {}) };
    const duration = Math.round(def.conditionDurationTurns * durationMult);
    for (const cid of def.grantsConditions) timers[cid] = Math.max(timers[cid] ?? 0, duration);
    next.conditionTimers = timers;
    changed = true;
  }

  if (def.curesConditions?.length && next.conditionTimers) {
    const timers = { ...next.conditionTimers };
    let cured = false;
    for (const cid of def.curesConditions)
      if ((timers[cid] ?? 0) > 0) {
        delete timers[cid];
        cured = true;
      }
    if (cured) {
      next.conditionTimers = timers;
      changed = true;
    }
  }

  if (def.mendsWounds?.length && next.limbs?.length) {
    const mend = new Set(def.mendsWounds);
    let mended = false;
    const limbs = next.limbs.map((limb) => {
      const parts = limb.parts ?? [];
      if (!parts.some((p) => p.injuries.some((w) => mend.has(w.type) && !w.permanent))) return limb;
      mended = true;
      const newParts = parts.map((part) => {
        const kept = part.injuries.filter((w) => !(mend.has(w.type) && !w.permanent));
        if (kept.length === part.injuries.length) return part;
        const recovered = part.injuries.reduce(
          (s, w) => (mend.has(w.type) && !w.permanent ? s + w.damage : s),
          0
        );
        const permanentDamage = kept.reduce((s, w) => (w.permanent ? s + w.damage : s), 0);
        return {
          ...part,
          injuries: kept,
          health: Math.min(part.maxHp - permanentDamage, part.health + recovered),
          boneBroken: false
        };
      });
      return {
        ...limb,
        parts: newParts,
        bleedRate: newParts.reduce(
          (s, p) => s + p.injuries.reduce((ps, w) => ps + w.bleeding, 0),
          0
        )
      };
    });
    if (mended) {
      next.limbs = limbs;
      let painTotal = 0;
      const injuries: Injury[] = [];
      for (const l of limbs)
        for (const p of l.parts ?? [])
          for (const w of p.injuries) {
            painTotal += w.painContribution;
            injuries.push(w);
          }
      next.injuries = injuries;
      next.pain = Math.max(0, Math.min(100, Math.round(painTotal)));
      changed = true;
    }
  }

  const bake = (trait: ReturnType<typeof getTraitById> | undefined) => {
    if (trait && !next.traits.some((t) => t.id === trait.id)) {
      next.traits.push(trait);
      applyGainedTrait(next, trait);
      changed = true;
    }
  };

  if (def.grantsTraitOnConsume) {
    const trait = getTraitById(def.grantsTraitOnConsume);
    const alreadyHas = next.traits.some((t) => t.id === trait?.id);
    if (trait && !alreadyHas) {
      bake(trait);
      bake(rollFlawTrait(rand));
    }
  }

  if (def.grantsLineage) {
    const pool = Array.isArray(def.grantsLineage) ? def.grantsLineage : undefined;
    for (const t of rollLineageTrait(next, rand, pool)) bake(t);
  }

  if (def.rawConsumeRisk) {
    const { sickness, flawChance = 0 } = def.rawConsumeRisk;
    if (sickness) {
      const timers = { ...(next.conditionTimers ?? {}) };
      timers[sickness] = Math.max(timers[sickness] ?? 0, Math.round(3000 * durationMult));
      next.conditionTimers = timers;
      changed = true;
    }
    if (rand() < flawChance) bake(rollFlawTrait(rand));
  }

  if (def.traitGamble) {
    const { trait, flaw } = resolveTraitGamble(
      def.traitGamble,
      Math.min(1, durationMult - 1),
      rand
    );
    bake(trait);
    bake(flaw);
  }

  return changed ? next : pawn;
}

export interface PawnOrigin {
  homeKingdomId?: string;
  age?: number;
  childhood?: Background;
  adulthood?: Background;
}

export function buildPawnFromCulture(culture: Culture, index: number, origin?: PawnOrigin): Pawn {
  const baseStats = rollStatsFromRanges(culture.statRanges);
  const physicalTraits = rollPhysicalTraits(culture.physicalTraits);
  const affinity = origin ? backgroundTraitAffinity(origin.childhood, origin.adulthood) : undefined;
  const traits = drawPawnTraits(culture, physicalTraits, affinity);
  const finalStats = clampSpawnStats(applyCulturalTraitBonuses(baseStats, traits));
  physicalTraits.weight += traitBodyWeightDelta(traits);
  const maxBloodVolume = calcMaxBloodVolume(physicalTraits, finalStats);
  const maxStamina = calcMaxStamina(finalStats);
  const { maxStats, favStats } = rollGrowthProfile(finalStats, culture.statRanges);
  const age = origin?.age ?? rng.int(16, 45);
  const skills = origin
    ? applyBackgroundExperience(seedWorkLevels(), origin.childhood, origin.adulthood)
    : seedWorkLevels();
  const basePrestige = origin ? backgroundPrestige(origin.childhood, origin.adulthood) : 0;
  const sex: 'male' | 'female' = rng.chance(0.5) ? 'male' : 'female';

  const pawn: Pawn = {
    id: `pawn-${index}`,
    debugId: _pawnDebugIdCounter++,
    name: generatePawnName(sex),
    sex,
    stats: finalStats,
    aptitudes: rollAptitudes(physicalTraits.weight),
    maxStats,
    favStats,
    age,
    birthDayOfYear: rng.int(0, 359),
    physicalTraits,
    cultureId: culture.id,
    cultureName: culture.name,
    ...(origin?.homeKingdomId ? { homeKingdomId: origin.homeKingdomId } : {}),
    ...(origin?.childhood ? { childhoodId: origin.childhood.id } : {}),
    ...(origin?.adulthood ? { adulthoodId: origin.adulthood.id } : {}),
    ...(basePrestige > 0 ? { basePrestige } : {}),
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
    skills,
    workStyle: rollWorkStyle(),
    isAlive: true,
    maxBloodVolume,
    bloodVolume: maxBloodVolume,
    conditions: [],
    stamina: maxStamina,
    maxStamina,
    limbs: createBodyPlanLimbs(DEFAULT_PLAN, 1)
  };

  applyTraitGrafts(pawn);
  applyTraitBodyMods(pawn);
  applyTraitWounds(pawn);
  seedAwakeningPaths(pawn);
  const bloodNeed = (pawn.traits ?? []).find((t) => t.bloodNeed)?.bloodNeed;
  if (bloodNeed) {
    pawn.bloodNeedKind = bloodNeed;
    if (pawn.needs) pawn.needs.bloodHunger = 0;
  }
  if ((pawn.traits ?? []).some((t) => t.grafts?.some((g) => g.parts.includes('spinneret'))))
    pawn.silkSpinner = true;

  return pawn;
}

export function generatePawns(culture: Culture, count = 3): Pawn[] {
  return Array.from({ length: count }, (_, i) => buildPawnFromCulture(culture, i));
}

const KIN_LINK_CHANCE = 0.1;

export function rollKinWarmth(): number {
  const r = rng.random();
  if (r < 0.12) return rng.int(-70, -30);
  if (r < 0.3) return rng.int(-25, 15);
  return rng.int(30, 85);
}

export function linkStartingKin(pawns: Pawn[]): void {
  for (let i = 1; i < pawns.length; i++) {
    if (!rng.chance(KIN_LINK_CHANCE)) continue;
    const p = pawns[i];
    const candidates = pawns.slice(0, i).filter((q) => q.cultureId === p.cultureId);
    if (candidates.length === 0) continue;
    const q = rng.pick(candidates);
    const gap = Math.abs((p.age ?? 25) - (q.age ?? 25));
    let qIsToP: KinKind;
    let pIsToQ: KinKind;
    if (gap <= 12) {
      qIsToP = 'sibling';
      pIsToQ = 'sibling';
    } else if (gap >= 16) {
      const qOlder = (q.age ?? 0) > (p.age ?? 0);
      qIsToP = qOlder ? 'parent' : 'child';
      pIsToQ = qOlder ? 'child' : 'parent';
    } else {
      continue;
    }
    const familyId = q.familyId ?? `family-${q.id}`;
    q.familyId = familyId;
    p.familyId = familyId;
    const surname = q.name.split(' ').slice(-1)[0];
    const given = p.name.split(' ')[0];
    p.name = `${given} ${surname}`;
    const warmth = rollKinWarmth();
    p.kin = [...(p.kin ?? []), { pawnId: q.id, kind: qIsToP, warmth }];
    q.kin = [...(q.kin ?? []), { pawnId: p.id, kind: pIsToQ, warmth }];
  }
}

export function remapKinIds(pawns: Pawn[], idMap: Map<string, string>): void {
  for (const p of pawns) {
    if (!p.kin || p.kin.length === 0) continue;
    p.kin = p.kin
      .filter((t) => idMap.has(t.pawnId))
      .map((t) => ({ ...t, pawnId: idMap.get(t.pawnId)! }));
    if (p.kin.length === 0) {
      p.kin = undefined;
      p.familyId = undefined;
    }
  }
}

const WORLD_KIN_PLAN: { kind: KinKind; count: [number, number]; ageDelta: [number, number] }[] = [
  { kind: 'grandparent', count: [0, 1], ageDelta: [40, 56] },
  { kind: 'parent', count: [1, 2], ageDelta: [18, 30] },
  { kind: 'auntuncle', count: [0, 2], ageDelta: [18, 30] },
  { kind: 'sibling', count: [0, 2], ageDelta: [-12, 12] },
  { kind: 'cousin', count: [0, 2], ageDelta: [-12, 12] },
  { kind: 'child', count: [0, 1], ageDelta: [-30, -18] },
  { kind: 'nibling', count: [0, 1], ageDelta: [-30, -18] }
];

export function generateWorldKin(
  founders: Pawn[],
  culturePool: Culture[],
  kingdoms: Kingdom[]
): Pawn[] {
  if (culturePool.length === 0) return [];
  const world: Pawn[] = [];
  let seq = 0;
  for (let fi = 0; fi < founders.length; fi++) {
    const founder = founders[fi];
    const culture = culturePool.find((c) => c.id === founder.cultureId) ?? rng.pick(culturePool);
    const homeKingdomId =
      founder.homeKingdomId ?? (kingdoms.length > 0 ? rng.pick(kingdoms).id : undefined);
    const founderAge = founder.age ?? 30;
    const surname = founder.name.split(' ').slice(-1)[0];
    for (const plan of WORLD_KIN_PLAN) {
      let n = rng.int(plan.count[0], plan.count[1]);
      if (plan.kind === 'child' && founderAge < 30) n = 0;
      if (plan.kind === 'nibling' && founderAge < 22) n = 0;
      for (let k = 0; k < n; k++) {
        const age = founderAge + rng.int(plan.ageDelta[0], plan.ageDelta[1]);
        if (age < 1) continue;
        const id = `world-${fi}-${seq++}`;
        const kin = buildPawnFromCulture(culture, 0, { age, homeKingdomId });
        kin.id = id;
        kin.name = `${kin.name.split(' ')[0]} ${surname}`;
        const warmth = rollKinWarmth();
        founder.kin = [...(founder.kin ?? []), { pawnId: id, kind: plan.kind, warmth }];
        kin.kin = [{ pawnId: founder.id, kind: KIN_INVERSE[plan.kind], warmth }];
        world.push(kin);
      }
    }
  }
  return world;
}

export function generateColonyPawns(
  culturePool: Culture[],
  count = 5,
  opts?: { kingdoms?: Kingdom[]; founders?: boolean }
): Pawn[] {
  if (culturePool.length === 0) return [];
  const kingdoms = opts?.kingdoms;
  if (!kingdoms || kingdoms.length === 0) {
    const plain = Array.from({ length: count }, (_, i) =>
      buildPawnFromCulture(rng.pick(culturePool), i)
    );
    linkStartingKin(plain);
    return plain;
  }
  const forFounder = opts?.founders === true;
  const pawns = Array.from({ length: count }, (_, i) => {
    const { homeKingdomId, culture } = rollOrigin(culturePool, kingdoms);
    const age = rng.int(16, 45);
    const home = homeKingdomId ? kingdoms.find((k) => k.id === homeKingdomId) : undefined;
    const { childhood, adulthood } = rollBackgrounds(home, age, forFounder);
    return buildPawnFromCulture(culture, i, { homeKingdomId, age, childhood, adulthood });
  });
  linkStartingKin(pawns);
  return pawns;
}

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

    if (lowerName.startsWith('skill_')) {
      categories['Skills'].push(statName);
    } else if (
      lowerName.includes('carry') ||
      lowerName.includes('movement') ||
      lowerName.includes('swimming') ||
      lowerName.includes('vision')
    ) {
      categories['Basic Physical'].push(statName);
    } else if (
      lowerName.includes('learning') ||
      lowerName.includes('social') ||
      lowerName.includes('intuition') ||
      lowerName.includes('knowledge') ||
      lowerName.includes('experience')
    ) {
      categories['Basic Mental'].push(statName);
    } else if (
      lowerName.includes('health') ||
      lowerName.includes('disease') ||
      lowerName.includes('vitality')
    ) {
      categories['Basic Survival'].push(statName);
    } else {
      categories['Special'].push(statName);
    }
  });

  Object.keys(categories).forEach((category) => {
    if (categories[category].length === 0) {
      delete categories[category];
    }
  });

  return categories;
}

export function getStatDescription(
  statName: string,
  statData: { value: number; sources: string[] }
): string {
  const descriptions: Record<string, string> = {
    carryCapacity: 'Maximum weight that can be carried (kg)',
    movementSpeed: 'Movement points per turn',
    swimmingSpeed: 'Movement speed in water',
    visionRange: 'Maximum sight distance (meters)',

    learningSpeed: 'Multiplier for skill development',
    socialInfluence: 'Effectiveness in diplomacy and trade',
    intuition: 'Ability to detect danger and opportunities',
    knowledgeStorage: 'Capacity to store information',
    experienceGain: 'Rate of learning from practical activities',

    healthRegenRate: 'Health points recovered per turn',
    diseaseResistance: 'Resistance to illness and poison',
    vitality: 'Overall health and constitution',

    skill_mining: 'Experience in mineral extraction',
    skill_woodcutting: 'Experience in wood harvesting',
    skill_crafting: 'Experience in item creation',
    skill_hunting: 'Experience in hunting animals',
    skill_fishing: 'Experience in catching fish',
    skill_foraging: 'Experience in gathering resources',
    skill_research: 'Experience in knowledge discovery',
    skill_construction: 'Experience in building structures'
  };

  if (statName.startsWith('skill_')) {
    const skillName = statName.replace('skill_', '');
    return descriptions[statName] || `Experience in ${skillName}`;
  }

  return descriptions[statName] || 'Special stat with unique effects';
}

export const SPAWN_STAT_FLOOR = 4;

function clampSpawnStats(stats: EntityStats): EntityStats {
  const out = { ...stats } as unknown as Record<string, number>;
  for (const k of STAT_KEYS) {
    const v = out[k as string];
    if (typeof v === 'number')
      out[k as string] = Math.max(SPAWN_STAT_FLOOR, Math.min(SPAWN_STAT_CAP, Math.round(v)));
  }
  return out as unknown as EntityStats;
}

function rollStatsFromRanges(statRanges: Record<string, [number, number]>): EntityStats {
  const stats: any = {};

  Object.entries(statRanges).forEach(([statName, [min, max]]) => {
    stats[statName] = min + Math.floor(rng.random() * (max - min + 1));
  });

  return stats as EntityStats;
}

const STAT_KEYS: (keyof EntityStats)[] = [
  'strength',
  'dexterity',
  'intelligence',
  'perception',
  'charisma',
  'constitution'
];

function rollGrowthProfile(
  finalStats: EntityStats,
  statRanges: Record<string, [number, number]>
): { maxStats: EntityStats; favStats: (keyof EntityStats)[] } {
  const pool: (keyof EntityStats)[] = [];
  for (const stat of STAT_KEYS) {
    const [min, max] = statRanges[stat] ?? [10, 15];
    const weight = 1 + Math.max(0, Math.round((max - min + (max - 18)) / 3));
    for (let i = 0; i < weight; i++) pool.push(stat);
  }
  const favCount = rng.int(0, 2);
  const favStats: (keyof EntityStats)[] = [];
  let guard = 0;
  while (favStats.length < favCount && guard++ < 40) {
    const pick = rng.pick(pool);
    if (!favStats.includes(pick)) favStats.push(pick);
  }

  const maxStats = {} as EntityStats;
  for (const stat of STAT_KEYS) {
    const isFav = favStats.includes(stat);
    const base = isFav ? rng.int(50, 60) : rng.int(40, 55);
    maxStats[stat] = Math.max(base, finalStats[stat] + 15);
  }
  return { maxStats, favStats };
}

function applyCulturalTraitBonuses(baseStats: EntityStats, traits: Trait[]): EntityStats {
  const modifiedStats = { ...baseStats };

  traits.forEach((trait) => {
    Object.entries(trait.effects).forEach(([effectName, effectValue]) => {
      if (effectName.endsWith('Bonus') && typeof effectValue === 'number') {
        const statName = effectName.replace('Bonus', '').toLowerCase() as keyof EntityStats;
        if (modifiedStats[statName] !== undefined) {
          modifiedStats[statName] = Math.max(1, modifiedStats[statName] + effectValue);
        }
      }
    });
    for (const g of trait.grafts ?? [])
      for (const partId of g.parts) {
        const per = PART_DEF_MAP[partId]?.grants?.perceptionBonus;
        if (typeof per === 'number') modifiedStats.perception += per;
      }
  });

  return modifiedStats;
}

function rollPhysicalTraits(culturePhysicalTraits: any): any {
  const { heightRange, weightRange, size } = culturePhysicalTraits;

  return {
    height: heightRange[0] + Math.floor(rng.random() * (heightRange[1] - heightRange[0] + 1)),
    weight: weightRange[0] + Math.floor(rng.random() * (weightRange[1] - weightRange[0] + 1)),
    size: size
  };
}
const MALE_FIRST_NAMES = [
  'Brom',
  'Dain',
  'Finn',
  'Hale',
  'Jax',
  'Nix',
  'Pike',
  'Ren',
  'Vale',
  'Axel',
  'Clay',
  'Gage',
  'Knox',
  'Moss',
  'Onyx',
  'Storm',
  'Thorn',
  'Vex',
  'Wolf',
  'Zephyr',
  'Frost',
  'Bram',
  'Kael',
  'Doran',
  'Garrick',
  'Tomas',
  'Aldric',
  'Roderick',
  'Cael',
  'Halvard'
];

const FEMALE_FIRST_NAMES = [
  'Aria',
  'Celia',
  'Enna',
  'Greta',
  'Ivy',
  'Kira',
  'Mira',
  'Opal',
  'Thea',
  'Uma',
  'Xara',
  'Yuki',
  'Zara',
  'Dawn',
  'Luna',
  'Nova',
  'Petra',
  'Wren',
  'Elara',
  'Rowan',
  'Sylvi',
  'Maren',
  'Isolde',
  'Freya',
  'Nadia',
  'Liora',
  'Bryn',
  'Astrid',
  'Signy',
  'Wilda'
];

function generatePawnName(sex?: 'male' | 'female'): string {
  const firstNames =
    sex === 'male'
      ? MALE_FIRST_NAMES
      : sex === 'female'
        ? FEMALE_FIRST_NAMES
        : [...MALE_FIRST_NAMES, ...FEMALE_FIRST_NAMES];

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
