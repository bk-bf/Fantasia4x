import { describe, it, expect } from 'vitest';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { setSimLogSink } from '$lib/game/core/logSink';
import { getConditionCurrentStage } from '$lib/game/core/needs';
import { itemService } from '$lib/game/services/ItemService';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import type { CombatTurnEntry } from '$lib/game/core/Events';
import type { EntityStats, Mob, Pawn } from '$lib/game/core/types';

/**
 * STYLE PREMISE PROBE — does the sim actually deliver the intended weapon/armour identities?
 *
 *   2H  → low attack_speed, poor hit_chance, devastating per landed hit
 *   1H  → high attack_speed, good hit_chance, modest per landed hit; tanky once a shield is added
 *   heavy armour → the brawn build's answer; light armour → the dodge build's answer
 *
 * Every earlier audit measured OUTCOMES (ticks to kill). This one measures the MECHANISM: swings
 * thrown, hit rate, damage per landed hit, and what armour does to the defensive stats. A style
 * identity that isn't visible here doesn't exist in the game no matter what the outcome table says.
 *
 * Temporary diagnostic (`_` prefix) — delete once the findings are recorded.
 */

const CREATURE = 'orc_reaver';
const MAX_TICKS = 12_000;
const SEEDS = [11, 23, 37, 41, 59, 71];

const KITS: Record<string, string[]> = {
  none: [],
  light: ['linen_gambeson', 'leather_coif', 'rawhide_shoulder_pads', 'rawhide_arm_wraps', 'rawhide_leg_wraps'],
  medium: ['brigandine_coat', 'leather_coif', 'iron_pauldrons', 'iron_bracers', 'iron_greaves'],
  heavy: ['plate_cuirass', 'great_helm', 'steel_pauldrons', 'steel_vambraces', 'steel_greaves']
};

interface Tally {
  swings: number;
  hits: number;
  damage: number;
}
const empty = (): Tally => ({ swings: 0, hits: 0, damage: 0 });

interface Probe {
  /** Ticks the fight ACTUALLY ran. Every rate (ticks/swing, damage per 1000t) must divide by this —
   *  substituting the censored budget for a non-kill inflates the denominator against swings that
   *  only ever accrued during the real fight. */
  ticks: number;
  killed: boolean;
  mine: Tally;
  theirs: Tally;
  /** Snapshot of the pawn's defensive numbers WHILE kitted, taken mid-fight. */
  dodge: number;
  hitChance: number;
  atkSpeed: number;
  load: number;
  capacity: number;
  encumberedSev: number;
  laden: number;
  stiff: number;
  /** False when the pawn was already dead at the snapshot tick — such a run has no defensive numbers
   *  and must be excluded from their averages rather than averaged in as zeros. */
  sampled: boolean;
}

async function probe(opts: {
  seed: number;
  stats: Partial<EntityStats>;
  equip: string[];
  traits?: string[];
}): Promise<Probe> {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed: opts.seed,
      map: { w: 24, h: 24 },
      pawns: [
        {
          count: 1,
          drafted: true,
          stats: opts.stats,
          equip: opts.equip,
          ...(opts.traits ? { traits: opts.traits } : {})
        }
      ],
      needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
      spawnMobs: [{ count: 1, creatureId: CREATURE }],
      seedEntities: false
    })
  );

  const me = (s.getState().pawns as Pawn[])[0];
  const myName = me.name;
  const mine = empty();
  const theirs = empty();
  // Capture the real swing stream the renderer would draw — this is the sim's own combat output.
  setSimLogSink({
    logActivity: () => '',
    logEvent: () => {},
    logCombatSwing: (
      _aId: string,
      attackerName: string,
      _dId: string,
      _dName: string,
      _t: number,
      _x: number,
      _y: number,
      swing: CombatTurnEntry
    ) => {
      const t = attackerName === myName ? mine : theirs;
      t.swings++;
      if (swing.hit) {
        t.hits++;
        t.damage += swing.damage ?? 0;
      }
    },
    logCombatKill: () => {},
    pushCombatText: () => {},
    pushAttackLunge: () => {},
    pushCombatSound: () => {},
    pushProjectile: () => {},
    logEntityDeath: () => {},
    threatAlert: () => {},
    vitalAlert: () => {},
    pawnDeath: () => {}
  } as never);

  const mobOf = (): Mob | undefined => s.getState().mobs?.[0];
  const start = mobOf();
  if (!start) throw new Error('no mob spawned');
  s.command({
    type: 'attackTargetWith',
    payload: { ids: [me.id], targetId: start.id, targetType: 'mob' }
  } as never);

  let ticks = 0;
  let snap: Probe['dodge'] extends never ? never : Partial<Probe> = {};
  let last = mobOf();
  while (ticks < MAX_TICKS) {
    s.tick(20);
    ticks += 20;
    // Take the defensive snapshot once the fight is genuinely joined (gear equipped, conditions driven).
    if (ticks === 400 && (s.getState().pawns as Pawn[]).some((p) => p.id === me.id)) {
      const live = (s.getState().pawns as Pawn[]).find((p) => p.id === me.id)!;
      const cap = itemService.getCarryCapacityBreakdown(live).weight.total;
      const load = itemService.getCurrentCarryLoad(live, s.getState()).weightKg;
      // EFFECTIVE dodge, the way resolveHit builds it: the stat, times the flat `dodge` modifier of
      // every active condition stage, times worn stiffness. Reading `evaluateStat` alone shows none of
      // the armour cost — both new channels apply outside the formula.
      let condDodge = 1;
      for (const c of live.conditions ?? []) {
        const m = getConditionCurrentStage(c)?.modifiers as Record<string, number> | undefined;
        if (m?.dodge != null) condDodge *= m.dodge;
      }
      let stiff = 0;
      for (const slot in live.equipment ?? {}) {
        const inst = (live.equipment as Record<string, { itemId: string } | undefined>)[slot];
        if (inst) stiff += itemService.getItemById(inst.itemId)?.armorProperties?.movementPenalty ?? 0;
      }
      snap = {
        dodge:
          pawnStatService.evaluateStat('dodge', live) * condDodge * (1 - Math.min(0.45, stiff)),
        laden: live.conditions?.find((c) => c.id === 'laden')?.severity ?? 0,
        stiff,
        hitChance: pawnStatService.evaluateStat('hit_chance', live),
        atkSpeed: pawnStatService.evaluateStat('attack_speed', live),
        load,
        capacity: cap,
        encumberedSev: live.conditions?.find((c) => c.id === 'encumbered')?.severity ?? 0
      };
    }
    const m = mobOf();
    if (!m || m.isAlive === false) {
      last = m ?? last;
      break;
    }
    last = m;
    // The fight is over when EITHER side falls. Ticking on past a dead pawn accrues idle time against
    // swings that can no longer happen, which inflates every rate that divides by ticks.
    const alive = (s.getState().pawns as Pawn[]).find((p) => p.id === me.id);
    if (!alive || alive.isAlive === false) break;
  }
  setSimLogSink(null as never);
  return {
    ticks,
    killed: !(last && last.isAlive !== false),
    mine,
    theirs,
    dodge: snap.dodge ?? 0,
    laden: snap.laden ?? 0,
    stiff: snap.stiff ?? 0,
    hitChance: snap.hitChance ?? 0,
    atkSpeed: snap.atkSpeed ?? 0,
    load: snap.load ?? 0,
    capacity: snap.capacity ?? 0,
    encumberedSev: snap.encumberedSev ?? 0,
    sampled: snap.dodge != null
  };
}

const FIGHTER: Partial<EntityStats> = { brawn: 30, agility: 30, vigour: 30 };

async function run(
  label: string,
  equip: string[],
  traits?: string[],
  stats: Partial<EntityStats> = FIGHTER
) {
  const rs: Probe[] = [];
  for (const seed of SEEDS) rs.push(await probe({ seed, stats, equip, traits }));
  const sum = (f: (p: Probe) => number) => rs.reduce((a, p) => a + f(p), 0);
  const n = rs.length;
  // Defensive numbers average over the runs that HAD them (see `sampled`).
  const seen = rs.filter((p) => p.sampled);
  const savg = (f: (p: Probe) => number) =>
    seen.length ? seen.reduce((a, p) => a + f(p), 0) / seen.length : NaN;
  // Censored: a run that never killed counts the full budget. Answers "does this kit WIN", and is the
  // only figure that may be compared across kits with different kill rates.
  const censored = sum((p) => (p.killed ? p.ticks : MAX_TICKS));
  return {
    label,
    censored,
    swings: sum((p) => p.mine.swings),
    hits: sum((p) => p.mine.hits),
    dmg: sum((p) => p.mine.damage),
    inSwings: sum((p) => p.theirs.swings),
    inHits: sum((p) => p.theirs.hits),
    inDmg: sum((p) => p.theirs.damage),
    ticks: sum((p) => p.ticks),
    kills: rs.filter((p) => p.killed).length,
    n,
    dodge: savg((p) => p.dodge),
    atkSpeed: savg((p) => p.atkSpeed),
    load: savg((p) => p.load),
    capacity: savg((p) => p.capacity),
    enc: savg((p) => p.encumberedSev),
    laden: savg((p) => p.laden),
    stiff: savg((p) => p.stiff),
    sampled: seen.length
  };
}

type Row = Awaited<ReturnType<typeof run>>;

describe('STYLE PREMISE — is the intended weapon/armour identity actually in the sim?', () => {
  it('A · attack_speed and per-landed-hit force by style (every style in the armour brawn 30 affords)', async () => {
    // MEDIUM on everyone. Bare-vs-bare flattered the shield (nothing else stopped a blow) and heavy is
    // over a brawn-30 budget, so medium is the only kit where the WEAPON is the variable under test.
    const M = KITS.medium;
    const out: Row[] = [];
    out.push(await run('2H greatsword', ['steel_greatsword', ...M]));
    out.push(await run('2H warhammer', ['steel_warhammer', ...M]));
    out.push(await run('1H longsword + shield', ['steel_longsword', 'iron_boss_shield', ...M]));
    out.push(await run('1H mace + shield', ['steel_mace', 'iron_boss_shield', ...M]));
    out.push(await run('1H longsword duelist', ['steel_longsword', ...M], ['duelist']));

    const lines = out.map(
      (r) =>
        r.label.padEnd(24) +
        `${(r.ticks / r.swings).toFixed(0)}t/swing`.padStart(12) +
        `${((r.hits / r.swings) * 100).toFixed(0)}% hit`.padStart(10) +
        `${(r.dmg / Math.max(1, r.hits)).toFixed(1)} dmg/hit`.padStart(15) +
        `${((r.dmg / r.ticks) * 1000).toFixed(1)} dmg/1000t`.padStart(17) +
        `  ${Math.round(r.censored / r.n)}t enc` +
        `  ${r.kills}/${r.n} kills`
    );
    console.log(
      `[A · STYLE IDENTITY] ${SEEDS.length} seeds each vs a live orc reaver, real swings from the combat sink\n` +
        'style                    ticks/swing  hit rate     per hit        throughput      encounter\n' +
        lines.join('\n')
    );

    const g = out[0];
    const l = out[2];
    const tp = (r: Row) => (r.dmg / r.ticks) * 1000;
    console.log(
      `\n  target: 1H+shield throughput ≈ 60% of the 2H it is measured against.\n` +
        `  measured ratio: ${((tp(l) / tp(g)) * 100).toFixed(0)}%  (1H ${tp(l).toFixed(1)} vs 2H ${tp(g).toFixed(1)} dmg/1000t)`
    );
    console.log(
      `\n  intended: 2H fewer swings (low attack_speed), worse hit_chance, bigger damage per landed hit.\n` +
        `  measured: 2H ${(g.ticks / g.swings).toFixed(0)}t vs 1H ${(l.ticks / l.swings).toFixed(0)}t per swing · ` +
        `hit ${((g.hits / g.swings) * 100).toFixed(0)}% vs ${((l.hits / l.swings) * 100).toFixed(0)}% · ` +
        `per hit ${(g.dmg / g.hits).toFixed(1)} vs ${(l.dmg / l.hits).toFixed(1)}`
    );
    expect(out.length).toBe(5);
  }, 1_800_000);

  it('B · what armour actually costs — the defensive side of the trade', async () => {
    const out: Row[] = [];
    for (const w of ['none', 'light', 'medium', 'heavy'])
      out.push(await run(`1H+shield · ${w}`, ['steel_longsword', 'iron_boss_shield', ...KITS[w]]));
    for (const w of ['none', 'light', 'medium', 'heavy'])
      out.push(await run(`2H greatsword · ${w}`, ['steel_greatsword', ...KITS[w]]));

    const lines = out.map(
      (r) =>
        r.label.padEnd(24) +
        `${r.load.toFixed(1)}/${r.capacity.toFixed(1)}kg`.padStart(14) +
        `laden ${r.laden.toFixed(2)}`.padStart(12) +
        `enc ${r.enc.toFixed(2)}`.padStart(10) +
        `stiff ${r.stiff.toFixed(2)}`.padStart(12) +
        `dodge ${r.dodge.toFixed(3)}`.padStart(14) +
        `  taken ${((r.inHits / Math.max(1, r.inSwings)) * 100).toFixed(0)}% · ` +
        `${(r.inDmg / Math.max(1, r.inHits)).toFixed(1)}/hit`
    );
    console.log(
      '[B · ARMOUR COST] same pawn (brawn 30 / agility 30), kit is the only variable\n' +
        'kit                        load/cap       laden       enc       stiff         dodge   incoming\n' +
        lines.join('\n')
    );

    const bare = out[0];
    const plate = out[3];
    console.log(
      `\n  intended: heavy armour trades EVASION for protection, so a dodge pawn refuses it.\n` +
        `  measured: dodge bare ${bare.dodge.toFixed(3)} → plate ${plate.dodge.toFixed(3)} ` +
        `(${(((plate.dodge - bare.dodge) / bare.dodge) * 100).toFixed(1)}%)`
    );
    expect(out.length).toBe(8);
  }, 1_800_000);

  it('C · the INTENDED matchup — each build in the kit its own stats pay for', async () => {
    // Comparing both styles at brawn 30 in medium is not the design's matchup. A two-hander has no
    // shield, and the thing that replaces it is HEAVY ARMOUR — which the tightened carry curve prices
    // at roughly brawn 45. So the honest comparison is a brawn build in plate against an agility build
    // behind a shield, each wearing what its own stat line affords.
    const BRAWN: Partial<EntityStats> = { brawn: 45, agility: 22, vigour: 30 };
    const AGI: Partial<EntityStats> = { brawn: 22, agility: 45, vigour: 30 };
    const out: Row[] = [];
    out.push(await run('2H greatsword · heavy (brawn)', ['steel_greatsword', ...KITS.heavy], undefined, BRAWN));
    out.push(await run('2H warhammer · heavy (brawn)', ['steel_warhammer', ...KITS.heavy], undefined, BRAWN));
    out.push(
      await run('1H+shield · medium (agility)', ['steel_longsword', 'iron_boss_shield', ...KITS.medium], undefined, AGI)
    );
    out.push(
      await run('1H+shield · light (agility)', ['steel_longsword', 'iron_boss_shield', ...KITS.light], undefined, AGI)
    );
    out.push(await run('1H duelist · light (agility)', ['steel_longsword', ...KITS.light], ['duelist'], AGI));

    const lines = out.map(
      (r) =>
        r.label.padEnd(30) +
        `${r.load.toFixed(1)}/${r.capacity.toFixed(1)}kg`.padStart(14) +
        `${(r.ticks / r.swings).toFixed(0)}t/swing`.padStart(12) +
        `${((r.hits / r.swings) * 100).toFixed(0)}% hit`.padStart(9) +
        `${(r.dmg / Math.max(1, r.hits)).toFixed(1)}/hit`.padStart(11) +
        `${((r.dmg / r.ticks) * 1000).toFixed(1)} dmg/1000t`.padStart(17) +
        `  taken ${((r.inHits / Math.max(1, r.inSwings)) * 100).toFixed(0)}%` +
        `  ${r.kills}/${r.n} kills`
    );
    console.log(
      `[C · INTENDED MATCHUP] ${SEEDS.length} seeds each\n` +
        'build                            load/cap   ticks/swing  hit rate    per hit       throughput\n' +
        lines.join('\n')
    );
    const tp = (r: Row) => (r.dmg / r.ticks) * 1000;
    console.log(
      `\n  target: 1H+shield ≈ 60% of the 2H throughput, and better survival.\n` +
        `  measured: ${((tp(out[2]) / tp(out[0])) * 100).toFixed(0)}% of greatsword · ` +
        `taken ${((out[2].inHits / out[2].inSwings) * 100).toFixed(0)}% vs the greatsword's ` +
        `${((out[0].inHits / out[0].inSwings) * 100).toFixed(0)}%`
    );
    expect(out.length).toBe(5);
  }, 1_800_000);
});
