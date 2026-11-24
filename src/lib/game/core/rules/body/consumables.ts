import type { Injury, Pawn } from '../../types';
import { itemDefById } from '../../defs/items';
import {
  getTraitById,
  resolveTraitGamble,
  rollFlawTrait,
  rollLineageTrait
} from '../../defs/lineages';
import { applyGainedTrait } from './traitBody';

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
