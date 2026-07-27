import { describe, it, expect } from 'vitest';
import { combatService } from '$lib/game/systems/Combat';
import { itemService } from '$lib/game/services/ItemService';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { createDefaultBodyParts } from '$lib/game/core/BodyParts';
import { rng } from '$lib/game/core/rng';
import type { GameState, Pawn } from '$lib/game/core/types';

/**
 * BALANCE SWEEP — what each combat stat is actually worth, per weapon, in damage per second.
 *
 * Drives the real `combatService.resolveHit` (armour soak, body parts, crit, grip, wounds) and the
 * real cadence path (`attack_speed` stat → Combat's clamped attack interval). Nothing is re-derived
 * here: the only arithmetic this file owns is dps = mean damage per swing × swings per second.
 *
 * It exists to answer one question: does a stat investment blur the lines between weapon classes —
 * can a high-DEX pawn make a two-hander behave like a duelist's blade, or vice versa?
 */

// Combat's cadence constants, mirrored (they are module-private). Kept in sync by `cadence caps`.
const BASE_ATTACK_INTERVAL_TICKS = 120;
const MIN_ATTACK_INTERVAL_TICKS = 72;
const TPS = 60;

const baseStats = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  perception: 10,
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

/** Overrides are a loose bag so a test can stamp equipment slots the Pawn type keys strictly. */
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

/** Attacker holding `weaponId`. `offHand` controls the GRIP: a shield (1H+shield), nothing (duelist)
 *  or undefined for a two-hander, which takes the twoHanded grip from the weapon itself. */
function armed(weaponId: string, stats: Partial<typeof baseStats>, offHand?: string): Pawn {
  return makePawn({
    stats: { ...baseStats, ...stats },
    equipment: {
      mainHand: { itemId: weaponId, instanceId: 'w', durability: 999 },
      ...(offHand ? { offHand: { itemId: offHand, instanceId: 'o', durability: 999 } } : {})
    }
  });
}

/**
 * Temporarily patch an item's weaponProperties in the live ItemService map, run `fn`, restore. Used
 * to price a PROPOSED change against the shipped numbers in the same run, without touching the data.
 */
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

/** Debug targets: a bare dummy, a mail-clad dummy, and an evasive dummy. All DEX-controlled. */
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
    stats: { ...baseStats, dexterity: kind === 'evasive' ? 30 : 1 },
    equipment: eq
  });
}

const emptyState = { turn: 0, pawns: [], mobs: [], worldMap: [] } as unknown as GameState;

/** Swings per second at this pawn's cadence, through Combat's real clamp. */
function swingsPerSec(pawn: Pawn): number {
  const speed = Math.max(0.5, pawnStatService.evaluateStat('attack_speed', pawn));
  const interval = Math.max(
    MIN_ATTACK_INTERVAL_TICKS,
    Math.round(BASE_ATTACK_INTERVAL_TICKS / speed)
  );
  return TPS / interval;
}

/** Mean damage per swing ATTEMPT (misses count as 0) over `n` reseeded swings, and the hit rate. */
function sample(attacker: Pawn, defender: Pawn, n = 3000, seed = 1234) {
  rng.reseed(seed);
  let dmg = 0;
  let hits = 0;
  let stam = 0;
  for (let i = 0; i < n; i++) {
    const d = makePawn({ ...(defender as unknown as Record<string, unknown>), limbs: fullLimbs() });
    const r = combatService.resolveHit(attacker, d, emptyState);
    dmg += r.damage;
    stam += r.staminaCost ?? 0;
    if (r.hit) hits++;
  }
  return { perSwing: dmg / n, hitRate: hits / n, stamPerSwing: stam / n };
}

function dps(weaponId: string, stats: Partial<typeof baseStats>, target: Pawn, offHand?: string) {
  const a = armed(weaponId, stats, offHand);
  const s = sample(a, target);
  const sps = swingsPerSec(a);
  return {
    dps: s.perSwing * sps,
    perSwing: s.perSwing,
    hitRate: s.hitRate,
    sps,
    stamPerSec: s.stamPerSwing * sps
  };
}

const f = (x: number, w = 6, d = 1) => x.toFixed(d).padStart(w);

// The steel band is the only age where every family is populated, so the matrix uses it.
const STEEL = [
  { id: 'steel_stiletto', label: 'stiletto (dagger)', off: undefined },
  { id: 'steel_rapier', label: 'rapier (finesse)', off: undefined },
  { id: 'steel_boar_spear', label: 'boar-spear 1H', off: 'iron_boss_shield' },
  { id: 'steel_longsword', label: 'longsword 1H', off: 'iron_boss_shield' },
  { id: 'steel_broadaxe', label: 'broadaxe 1H', off: 'iron_boss_shield' },
  { id: 'steel_mace', label: 'mace 1H', off: 'iron_boss_shield' },
  { id: 'steel_flail', label: 'flail 1H', off: 'iron_boss_shield' },
  { id: 'steel_cleaver', label: 'cleaver 1H', off: 'iron_boss_shield' },
  { id: 'steel_pike', label: 'pike 2H', off: undefined },
  { id: 'steel_greatsword', label: 'greatsword 2H', off: undefined },
  { id: 'steel_greataxe', label: 'greataxe 2H', off: undefined },
  { id: 'steel_warhammer', label: 'warhammer 2H', off: undefined },
  { id: 'steel_greatcleaver', label: 'greatcleaver 2H', off: undefined },
  { id: 'steel_shod_longstaff', label: 'longstaff 2H', off: undefined }
];

describe('weapon × stat sweep (real resolveHit + real cadence)', () => {
  it('cadence caps: attack_speed stops paying past the interval floor', () => {
    // The clamp the whole audit turns on. A 1.5-speed dagger is already at the ceiling by DEX 14; a
    // 0.7-speed greatsword keeps converting DEX into swings until DEX ~56.
    const rows: string[] = [];
    for (const dex of [10, 14, 20, 30, 45, 60]) {
      const fast = swingsPerSec(armed('steel_stiletto', { dexterity: dex }));
      const slow = swingsPerSec(armed('steel_greatsword', { dexterity: dex }));
      rows.push(`DEX ${String(dex).padStart(2)}  dagger ${f(fast, 5, 2)}/s  greatsword ${f(slow, 5, 2)}/s`);
    }
    console.log('[CADENCE]\n' + rows.join('\n'));
    // Ceiling is shared, and the dagger reaches it while the greatsword is still climbing.
    const capped = TPS / MIN_ATTACK_INTERVAL_TICKS;
    expect(swingsPerSec(armed('steel_stiletto', { dexterity: 14 }))).toBeCloseTo(capped, 2);
    expect(swingsPerSec(armed('steel_greatsword', { dexterity: 45 }))).toBeLessThan(capped);
  });

  it('DPS matrix by DEX (STR fixed at 20) — bare, armoured and evasive targets', () => {
    for (const kind of ['bare', 'armoured', 'evasive'] as const) {
      const t = dummy(kind);
      const lines = [`[DPS vs ${kind}]  STR 20, DEX sweep      DEX10   DEX20   DEX30   DEX45   DEX60`];
      for (const w of STEEL) {
        const cells = [10, 20, 30, 45, 60]
          .map((dexterity) => f(dps(w.id, { strength: 20, dexterity }, t, w.off).dps, 7))
          .join(' ');
        lines.push(w.label.padEnd(20) + cells);
      }
      console.log(lines.join('\n'));
    }
    expect(true).toBe(true);
  });

  it('DPS matrix by STR (DEX fixed at 20)', () => {
    const t = dummy('armoured');
    const lines = [`[DPS vs armoured]  DEX 20, STR sweep   STR10   STR20   STR30   STR45   STR60`];
    for (const w of STEEL) {
      const cells = [10, 20, 30, 45, 60]
        .map((strength) => f(dps(w.id, { strength, dexterity: 20 }, t, w.off).dps, 7))
        .join(' ');
      lines.push(w.label.padEnd(20) + cells);
    }
    console.log(lines.join('\n'));
    expect(true).toBe(true);
  });

  it('what one stat point buys: marginal DPS per point of DEX vs per point of STR', () => {
    const t = dummy('armoured');
    const lines = ['[MARGINAL] dps gained per +10 stat, from a 20/20 baseline'];
    lines.push('weapon                 +10 DEX   +10 STR   ratio');
    for (const w of STEEL) {
      const base = dps(w.id, { strength: 20, dexterity: 20 }, t, w.off).dps;
      const dDex = dps(w.id, { strength: 20, dexterity: 30 }, t, w.off).dps - base;
      const dStr = dps(w.id, { strength: 30, dexterity: 20 }, t, w.off).dps - base;
      lines.push(
        w.label.padEnd(22) + f(dDex, 8) + f(dStr, 10) + f(dStr > 0.01 ? dDex / dStr : 99, 8, 2)
      );
    }
    console.log(lines.join('\n'));
    expect(true).toBe(true);
  });

  it('class identity holds: armour is what separates the families, not throughput', () => {
    // The design contract: a dagger is a soft-target weapon. Whatever its dps against bare flesh, a
    // mailed target must blunt it far harder than it blunts an armour weapon (mace/hammer).
    const bare = dummy('bare');
    const mail = dummy('armoured');
    const stats = { strength: 25, dexterity: 25 };
    const keep = (id: string, off?: string) =>
      dps(id, stats, mail, off).dps / Math.max(0.01, dps(id, stats, bare, off).dps);

    const dagger = keep('steel_stiletto');
    const mace = keep('steel_mace', 'iron_boss_shield');
    const hammer = keep('steel_warhammer');
    const cleaver = keep('steel_cleaver', 'iron_boss_shield');
    console.log(
      `[VS MAIL] fraction of bare-flesh dps kept — dagger ${(dagger * 100).toFixed(0)}%  cleaver ${(cleaver * 100).toFixed(0)}%  mace ${(mace * 100).toFixed(0)}%  warhammer ${(hammer * 100).toFixed(0)}%`
    );
    expect(hammer, 'a warhammer keeps more of its damage through mail than a dagger').toBeGreaterThan(dagger);
    expect(mace, 'a mace keeps more of its damage through mail than a cleaver').toBeGreaterThan(cleaver);
  });

  it('finesse and arcane scale on their OWN stat, at the same slope as STR', () => {
    // The STR sweep leaves a rapier flat, which reads like a dead weapon until you sweep PER instead:
    // resolveHit takes `powerStat` from the weapon (STR / PER for finesse / INT for arcane), so each
    // scales identically on its own axis. Its damage number is the only difference.
    const t = dummy('bare');
    const lines = ['[POWER STAT] each weapon swept on the stat it actually scales with'];
    lines.push('weapon                stat      10      20      30      45      60');
    const trio: [string, string, keyof typeof baseStats, string | undefined][] = [
      ['steel_longsword', 'longsword', 'strength', 'iron_boss_shield'],
      ['steel_rapier', 'rapier', 'perception', undefined],
      ['stormglass_scepter', 'stormglass rod', 'intelligence', 'iron_boss_shield']
    ];
    for (const [id, label, stat, off] of trio) {
      const cells = [10, 20, 30, 45, 60]
        .map((v) => f(dps(id, { dexterity: 20, [stat]: v } as Partial<typeof baseStats>, t, off).dps))
        .join(' ');
      lines.push(label.padEnd(18) + stat.slice(0, 3).toUpperCase().padEnd(6) + cells);
    }
    console.log(lines.join('\n'));
    // Each triples-and-more on its own stat: the finesse/arcane path is not a weaker slope, just a
    // different axis. (Ranged/channeled weapons resolve through the melee path here, at reach.)
    const lo = dps('steel_rapier', { perception: 10, dexterity: 20 }, t).dps;
    const hi = dps('steel_rapier', { perception: 60, dexterity: 20 }, t).dps;
    expect(hi / lo).toBeGreaterThan(3);
  });

  it('the damage term is LINEAR and UNCAPPED in the power stat, unlike cadence', () => {
    // resolveHit: raw = baseDamage × powerStat / STAT_SCALE (10). STAT_SCALE is documented for a
    // "~5–22" stat range, but pawns roll 12–22 and grow toward caps of 62–100, so a late-game
    // fighter multiplies weapon damage by 6–10× while DEX's cadence lever stopped paying at 1.67×.
    const t = dummy('bare');
    const strGain =
      dps('steel_longsword', { strength: 60, dexterity: 20 }, t, 'iron_boss_shield').dps /
      dps('steel_longsword', { strength: 10, dexterity: 20 }, t, 'iron_boss_shield').dps;
    const dexGain =
      dps('steel_longsword', { strength: 20, dexterity: 60 }, t, 'iron_boss_shield').dps /
      dps('steel_longsword', { strength: 20, dexterity: 10 }, t, 'iron_boss_shield').dps;
    console.log(`[SLOPE] longsword dps ×${strGain.toFixed(2)} from STR 10→60, ×${dexGain.toFixed(2)} from DEX 10→60`);
    expect(strGain, 'STR is the dominant, uncapped axis').toBeGreaterThan(dexGain * 2);
  });

  it('defence matrix: three dodge tiers × three block tiers, who pulls ahead', () => {
    // Dodge is DEX-driven on the defender; block is CON + shield `blockBonus`, rolled BEFORE the
    // to-hit (a block negates the swing outright). They punish different weapons: dodge punishes low
    // accuracy, block punishes low per-hit damage (a blocked swing is a wasted swing either way).
    const DODGE: [string, number][] = [
      ['low', 1],
      ['med', 20],
      ['high', 45]
    ];
    const BLOCK: [string, string | undefined, number][] = [
      ['none', undefined, 10],
      ['round-shield', 'rawhide_round_shield', 20],
      ['boss-shield+CON', 'iron_boss_shield', 40]
    ];
    for (const [bname, shield, con] of BLOCK) {
      const lines = [`[DEFENCE] block=${bname}   attacker STR/DEX 30      dodge:low   med   high`];
      for (const w of STEEL) {
        const cells = DODGE.map(([, dex]) => {
          const t = makePawn({
            id: 'dummy',
            stats: { ...baseStats, dexterity: dex, constitution: con },
            equipment: shield
              ? { offHand: { itemId: shield, instanceId: 'sh', durability: 999 } }
              : {}
          });
          return f(dps(w.id, { strength: 30, dexterity: 30 }, t, w.off).dps, 8);
        }).join(' ');
        lines.push(w.label.padEnd(20) + cells);
      }
      console.log(lines.join('\n'));
    }
    expect(true).toBe(true);
  });

  it('precision: how often each weapon crits, and how much of its damage that is', () => {
    // hit_precision = (0.05 + (DEX−10)×0.005 + (PER−10)×0.0025) + the weapon's critMod, uncapped by
    // cadence. It also biases LOCATION (aimedBodyPart rolls extra candidates and takes the least
    // armoured), so precision pays twice: more crits AND softer places to put them.
    const t = dummy('armoured');
    const lines = ['[PRECISION] crit chance and share of total damage, vs mail'];
    lines.push('weapon               DEX20 crit  DEX45 crit   dps@20   dps@45   dps gain from crit*');
    for (const w of STEEL) {
      const wp = itemService.getItemById(w.id)!.weaponProperties!;
      const critAt = (dex: number, per = 10) =>
        0.05 + (dex - 10) * 0.005 + (per - 10) * 0.0025 + (wp.critMod ?? 0);
      const d20 = dps(w.id, { strength: 30, dexterity: 20 }, t, w.off).dps;
      const d45 = dps(w.id, { strength: 30, dexterity: 45 }, t, w.off).dps;
      // Crit is a flat ×1.5 on the mitigated hit, so its damage share ≈ 0.5c / (1 + 0.5c).
      const share = (c: number) => (0.5 * c) / (1 + 0.5 * c);
      lines.push(
        w.label.padEnd(20) +
          f(critAt(20) * 100, 9, 1) + '%' +
          f(critAt(45) * 100, 11, 1) + '%' +
          f(d20, 9) + f(d45, 9) +
          f(share(critAt(45)) * 100, 12, 1) + '%'
      );
    }
    console.log(lines.join('\n') + '\n* share of a crit-inclusive hit that the ×1.5 multiplier accounts for.');
    expect(true).toBe(true);
  });

  it('PROPOSAL A — daggers as finesse scaling on DEX', () => {
    // resolveHit's `powerStat` is STR, or PER when `finesse`. Scaling a dagger on DEX is the same
    // arithmetic with a different attribute, so it is priced exactly by flagging it finesse and
    // sweeping the stat that feeds it. Shipping it needs a real powerStat field on the weapon.
    const bare = dummy('bare');
    const mail = dummy('armoured');
    const lines = ['[PROPOSAL A] stiletto, DEX 10→60 (STR held at 20)'];
    lines.push('                       DEX10   DEX20   DEX30   DEX45   DEX60');
    const sweep = (label: string, target: Pawn, patched: boolean) => {
      const run = () =>
        [10, 20, 30, 45, 60]
          .map((dexterity) =>
            f(
              dps(
                'steel_stiletto',
                // finesse reads PERCEPTION, so mirror DEX into it to price "scales on DEX".
                { strength: 20, dexterity, ...(patched ? { perception: dexterity } : {}) },
                target
              ).dps,
              7
            )
          )
          .join(' ');
      lines.push(
        label.padEnd(22) + (patched ? withWeaponPatch({ steel_stiletto: { finesse: true } }, run) : run())
      );
    };
    sweep('vs bare  (STR now)', bare, false);
    sweep('vs bare  (DEX prop)', bare, true);
    sweep('vs mail  (STR now)', mail, false);
    sweep('vs mail  (DEX prop)', mail, true);
    console.log(lines.join('\n'));

    // The point of the change: a DEX-built assassin stops being punished for not stacking STR.
    const now = dps('steel_stiletto', { strength: 20, dexterity: 60 }, bare).dps;
    const prop = withWeaponPatch({ steel_stiletto: { finesse: true } }, () =>
      dps('steel_stiletto', { strength: 20, dexterity: 60, perception: 60 }, bare).dps
    );
    console.log(`[PROPOSAL A] DEX-60 assassin: ${now.toFixed(1)} → ${prop.toFixed(1)} dps (×${(prop / now).toFixed(2)})`);
    expect(prop).toBeGreaterThan(now);
  });

  it('PROPOSAL B — two-handers hit less often and swing slower', () => {
    // Weapon `accuracy` enters the to-hit at MELEE_ACCURACY_WEIGHT (×2), so accuracy −8 is −16 points
    // off a base of 60. Speed is cut a further ~15% on top. Priced against an EVASIVE target, where a
    // to-hit penalty bites hardest.
    const TWOH = ['steel_greatsword', 'steel_greataxe', 'steel_warhammer', 'steel_greatcleaver'];
    const patch = Object.fromEntries(
      TWOH.map((id) => [
        id,
        {
          accuracy: -8,
          attackSpeed: Number(
            ((itemService.getItemById(id)!.weaponProperties!.attackSpeed ?? 1) * 0.85).toFixed(3)
          )
        }
      ])
    );
    for (const kind of ['bare', 'evasive'] as const) {
      const t = dummy(kind);
      const lines = [`[PROPOSAL B vs ${kind}]        now@DEX30  prop@DEX30   now@DEX60  prop@DEX60`];
      for (const id of TWOH) {
        const now30 = dps(id, { strength: 30, dexterity: 30 }, t).dps;
        const now60 = dps(id, { strength: 30, dexterity: 60 }, t).dps;
        const [p30, p60] = withWeaponPatch(patch, () => [
          dps(id, { strength: 30, dexterity: 30 }, t).dps,
          dps(id, { strength: 30, dexterity: 60 }, t).dps
        ]);
        lines.push(id.replace('steel_', '').padEnd(20) + f(now30, 9) + f(p30, 11) + f(now60, 12) + f(p60, 11));
      }
      console.log(lines.join('\n'));
    }
    // A 1H sword is the control: unpatched, so any convergence is the two-hander coming down.
    const t = dummy('evasive');
    const sword = dps('steel_longsword', { strength: 30, dexterity: 60 }, t, 'iron_boss_shield').dps;
    const gsNow = dps('steel_greatsword', { strength: 30, dexterity: 60 }, t).dps;
    const gsProp = withWeaponPatch(patch, () =>
      dps('steel_greatsword', { strength: 30, dexterity: 60 }, t).dps
    );
    console.log(
      `[PROPOSAL B] vs evasive @DEX60 — longsword+shield ${sword.toFixed(1)}, greatsword ${gsNow.toFixed(1)} → ${gsProp.toFixed(1)}`
    );
    expect(gsProp).toBeLessThan(gsNow);
  });

  it('PROPOSAL C — speed as a DEBUFF ladder: 1.0 is the ceiling, weight drags it down', () => {
    // Today attackSpeed runs 0.65–1.5 and the >1.0 half is thrown away by the cadence floor for any
    // built pawn. Renormalising so nothing exceeds 1.0 (dagger 1.0, longsword 0.85, greatsword 0.55…)
    // keeps the same RATIOS between weapons but moves them all below the clamp, so DEX keeps paying
    // for everyone and the fast weapons stop hitting a wall first.
    const RESCALE = 1 / 1.5; // divide every speed by the current fastest
    const patch = Object.fromEntries(
      STEEL.map((w) => [
        w.id,
        {
          attackSpeed: Number(
            ((itemService.getItemById(w.id)!.weaponProperties!.attackSpeed ?? 1) * RESCALE).toFixed(3)
          )
        }
      ])
    );
    const t = dummy('bare');
    const lines = ['[PROPOSAL C] dps at DEX 20 / 45 / 60, STR 30 — shipped vs speed-as-debuff'];
    lines.push('weapon                now20  prop20   now45  prop45   now60  prop60');
    for (const w of STEEL) {
      const now = [20, 45, 60].map((d) => dps(w.id, { strength: 30, dexterity: d }, t, w.off).dps);
      const prop = withWeaponPatch(patch, () =>
        [20, 45, 60].map((d) => dps(w.id, { strength: 30, dexterity: d }, t, w.off).dps)
      );
      lines.push(
        w.label.padEnd(20) +
          f(now[0]) + f(prop[0], 8) + f(now[1], 8) + f(prop[1], 8) + f(now[2], 8) + f(prop[2], 8)
      );
    }
    console.log(lines.join('\n'));
    // The rescale DELAYS the dagger's ceiling rather than removing it: a 1.0-speed weapon needs the
    // attack_speed stat itself to reach 1.67, i.e. DEX 32, so the flatline moves from DEX 14 to ~32
    // and everything above that is unchanged. Worth knowing before treating this as the fix.
    const capped = TPS / MIN_ATTACK_INTERVAL_TICKS;
    expect(swingsPerSec(armed('steel_stiletto', { dexterity: 30 }))).toBeCloseTo(capped, 2);
    const delayed = withWeaponPatch(patch, () =>
      swingsPerSec(armed('steel_stiletto', { dexterity: 30 }))
    );
    expect(delayed, 'rescaled, the dagger is still gaining at DEX 30').toBeLessThan(capped);
    const atForty = withWeaponPatch(patch, () =>
      swingsPerSec(armed('steel_stiletto', { dexterity: 45 }))
    );
    expect(atForty, 'but it has hit the same ceiling again by DEX 45').toBeCloseTo(capped, 2);
  });

  it('STEALTH ceiling: a DEX-built assassin opening from the dark', () => {
    // The worry with a DEX-scaled, high-crit-multiplier dagger is the opening blow. Combat gives an
    // undetected attacker STEALTH_STRIKE_MULT (×3.5) on `hit_precision`, but the total is then held
    // by CRIT_CHANCE_CAP (0.6) — so the ceiling is a 60% chance at the weapon's critMultiplier, once,
    // because the landed hit auto-reveals and the second swing is an ordinary swing.
    //
    // resolveHit's stealth branch needs a MOB defender (`entityClass`) that has not detected the
    // attacker, so this prices the ceiling arithmetically from the same constants rather than
    // pretending a pawn dummy is a mob.
    const STEALTH_MULT = 3.5;
    const CAP = 0.6;
    const lines = ['[STEALTH] opening-blow ceiling, DEX 45 assassin (PER 20)'];
    lines.push('weapon                base crit  stealth crit  critMult  mean opening ×');
    for (const id of ['steel_stiletto', 'rune_slotted_stiletto', 'steel_rapier', 'steel_longsword']) {
      const wp = itemService.getItemById(id)!.weaponProperties!;
      const precision = 0.05 + (45 - 10) * 0.005 + (20 - 10) * 0.0025;
      const base = Math.min(CAP, precision + (wp.critMod ?? 0));
      const sneak = Math.min(CAP, precision * STEALTH_MULT + (wp.critMod ?? 0));
      const mult = wp.critMultiplier ?? 1.5;
      lines.push(
        id.replace('steel_', '').replace('rune_', 'rune ').padEnd(22) +
          f(base * 100, 8, 1) + '%' + f(sneak * 100, 12, 1) + '%' +
          f(mult, 10, 2) + f(1 + sneak * (mult - 1), 15, 2) + '×'
      );
    }
    console.log(lines.join('\n'));

    // The opening blow is the whole gamble: it must beat a longsword's opener clearly, and still not
    // read as a one-shot. Both bounds are asserted so a later crit-multiplier bump can't quietly
    // break either side.
    const wp = itemService.getItemById('steel_stiletto')!.weaponProperties!;
    const precision = 0.05 + (45 - 10) * 0.005 + (20 - 10) * 0.0025;
    const sneak = Math.min(CAP, precision * STEALTH_MULT + (wp.critMod ?? 0));
    const opening = 1 + sneak * ((wp.critMultiplier ?? 1.5) - 1);
    expect(opening, 'the opening blow is a real spike').toBeGreaterThan(1.5);
    expect(opening, 'but still under 2.5× — it opens a fight, it does not end one').toBeLessThan(2.5);

    // Sustained, at EQUAL stat investment. This is the fairness test that matters, because DEX pays
    // a dagger four ways (damage, cadence, to-hit, crit) where STR pays a two-hander only one — so a
    // DEX-scaled dagger triple-dips and the crit multiplier has to be priced against that, not on its
    // own. A specialist SHOULD win a straight damage race it has fully committed to; what it must not
    // do is win it by a landslide while also being the fastest and most accurate thing on the field.
    for (const kind of ['bare', 'armoured'] as const) {
      const t = dummy(kind);
      const assassin = dps('steel_stiletto', { strength: 10, dexterity: 60, perception: 20 }, t).dps;
      const greatsword = dps('steel_greatsword', { strength: 60, dexterity: 20 }, t).dps;
      console.log(
        `[STEALTH] sustained vs ${kind}, equal investment — DEX-60 assassin ${assassin.toFixed(1)} dps vs STR-60 greatsword ${greatsword.toFixed(1)} dps (×${(assassin / greatsword).toFixed(2)})`
      );
      // The residual edge is NOT the dagger's crit: at critMultiplier 1.5 it already sits ~1.2× the
      // greatsword, because DEX buys four things and STR buys one. Closing it properly means taming
      // the uncapped `baseDamage × stat / STAT_SCALE` term, not shaving the dagger again.
      expect(assassin / greatsword, 'the assassin does not run away with the damage race').toBeLessThan(1.5);
    }
  });

  it('CALIBRATION — what critMultiplier the dagger can carry before it is oppressive', () => {
    // Priced against the same STR-60 greatsword benchmark, so the number is chosen from data rather
    // than taste. The shipped value should sit inside the band this prints.
    const bare = dummy('bare');
    const mail = dummy('armoured');
    const gsBare = dps('steel_greatsword', { strength: 60, dexterity: 20 }, bare).dps;
    const gsMail = dps('steel_greatsword', { strength: 60, dexterity: 20 }, mail).dps;
    const lines = [
      `[CALIBRATION] benchmark: STR-60 greatsword = ${gsBare.toFixed(1)} bare / ${gsMail.toFixed(1)} vs mail`,
      'critMult   assassin bare   ratio   assassin mail   ratio'
    ];
    for (const mult of [1.5, 2.0, 2.2, 2.6, 3.0]) {
      const [b, m] = withWeaponPatch({ steel_stiletto: { critMultiplier: mult } }, () => [
        dps('steel_stiletto', { strength: 10, dexterity: 60, perception: 20 }, bare).dps,
        dps('steel_stiletto', { strength: 10, dexterity: 60, perception: 20 }, mail).dps
      ]);
      lines.push(
        f(mult, 7, 2) + f(b, 16) + f(b / gsBare, 8, 2) + f(m, 16) + f(m / gsMail, 8, 2)
      );
    }
    console.log(lines.join('\n'));
    expect(true).toBe(true);
  });

  it('armour attrition: condition stripped per LANDED hit, and what that is worth now', () => {
    // Why the first fight table looked backwards: a dagger left the orc with LESS armour than a
    // warhammer did. Armour loss is per LANDED HIT, so a fast weapon in a long fight accumulates
    // what a slow weapon lands twice and wins with. Per-hit is the honest comparison.
    const t = dummy('armoured');
    const lines = ['[ARMOUR ATTRITION] at STR 30 (armor_damage stat ×1.4), vs a 200-condition plate'];
    lines.push('weapon                armourDmg/hit   hits to strip   hits/sec   seconds to strip');
    for (const w of STEEL) {
      const wp = itemService.getItemById(w.id)!.weaponProperties!;
      const byType = wp.damageType === 'blunt' ? 4 : wp.damageType === 'piercing' ? 2 : 1.5;
      const perHit = (wp.armorDamage ?? byType) * 1.4;
      const r = dps(w.id, { strength: 30, dexterity: 30 }, t, w.off);
      const landPerSec = r.sps * r.hitRate;
      lines.push(
        w.label.padEnd(20) +
          f(perHit, 13, 1) +
          f(Math.ceil(200 / perHit), 16) +
          f(landPerSec, 11, 2) +
          f(200 / perHit / Math.max(0.01, landPerSec), 19, 1)
      );
    }
    console.log(lines.join('\n'));
    expect(true).toBe(true);
  });

  it('condition now scales soak: a battered hauberk stops less than a fresh one', () => {
    // The change that makes armour damage matter mid-fight: defense × (0.5 + 0.5 × condition).
    const mk = (durability: number) =>
      makePawn({
        id: 'dummy',
        stats: { ...baseStats, dexterity: 1 },
        equipment: { bodyMid: { itemId: 'mail_hauberk', instanceId: 'a1', durability } }
      });
    const fresh = sample(armed('steel_longsword', { strength: 25, dexterity: 20 }, 'iron_boss_shield'), mk(250));
    const half = sample(armed('steel_longsword', { strength: 25, dexterity: 20 }, 'iron_boss_shield'), mk(125));
    const wreck = sample(armed('steel_longsword', { strength: 25, dexterity: 20 }, 'iron_boss_shield'), mk(10));
    console.log(
      `[CONDITION] longsword damage per swing vs mail — fresh ${fresh.perSwing.toFixed(2)}, half-wrecked ${half.perSwing.toFixed(2)}, ruined ${wreck.perSwing.toFixed(2)}`
    );
    expect(half.perSwing).toBeGreaterThan(fresh.perSwing);
    expect(wreck.perSwing).toBeGreaterThan(half.perSwing);
  });

  it('stamina is the real 2H brake: cost per second by family', () => {
    const t = dummy('bare');
    const lines = ['[STAMINA/SEC] at DEX 30, STR 30'];
    for (const w of STEEL) {
      const r = dps(w.id, { strength: 30, dexterity: 30 }, t, w.off);
      lines.push(
        w.label.padEnd(20) + `dps ${f(r.dps)}   stam/s ${f(r.stamPerSec, 5, 2)}   dmg/stam ${f(r.dps / Math.max(0.01, r.stamPerSec), 6, 2)}`
      );
    }
    console.log(lines.join('\n'));
    expect(true).toBe(true);
  });
});
