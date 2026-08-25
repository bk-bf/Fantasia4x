import { describe, it, expect } from 'vitest';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import type { EntityStats, Mob, Pawn } from '$lib/game/core/types';

const CREATURE = 'orc_reaver';
const MAX_TICKS = 12_000;

interface Duel {
  ticks: number;
  killed: boolean;
  bloodPct: number;
  survived: boolean;
}

async function duel(opts: {
  seed?: number;
  stats: Partial<EntityStats>;
  equip: string[];
  traits?: string[];
}): Promise<Duel> {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed: opts.seed ?? 4242,
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

  const mobOf = (): Mob | undefined => s.getState().mobs?.[0];
  const start = mobOf();
  if (!start) throw new Error('no mob spawned');
  const startBlood = start.bloodVolume ?? start.maxBloodVolume ?? 1;

  const ids = (s.getState().pawns as Pawn[]).map((p) => p.id);
  s.command({
    type: 'attackTargetWith',
    payload: { ids, targetId: start.id, targetType: 'mob' }
  } as never);

  let ticks = 0;
  let last = mobOf();
  while (ticks < MAX_TICKS) {
    s.tick(20);
    ticks += 20;
    const m = mobOf();
    if (!m || m.isAlive === false) {
      last = m ?? last;
      break;
    }
    last = m;
  }
  const alive = last && last.isAlive !== false;
  const me = (s.getState().pawns as Pawn[]).find((p) => p.id === ids[0]);
  return {
    ticks,
    killed: !alive,
    bloodPct: Math.round((((last?.bloodVolume ?? 0) || 0) / startBlood) * 100),
    survived: !!me && me.isAlive !== false
  };
}

async function meanDuel(
  label: string,
  opts: Parameters<typeof duel>[0],
  seeds = [11, 23, 37, 41, 59, 71, 83, 97]
) {
  const runs: Duel[] = [];
  for (const seed of seeds) runs.push(await duel({ ...opts, seed }));
  const ticks = runs.reduce((a, r) => a + (r.killed ? r.ticks : MAX_TICKS), 0) / runs.length;
  const killed = runs.filter((r) => r.killed);
  const killTicks = killed.length ? killed.reduce((a, r) => a + r.ticks, 0) / killed.length : NaN;
  const blood = runs.reduce((a, r) => a + r.bloodPct, 0) / runs.length;
  return {
    label,
    ticks,
    blood,
    killTicks,
    kills: runs.filter((r) => r.killed).length,
    deaths: runs.filter((r) => !r.survived).length,
    of: runs.length
  };
}
const row = (r: Awaited<ReturnType<typeof meanDuel>>) =>
  `${r.label.padEnd(34)} ${String(Math.round(r.ticks)).padStart(6)} ticks   ${r.kills}/${r.of} kills   ` +
  `${r.deaths} deaths   blood left ${r.blood.toFixed(0)}%`;

describe('COMBAT-BALANCE audit — live sim', () => {
  it('POST-RENAME GATE: a mob spawns with its authored stat bands and a real fight resolves', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 7,
        map: { w: 24, h: 24 },
        pawns: [
          {
            count: 1,
            drafted: true,
            stats: { strength: 30, dexterity: 30, constitution: 40 },
            equip: ['steel_longsword']
          }
        ],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        spawnMobs: [{ count: 1, creatureId: CREATURE }],
        seedEntities: false
      })
    );
    const mob = s.getState().mobs?.[0] as Mob;
    const st = mob.stats as unknown as EntityStats;
    console.log(
      `[GATE] ${CREATURE} spawned strength ${st.strength} · dexterity ${st.dexterity} · constitution ${st.constitution} · perception ${st.perception}`
    );
    expect(st.strength).toBeGreaterThan(10);
    expect(
      [st.strength, st.dexterity, st.constitution, st.perception].every((v) => Number.isFinite(v) && v > 0)
    ).toBe(true);

    const pawn = (s.getState().pawns as Pawn[])[0];
    s.command({
      type: 'attackTargetWith',
      payload: { ids: [pawn.id], targetId: mob.id, targetType: 'mob' }
    } as never);
    const before = mob.bloodVolume ?? 0;
    for (let i = 0; i < 30 && (s.getState().mobs?.[0]?.isAlive ?? false); i++) s.tick(40);
    const after = s.getState().mobs?.[0]?.bloodVolume ?? 0;
    console.log(`[GATE] blood ${Math.round(before)} → ${Math.round(after)} over ≤1200 ticks`);
    expect(after).toBeLessThan(before);
  }, 120_000);

  it('#4 LANDED — a two-hander answers to STRENGTH, the stat it names', async () => {
    const equip = ['steel_greataxe'];
    const strong = await meanDuel('STRENGTH 40 / DEXTERITY 10 (2H greataxe)', {
      stats: { strength: 40, dexterity: 10, constitution: 30 },
      equip
    });
    const nimble = await meanDuel('STRENGTH 10 / DEXTERITY 40 (2H greataxe)', {
      stats: { strength: 10, dexterity: 40, constitution: 30 },
      equip
    });
    console.log('[#4 POWER STAT]\n' + row(strong) + '\n' + row(nimble));
    console.log(
      `  → the STRENGTH build is ${(nimble.ticks / strong.ticks).toFixed(2)}× faster and removes ` +
        `${((100 - strong.blood) / (100 - nimble.blood)).toFixed(1)}× the blood, on a weapon whose power stat is STRENGTH`
    );
    expect(strong.ticks).toBeLessThan(nimble.ticks);
    expect(100 - strong.blood).toBeGreaterThan(100 - nimble.blood);
  }, 600_000);

  it('#11 a strict downgrade now costs time', async () => {
    const equip = ['steel_stiletto'];
    const plain = await meanDuel('stiletto, unimpaired', {
      stats: { strength: 20, dexterity: 40, constitution: 30 },
      equip
    });
    const crippled = await meanDuel('stiletto + lumbering-fighter', {
      stats: { strength: 20, dexterity: 40, constitution: 30 },
      equip,
      traits: ['lumbering-fighter']
    });
    console.log('[#11 PRECISION]\n' + row(plain) + '\n' + row(crippled));
    console.log(
      `  → crippled/unimpaired time-to-kill ratio ${(crippled.ticks / plain.ticks).toFixed(2)}× (should be > 1)`
    );
    expect(crippled.ticks).toBeGreaterThan(plain.ticks);
  }, 600_000);

  it('#1 a flaw RAISES its stat, through the real command path', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 5,
        map: { w: 16, h: 16 },
        pawns: [{ count: 1, stats: { strength: 12, dexterity: 12, constitution: 12, intelligence: 12 } }],
        needsDisabled: ['hunger', 'fatigue'],
        seedEntities: false
      })
    );
    const id = (s.getState().pawns as Pawn[])[0].id;
    const before = { ...(s.getState().pawns as Pawn[])[0].stats };
    s.command({
      type: 'devSetPawnTraits',
      payload: { pawnId: id, traitIds: ['frail', 'clumsy', 'dull'] }
    } as never);
    const after = (s.getState().pawns as Pawn[])[0].stats;
    console.log(
      `[#1 SIGNED GRANTS] frail+clumsy+dull → constitution ${before.constitution}→${after.constitution} · ` +
        `dexterity ${before.dexterity}→${after.dexterity} · intelligence ${before.intelligence}→${after.intelligence}`
    );
    expect(after.constitution).toBeLessThan(before.constitution);
    expect(after.dexterity).toBeLessThan(before.dexterity);
    expect(after.intelligence).toBeLessThan(before.intelligence);
  }, 120_000);

  it('#2 the sim itself is deterministic — the same seed replays identically', async () => {
    const a = await duel({
      seed: 909,
      stats: { strength: 30, dexterity: 20, constitution: 30 },
      equip: ['steel_longsword']
    });
    const b = await duel({
      seed: 909,
      stats: { strength: 30, dexterity: 20, constitution: 30 },
      equip: ['steel_longsword']
    });
    console.log(
      `[#2 DETERMINISM] run A ${a.ticks} ticks / blood ${a.bloodPct}%  ·  run B ${b.ticks} ticks / blood ${b.bloodPct}%`
    );
    expect(b).toEqual(a);
  }, 300_000);
});
