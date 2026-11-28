import type { EntityStats, Injury, Pawn, Trait } from '../../types';
import { PART_DEF_MAP, containedParts } from '../../defs/bodyParts';
import { SCARRING_CONFIG, makeScarInjury } from '../../defs/wounds';
import { rng } from '../../util/rng';

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

export function traitBodyWeightDelta(traits: Trait[]): number {
  let delta = 0;
  for (const t of traits) for (const m of t.bodyMods ?? []) delta += m.weightKg ?? 0;
  return delta;
}

type Limbs = NonNullable<Pawn['limbs']>;
type BodyMod = NonNullable<Trait['bodyMods']>[number];

function scalePartsHp(limbs: Limbs, m: BodyMod): void {
  if (m.hpMult == null || m.hpMult === 1) return;
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

export function applyTraitBodyMods(pawn: Pawn): void {
  const limbs = pawn.limbs;
  if (!limbs) return;
  for (const trait of pawn.traits ?? [])
    for (const m of trait.bodyMods ?? []) scalePartsHp(limbs, m);
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
  for (const m of trait.bodyMods ?? []) scalePartsHp(pawn.limbs ?? [], m);
}
