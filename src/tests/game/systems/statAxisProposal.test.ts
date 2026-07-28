import { describe, it, expect } from 'vitest';
import { combatService } from '$lib/game/systems/Combat';
import { itemService } from '$lib/game/services/ItemService';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import {
  createBodyPlanLimbs,
  createDefaultBodyParts,
  DEFAULT_PLAN,
  organsOf,
  PART_DEF_MAP
} from '$lib/game/core/BodyParts';
import { applyGainedTrait } from '$lib/game/entities/Pawns';
import { rng } from '$lib/game/core/rng';
import itemsData from '$lib/game/database/items/items.jsonc';
import traitsData from '$lib/game/database/pawns/traits.jsonc';
import type { BodyPartId, GameState, Pawn, Trait } from '$lib/game/core/types';

/**
 * STAT-AXIS PROPOSAL — an EVALUATION harness. It changes no engine code.
 *
 * The audit found the core stats do not decide what their labels claim: AGILITY feeds melee cadence,
 * melee to-hit AND crit while a weapon's nominal `powerStat` feeds one damped damage channel, so AGILITY
 * out-earns the power stat on nearly every melee weapon. The proposal splits the two:
 *
 *   PHYSIQUE  (core stats)  — damage capacity, wield gates, stamina pool. Nothing else.
 *   APTITUDE  (rolled per pawn, independent of the core stats) — strike / cadence / precision /
 *             leverage / evasion: whether the blow lands, how often, where, and how it wrecks armour.
 *   CONDITION (capacities, unchanged) — every aptitude is scaled by the body that carries it.
 *
 * Each test states which math it drives. The DAMAGE KERNEL is always the real `resolveHit` (armour
 * soak, crit, grip, body parts, wounds); what the model owns is the terms the proposal moves —
 * to-hit, cadence and part selection. Evidence class is therefore analytical `[~]`, never headless.
 */

// The .jsonc databases are read raw here, exactly as the other audit harnesses read them.
const ITEMS = itemsData as Record<string, any>[];
const TRAITS = traitsData as Record<string, any>[];

// Combat's own constants, mirrored (module-private). `cadence parity` pins them.
const BASE_ATTACK_INTERVAL_TICKS = 120;
const MIN_ATTACK_INTERVAL_TICKS = 72;
const BASE_MELEE_HIT = 60;
const MELEE_ACCURACY_WEIGHT = 2;
const DODGE_HIT_WEIGHT = 50;
const TPS = 60;

/**
 * PROPOSED tuning. An aptitude is a multiplier around 1.0 rolled per pawn in this band — the same
 * shape a stat multiplier already has, so nothing downstream has to learn a new scale.
 */
const APT = {
  /** Roll band. Triangular, so an extreme aptitude is rare rather than one roll in three. */
  band: [0.7, 1.3] as [number, number],
  /** to-hit points per 1.0 of `strike` — the band spans ±12 against a 60 base. */
  strikeSpan: 40,
  /** Kept at Combat's current dodge weight, so defence keeps exactly the pull it has today. */
  evasionSpan: DODGE_HIT_WEIGHT,
  /** `hit_precision` at aptitude 1.0 — the baseline the stats.jsonc formula already produces at AGILITY 10. */
  precisionBase: 0.05
};

const baseStats = {
  brawn: 10,
  agility: 10,
  vigour: 10,
  intellect: 10,
  awareness: 10,
  charisma: 10
};

const fullLimbs = () =>
  (['head', 'torso', 'left_arm', 'right_arm', 'left_leg', 'right_leg'] as const).map((id) => ({
    id,
    health: 100,
    isMissing: false,
    bleedRate: 0,
    parts: createDefaultBodyParts(id)
  }));

function makePawn(over: Record<string, unknown> = {}): Pawn {
  return {
    id: 'atk',
    name: 'Subject',
    isAlive: true,
    position: { x: 5, y: 5 },
    currentState: 'Fighting',
    stats: { ...baseStats },
    traits: [],
    equipment: {},
    limbs: fullLimbs(),
    injuries: [],
    conditions: [],
    pain: 0,
    bloodVolume: 100,
    maxBloodVolume: 100,
    stamina: 500,
    maxStamina: 500,
    ...over
  } as unknown as Pawn;
}

function armed(weaponId: string, stats: Partial<typeof baseStats>, offHand?: string): Pawn {
  return makePawn({
    stats: { ...baseStats, ...stats },
    equipment: {
      mainHand: { itemId: weaponId, instanceId: 'w', durability: 999 },
      ...(offHand ? { offHand: { itemId: offHand, instanceId: 'o', durability: 999 } } : {})
    }
  });
}

/** Patch weaponProperties in the live ItemService map for the duration of `fn`, then restore. */
function withWeaponPatch<T>(patches: Record<string, Record<string, unknown>>, fn: () => T): T {
  const saved: Record<string, Record<string, unknown>> = {};
  for (const [id, fields] of Object.entries(patches)) {
    const wp = itemService.getItemById(id)?.weaponProperties as Record<string, unknown> | undefined;
    if (!wp) throw new Error('no weapon ' + id);
    saved[id] = {};
    for (const k of Object.keys(fields)) saved[id][k] = wp[k];
    Object.assign(wp, fields);
  }
  try {
    return fn();
  } finally {
    for (const [id, fields] of Object.entries(saved)) {
      const wp = itemService.getItemById(id)!.weaponProperties as Record<string, unknown>;
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) delete wp[k];
        else wp[k] = v;
      }
    }
  }
}

function dummy(kind: 'bare' | 'armoured' | 'evasive'): Pawn {
  const eq =
    kind === 'armoured'
      ? {
          bodyMid: { itemId: 'mail_hauberk', instanceId: 'a1', durability: 999 },
          headOuter: { itemId: 'iron_nasal_helm', instanceId: 'a2', durability: 999 }
        }
      : {};
  return makePawn({
    id: 'dummy',
    stats: { ...baseStats, agility: kind === 'evasive' ? 30 : 1 },
    equipment: eq
  });
}

const emptyState = { turn: 0, pawns: [], mobs: [], worldMap: [] } as unknown as GameState;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const f = (x: number, w = 6, d = 1) => x.toFixed(d).padStart(w);

/** One sample of the real damage kernel: mean damage per swing ATTEMPT, and the engine's own hit rate. */
function sample(attacker: Pawn, defender: Pawn, n = 2000, seed = 1234) {
  rng.reseed(seed);
  let dmg = 0;
  let hits = 0;
  const parts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const d = makePawn({ ...(defender as unknown as Record<string, unknown>), limbs: fullLimbs() });
    const r = combatService.resolveHit(attacker, d, emptyState);
    dmg += r.damage;
    if (r.hit) {
      hits++;
      if (r.bodyPart) parts[r.bodyPart] = (parts[r.bodyPart] ?? 0) + 1;
    }
  }
  return { perSwing: dmg / n, hitRate: hits / n, parts };
}

const swingsPerSec = (speedStat: number) =>
  TPS /
  Math.max(
    MIN_ATTACK_INTERVAL_TICKS,
    Math.round(BASE_ATTACK_INTERVAL_TICKS / Math.max(0.5, speedStat))
  );

// ── the weapon set: every tier-4 melee weapon, as the audit used ────────────────────────────────
type PowerMode = 'brawn' | 'agility' | 'awareness';
type Physique = { brawn: number; agility: number; awareness: number };
const T4 = ITEMS.filter(
  (i) => i.tier === 4 && i.weaponProperties && i.category !== 'natural_weapon'
)
  .filter((i) => (i.weaponProperties.range ?? 0) <= 1 && !i.weaponProperties.arcane)
  .map((i) => ({
    id: i.id as string,
    name: i.name as string,
    twoHanded: !!i.weaponProperties.twoHanded,
    accuracy: (i.weaponProperties.accuracy ?? 0) as number,
    attackSpeed: (i.weaponProperties.attackSpeed ?? 1) as number,
    critMod: (i.weaponProperties.critMod ?? 0) as number,
    shipped: (i.weaponProperties.powerStat ??
      (i.weaponProperties.finesse ? 'awareness' : 'brawn')) as string
  }));

const offHandFor = (w: { twoHanded: boolean; id: string }) =>
  w.twoHanded || /stiletto|rapier|dagger|dirk/.test(w.id) ? undefined : 'iron_boss_shield';

/**
 * ADOPTED weapon power mode — the GRIP decides, so the physique picks the weapon rather than the
 * build: two-handed is driven by the body (BRAWN), one-handed is placed by the hand (AGILITY), a finesse
 * thrust is placed by the eye (AWARENESS, the rapier's standing special case). Ranged is AWARENESS and an arcane
 * staff is INT; neither resolves through this melee path.
 *
 * Every melee FAMILY exists in both grips (sword · axe · mace/hammer · cleaver · spear/pole), so no
 * physique is locked out of a family — it just takes the other version of it. Flail is the one gap:
 * 1H only, so a strong pawn currently has no flail.
 */
function proposedMode(w: (typeof T4)[number]): PowerMode {
  if (w.shipped === 'awareness') return 'awareness'; // finesse — the rapier line
  return w.twoHanded ? 'brawn' : 'agility';
}

const effectivePower = (mode: PowerMode, phys: Physique) =>
  mode === 'brawn' ? phys.brawn : mode === 'agility' ? phys.agility : phys.awareness;

// ── the two models ──────────────────────────────────────────────────────────────────────────────

/** SHIPPED: the engine decides everything — damage, to-hit, crit and cadence all from the core stats. */
function dpsShipped(w: (typeof T4)[number], stats: Partial<typeof baseStats>, target: Pawn) {
  const a = armed(w.id, stats, offHandFor(w));
  const s = sample(a, target);
  return s.perSwing * swingsPerSec(pawnStatService.evaluateStat('attack_speed', a));
}

/**
 * PROPOSED: the real kernel supplies damage per LANDED hit with the core stats reduced to a single
 * power channel (AGILITY pinned to baseline so its parasitic to-hit/crit channels are inert, the weapon's
 * power routed through `brawn`, and its crit re-based on the `precision` aptitude). To-hit and
 * cadence are then the proposed aptitude terms.
 */
function dpsProposed(
  w: (typeof T4)[number],
  phys: Physique,
  apt: { strike: number; cadence: number; precision: number },
  target: Pawn,
  targetEvasion = 1.0
) {
  const mode = proposedMode(w);
  const power = effectivePower(mode, phys);
  return withWeaponPatch(
    {
      [w.id]: {
        powerStat: 'brawn',
        critMod: w.critMod + APT.precisionBase * (apt.precision - 1)
      }
    },
    () => {
      const a = armed(w.id, { brawn: power, agility: 10 }, offHandFor(w));
      const s = sample(a, target);
      const perLanded = s.hitRate > 0 ? s.perSwing / s.hitRate : 0;
      const toHit =
        clamp(
          BASE_MELEE_HIT +
            (apt.strike - 1) * APT.strikeSpan +
            w.accuracy * MELEE_ACCURACY_WEIGHT -
            (targetEvasion - 1) * APT.evasionSpan,
          5,
          95
        ) / 100;
      return perLanded * toHit * swingsPerSec(apt.cadence * w.attackSpeed);
    }
  );
}

const FLAT = { strike: 1, cadence: 1, precision: 1 };

describe('STAT AXIS — the landed two-axis split', () => {
  it('cadence parity: the mirrored constants still match the engine', () => {
    // LANDED (task 9): the stat is the rolled `attack_speed` APTITUDE × capacities, folding in the
    // equipped weapon's own attackSpeed. A core stat moves it not at all.
    const w = T4.find((x) => x.id === 'rune_sung_greatsword')!;
    const p = armed(w.id, { agility: 30 });
    expect(pawnStatService.evaluateStat('attack_speed', p)).toBeCloseTo(w.attackSpeed, 5);
    expect(swingsPerSec(1)).toBeCloseTo(TPS / BASE_ATTACK_INTERVAL_TICKS, 5);
  });

  it('LANDED — a weapon’s own power stat IS its best stat', () => {
    const t = dummy('armoured');
    const rows: string[] = [
      '[SHIPPED] the named power stat raised to 40 vs the rival stat raised to 40'
    ];
    rows.push('weapon                          power  grip    own-stat   rival    verdict');
    const lost: string[] = [];
    for (const w of T4) {
      const rival = w.shipped === 'brawn' ? 'agility' : 'brawn';
      const own = dpsShipped(w, { [w.shipped]: 40 }, t);
      const alt = dpsShipped(w, { [rival]: 40 }, t);
      const bad = alt > own;
      if (bad) lost.push(w.id);
      rows.push(
        w.name.slice(0, 28).padEnd(30) +
          w.shipped.slice(0, 3).toUpperCase().padEnd(7) +
          (w.twoHanded ? '2H' : '1H').padEnd(6) +
          f(own, 8) +
          f(alt, 9) +
          '   ' +
          (bad ? `← ${rival.slice(0, 3).toUpperCase()} WINS` : 'ok')
      );
    }
    const twoH = T4.filter((w) => w.twoHanded);
    const lostTwoH = lost.filter((id) => twoH.some((w) => w.id === id));
    rows.push(
      `the named power stat loses on ${lost.length} of ${T4.length} weapons — ` +
        `${lostTwoH.length} of ${twoH.length} two-handers, ${lost.length - lostTwoH.length} of ${T4.length - twoH.length} one-handers`
    );
    console.log(rows.join('\n'));
    // LANDED (tasks 3–5, 9). Before the decoupling AGILITY out-earned BRAWN on 6 of the 8 two-handers —
    // exactly the weapons BRAWN is supposed to own — because it bought cadence, to-hit and crit on top
    // of its own damage. It buys none of those now, so every weapon answers to the stat it names.
    expect(lost.length, "the weapon's own power stat is its best stat").toBe(0);
    expect(lostTwoH.length).toBe(0);
  });

  it('ADOPTED — the grip decides which physique wins', () => {
    const t = dummy('armoured');
    const rows: string[] = [
      '[ADOPTED] identical aptitudes (all 1.0); one physique stat at 40, the rest at 10'
    ];
    rows.push(
      'weapon                          grip  mode         STRONG    NIMBLE      KEEN   winner'
    );
    const tally: Record<string, number> = {};
    let correct = 0;
    for (const w of T4) {
      const mode = proposedMode(w);
      tally[mode] = (tally[mode] ?? 0) + 1;
      const strong = dpsProposed(w, { brawn: 40, agility: 10, awareness: 10 }, FLAT, t);
      const nimble = dpsProposed(w, { brawn: 10, agility: 40, awareness: 10 }, FLAT, t);
      const keen = dpsProposed(w, { brawn: 10, agility: 10, awareness: 40 }, FLAT, t);
      const best = [
        ['STRONG', strong],
        ['NIMBLE', nimble],
        ['KEEN', keen]
      ].sort((a, b) => (b[1] as number) - (a[1] as number))[0][0] as string;
      const want = mode === 'brawn' ? 'STRONG' : mode === 'agility' ? 'NIMBLE' : 'KEEN';
      if (best === want) correct++;
      rows.push(
        w.name.slice(0, 28).padEnd(30) +
          (w.twoHanded ? '2H' : '1H').padEnd(6) +
          mode.padEnd(12) +
          f(strong, 7) +
          f(nimble, 10) +
          f(keen, 10) +
          '   ' +
          best
      );
    }
    rows.push(
      `modes: ${JSON.stringify(tally)} — ${correct}/${T4.length} answer to the physique their grip names`
    );
    console.log(rows.join('\n'));
    // Every weapon answers to the stat its GRIP names, and to no other.
    expect(correct).toBe(T4.length);
  });

  it('PROPOSAL — a stat point can no longer be spent on the wrong weapon', () => {
    // The specific inversion from the audit: the warhammer and the greatsword are BRAWN weapons that
    // used to pay MORE for AGILITY. A nimble pawn now gains nothing from them.
    const t = dummy('armoured');
    const rows = [
      '[INVERSION] the two weapons the audit named',
      'weapon                        shipped BRAWN/AGILITY     proposed STRONG/NIMBLE'
    ];
    for (const id of ['rune_weighted_warhammer', 'rune_sung_greatsword']) {
      const w = T4.find((x) => x.id === id)!;
      const sStr = dpsShipped(w, { brawn: 40 }, t);
      const sDex = dpsShipped(w, { agility: 40 }, t);
      const pStr = dpsProposed(w, { brawn: 40, agility: 10, awareness: 10 }, FLAT, t);
      const pDex = dpsProposed(w, { brawn: 10, agility: 40, awareness: 10 }, FLAT, t);
      rows.push(
        w.name.padEnd(30) + f(sStr) + ' /' + f(sDex) + '       ' + f(pStr) + ' /' + f(pDex)
      );
      expect(sStr).toBeGreaterThan(sDex); // LANDED: the two-hander answers to brawn
      expect(pStr).toBeGreaterThan(pDex); // …and the model agrees
    }
    console.log(rows.join('\n'));
  });

  it('PROPOSAL — aptitude is a second, independent axis (the combinations the design wants)', () => {
    const t = dummy('armoured');
    const w = T4.find((x) => x.id === 'rune_graven_spear')!;
    const cases: [string, Physique, typeof FLAT][] = [
      [
        'gifted, skilled',
        { brawn: 10, agility: 40, awareness: 10 },
        { strike: 1.25, cadence: 1.2, precision: 1.2 }
      ],
      [
        'gifted, clumsy',
        { brawn: 10, agility: 40, awareness: 10 },
        { strike: 0.75, cadence: 0.8, precision: 0.8 }
      ],
      [
        'modest, skilled',
        { brawn: 10, agility: 16, awareness: 10 },
        { strike: 1.25, cadence: 1.2, precision: 1.2 }
      ],
      ['average', { brawn: 10, agility: 25, awareness: 10 }, FLAT]
    ];
    const rows = [
      '[APTITUDE AXIS] rune-graven spear vs an armoured target',
      'pawn                 dps    vs average'
    ];
    const avg = dpsProposed(w, cases[3][1], cases[3][2], t);
    const out: Record<string, number> = {};
    for (const [label, phys, apt] of cases) {
      const d = dpsProposed(w, phys, apt, t);
      out[label] = d;
      rows.push(label.padEnd(20) + f(d) + f((d / avg - 1) * 100, 10) + '%');
    }
    console.log(rows.join('\n'));
    // A big physique with a bad roll must be beatable by a modest physique with a good one — that is
    // what makes the second axis a real axis rather than a rounding error.
    expect(out['modest, skilled']).toBeGreaterThan(out['gifted, clumsy']);
    // …but the strong pawn who ALSO rolled well must still be the best. Aptitude tilts, never replaces.
    expect(out['gifted, skilled']).toBeGreaterThan(out['modest, skilled']);
  });

  it('ADOPTED — every melee family stays open to BOTH physiques, via the other grip', () => {
    // The design claim to check: locking damage to the grip does NOT lock a physique out of a weapon
    // family, because each family ships in both grips. A strong pawn takes the family's two-hander,
    // a nimble pawn its one-hander, and both are worth playing.
    const t = dummy('armoured');
    const family = (id: string) =>
      /flail/.test(id)
        ? 'flail'
        : /cleaver/.test(id)
          ? 'cleaver'
          : /axe/.test(id)
            ? 'axe'
            : /hammer|maul|mace|club/.test(id)
              ? 'mace/hammer'
              : /spear|pike|halberd|glaive/.test(id)
                ? 'spear/pole'
                : /sword/.test(id)
                  ? 'sword'
                  : /rapier|stiletto|dagger/.test(id)
                    ? 'light blade'
                    : 'other';
    const byFamily: Record<string, { one?: (typeof T4)[number]; two?: (typeof T4)[number] }> = {};
    for (const w of T4) {
      const fam = (byFamily[family(w.id)] ??= {});
      if (w.twoHanded) fam.two ??= w;
      else fam.one ??= w;
    }
    const rows = [
      '[FAMILY REACH] STRONG (40 BRAWN) on the 2H version vs NIMBLE (40 AGILITY) on the 1H version',
      'family         2H weapon → STRONG    1H weapon → NIMBLE    ratio'
    ];
    const gaps: string[] = [];
    const ratios: [string, number][] = [];
    for (const [fam, pair] of Object.entries(byFamily)) {
      if (fam === 'other') continue;
      if (!pair.one || !pair.two) {
        gaps.push(`${fam} (${pair.one ? 'no 2H' : 'no 1H'})`);
        continue;
      }
      const strong = dpsProposed(pair.two, { brawn: 40, agility: 10, awareness: 10 }, FLAT, t);
      const nimble = dpsProposed(pair.one, { brawn: 10, agility: 40, awareness: 10 }, FLAT, t);
      rows.push(fam.padEnd(15) + f(strong, 18) + f(nimble, 22) + f(strong / nimble, 9, 2) + '×');
      ratios.push([fam, Math.max(strong, nimble) / Math.min(strong, nimble)]);
    }
    rows.push(`single-grip families (one physique has no entry): ${gaps.join(', ') || 'none'}`);
    console.log(rows.join('\n'));
    const meanRatio = ratios.reduce((a, [, r]) => a + r, 0) / ratios.length;
    const worst = ratios.slice().sort((a, b) => b[1] - a[1])[0];
    console.log(
      `  mean 2H÷1H ${meanRatio.toFixed(2)}× (one-hander at ${((1 / meanRatio) * 100).toFixed(0)}% of a two-hander; ` +
        `design target 60%). Widest: ${worst[0]} at ${worst[1].toFixed(2)}× — the warhammer line is out of band, task 14.`
    );
    // COMBAT-BALANCE task 12: the two-hander is MEANT to lead. A one-hander is the defensive choice
    // (shield up, ~60% of the damage) and buys the difference back with the duel grip, which is
    // trait-gated. So the check is direction + magnitude, not parity.
    for (const [fam, r] of ratios)
      expect(r, `${fam}: the two-hander must lead its one-handed sibling`).toBeGreaterThan(1);
    expect(1 / meanRatio, 'one-hander should sit near 60% of a two-hander').toBeGreaterThan(0.5);
    expect(1 / meanRatio, 'one-hander should sit near 60% of a two-hander').toBeLessThan(0.72);
    // LANDED (task 7): the flail line gained `rune_lashing_greatflail`, so no SWUNG family is
    // single-grip any more. Only the light blades remain 1H-only, which is what they are.
    expect(gaps).not.toContain('flail (no 2H)');
    expect(gaps.filter((g) => !g.startsWith('light blade'))).toEqual([]);
  });

  it('PRECISION (real engine) — high precision makes a dagger hunt EXTREMITIES', () => {
    // COMBAT-BALANCE #4's open checkbox: instrument which part a dagger actually lands on.
    const t = dummy('armoured');
    const rows = [
      '[LANDED PART] rune-slotted stiletto vs mail hauberk + nasal helm, real resolveHit'
    ];
    const dist: Record<string, Record<string, number>> = {};
    for (const dex of [10, 60]) {
      const s = sample(armed('rune_slotted_stiletto', { brawn: 20, agility: dex }), t, 3000);
      const total = Object.values(s.parts).reduce((a, c) => a + c, 0);
      const top = Object.entries(s.parts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([p, n]) => `${p} ${Math.round((n / total) * 100)}%`);
      dist['dex' + dex] = s.parts;
      const lethalShare = lethalHitShare(s.parts);
      rows.push(
        `AGILITY ${String(dex).padStart(2)} (precision ${f(pawnStatService.evaluateStat('hit_precision', armed('rune_slotted_stiletto', { agility: dex })), 5, 3)})  ` +
          `vital-part share ${f(lethalShare * 100, 5)}%   ${top.join(' · ')}`
      );
    }
    console.log(rows.join('\n'));
    // The bug: raising precision does NOT raise the share of blows landing somewhere that can kill.
    expect(lethalHitShare(dist.dex60)).toBeLessThanOrEqual(lethalHitShare(dist.dex10) + 0.02);
  });

  it('PRECISION FIX (model) — search for LETHALITY, discounted by armour, and scale the search with the aptitude', () => {
    /**
     * Two changes, modelled over the real anatomy:
     *   1. score a candidate by what it CONTAINS (carotid, heart, brain) and how hard it bleeds,
     *      with armour as a DISCOUNT rather than the whole criterion. Dividing by armour outright is
     *      what sends the blow to a leg: on an armoured target the lethal parts ARE the covered ones.
     *   2. let the aptitude buy CANDIDATES. The shipped rule always rolls 3 and gates on a probability,
     *      so a small target (the neck is 1.5% of the hit table) is almost never found however precise
     *      the fighter is.
     */
    const armour: Record<string, number> = { head: 6, chest: 8, abdomen: 8 }; // mail + helm, as the dummy wears
    const rollable = ROLLABLE();
    const ARMOUR_DISCOUNT = 0.15; // how much one point of armour discounts a part's worth
    const CANDIDATE_SPAN = 8; // extra candidate rolls bought by a full point of precision
    /** Fractional so precision pays SMOOTHLY — an integer count would flatten the whole upper band. */
    const candidatesFor = (p: number) => {
      const exact = 1 + p * CANDIDATE_SPAN;
      const floor = Math.floor(exact);
      return rng.random() < exact - floor ? floor + 1 : floor;
    };

    const pick = (rule: 'shipped' | 'proposed', precision: number, rolls = 20000) => {
      const counts: Record<string, number> = {};
      rng.reseed(99);
      for (let i = 0; i < rolls; i++) {
        let best = rollPart(rollable);
        // Shipped gates the whole search on one probability roll against hit_precision, then takes
        // the least-armoured of exactly 3.
        if (rule === 'shipped' && rng.random() >= precision) {
          counts[best] = (counts[best] ?? 0) + 1;
          continue;
        }
        const worth = (p: string) =>
          rule === 'shipped'
            ? -(armour[p] ?? 0)
            : lethality(p) / (1 + (armour[p] ?? 0) * ARMOUR_DISCOUNT);
        const n = rule === 'shipped' ? 3 : candidatesFor(precision);
        for (let k = 1; k < n; k++) {
          const cand = rollPart(rollable);
          if (worth(cand) > worth(best)) best = cand;
        }
        counts[best] = (counts[best] ?? 0) + 1;
      }
      return counts;
    };

    // The same three precision VALUES the real engine produced in the test above (AGILITY 10 → 0.053,
    // mid, AGILITY 60 → 0.317), so the two rules are compared at equal effect brawn.
    const LEVELS = [0.05, 0.18, 0.32];
    const rows = [
      '[SELECTION RULE] armoured torso + head; share of blows landing somewhere that can kill'
    ];
    rows.push('rule        precision   mean cands   vital share   top parts');
    const res: Record<string, number[]> = { shipped: [], proposed: [] };
    for (const rule of ['shipped', 'proposed'] as const) {
      for (const precision of LEVELS) {
        const c = pick(rule, precision);
        const total = Object.values(c).reduce((a, b) => a + b, 0);
        const share = lethalHitShare(c);
        res[rule].push(share);
        const top = Object.entries(c)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([p, n]) => `${p} ${Math.round((n / total) * 100)}%`);
        rows.push(
          rule.padEnd(12) +
            f(precision, 6, 2) +
            f(rule === 'shipped' ? 3 : 1 + precision * CANDIDATE_SPAN, 12, 1) +
            f(share * 100, 13) +
            '%   ' +
            top.join(' · ')
        );
      }
    }
    console.log(rows.join('\n'));
    // Shipped: more precision does NOT buy more killing hits (it buys uncovered extremities).
    expect(res.shipped[2]).toBeLessThanOrEqual(res.shipped[0]);
    // Proposed: it does, monotonically, and the worst roll still beats the shipped best.
    expect(res.proposed[1]).toBeGreaterThan(res.proposed[0]);
    expect(res.proposed[2]).toBeGreaterThan(res.proposed[1]);
    expect(res.proposed[0]).toBeGreaterThan(Math.max(...res.shipped));
  });

  it('SIGNED STAT GRANTS — a flaw lowers its stat, through the real bake path', () => {
    // LANDED (task 1): every `*Penalty` key was re-authored as a negative `*Bonus` and both bake paths
    // collapsed to one signed add. This pins the corrected behaviour.
    const leftovers = TRAITS.filter((t) =>
      Object.keys(t.effects ?? {}).some((k) => k.endsWith('Penalty'))
    );
    const negatives = TRAITS.filter((t) =>
      Object.entries(t.effects ?? {}).some(([k, v]) => k.endsWith('Bonus') && (v as number) < 0)
    );
    const rows = [
      `[SIGNED GRANTS] ${leftovers.length} traits still author a *Penalty; ${negatives.length} author a negative *Bonus`
    ];
    for (const t of negatives.slice(0, 3)) {
      const now = makePawn();
      applyGainedTrait(now, t as Trait);
      const key = Object.keys(t.effects).find(
        (k) => k.endsWith('Bonus') && (t.effects[k] as number) < 0
      )!;
      const stat = key.replace('Bonus', '').toLowerCase() as keyof typeof baseStats;
      rows.push(
        `${String(t.id).padEnd(24)} ${key.padEnd(20)} ${String(t.effects[key]).padStart(3)}  →  ${stat} ${baseStats[stat]} → ${now.stats[stat]}`
      );
      expect(now.stats[stat]).toBeLessThan(baseStats[stat]);
    }
    console.log(rows.join('\n'));
    expect(leftovers.length).toBe(0);
  });
});

// ── anatomy helpers (real part data) ────────────────────────────────────────────────────────────

/**
 * How much a hit here can contribute to a kill: what the part CONTAINS (a rolled external part never
 * carries `isVital` itself — the carotid is inside the neck, the heart inside the chest) plus how
 * hard it bleeds. A hand contains nothing and bleeds little; the neck is an artery under thin cover.
 */
function lethality(partId: string): number {
  const def = PART_DEF_MAP[partId as BodyPartId];
  if (!def) return 1;
  let score = 1 + def.bleedRatio * 6;
  for (const organ of organsOf(partId as BodyPartId)) {
    const o = PART_DEF_MAP[organ];
    if (o?.isCritical) score += 2.5;
    else if (o?.isVital) score += 2;
    if (o?.artery) score += 1.5;
  }
  return score;
}
const VITAL_PARTS = new Set(['head', 'neck', 'chest', 'abdomen', 'groin']);
function lethalHitShare(counts: Record<string, number>): number {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let v = 0;
  for (const [p, n] of Object.entries(counts)) if (VITAL_PARTS.has(p)) v += n;
  return v / total;
}
/**
 * The HUMANOID plan's externally-strikable parts with their roll weights. Scoped to the plan on
 * purpose: `PART_DEF_MAP` is the catalogue for every body in the game, so an unscoped table would
 * roll wings and tails and drown the humanoid vitals.
 */
function ROLLABLE(): [string, number][] {
  const out: [string, number][] = [];
  for (const limb of createBodyPlanLimbs(DEFAULT_PLAN)) {
    for (const part of limb.parts ?? []) {
      const def = PART_DEF_MAP[part.id];
      if (def && def.hitWeight > 0) out.push([def.id as string, def.hitWeight]);
    }
  }
  return out;
}
function rollPart(table: [string, number][]): string {
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = rng.random() * total;
  for (const [id, w] of table) {
    r -= w;
    if (r <= 0) return id;
  }
  return table[0][0];
}
