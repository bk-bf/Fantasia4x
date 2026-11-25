import type { Pawn, Culture, Kingdom, KinKind } from '../types';
import { KIN_INVERSE } from '../rules/social/social';
import { rng } from '../util/rng';
import { buildPawnFromCulture } from './pawnBuild';

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
