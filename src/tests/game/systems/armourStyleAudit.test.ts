import { describe, it, expect } from 'vitest';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import type { EntityStats, Mob, Pawn } from '$lib/game/core/types';

/**
 * ARMOUR × STYLE AUDIT — the shield question, tested the way it has to be tested.
 *
 * The earlier style comparison put both pawns in NO armour, which is the one configuration where the
 * shield answer is guaranteed to look best: with nothing else stopping blows, the only mitigation in
 * the fight was the shield. The real trade is a whole KIT:
 *
 *   • a two-hander has both hands full, so it spends its whole encumbrance budget on ARMOUR;
 *   • a shield user spends part of that budget on the shield, so it wears LIGHTER armour or eats the
 *     encumbrance penalty that claps its stats.
 *
 * So every style is run in every armour class it could plausibly field, against a live mob, and the
 * comparison is kit-vs-kit rather than weapon-vs-weapon.
 *
 * Preflight (headless skill): flat map, needs frozen, `seedEntities: false`, explicit draft order.
 */

const CREATURE = 'orc_reaver';
const MAX_TICKS = 12_000;
const SEEDS = [11, 23, 37, 41, 59, 71];

/** Full sets by weight class — head/body/limbs, so encumbrance is real rather than a single piece. */
const KITS: Record<string, string[]> = {
  none: [],
  light: ['linen_gambeson', 'leather_coif', 'rawhide_shoulder_pads', 'rawhide_arm_wraps', 'rawhide_leg_wraps'],
  medium: ['iron_plated_jack', 'leather_coif', 'iron_bracers', 'iron_greaves'],
  heavy: ['plate_cuirass', 'great_helm', 'steel_vambraces', 'steel_greaves']
};

interface Run {
  ticks: number;
  killed: boolean;
  bloodPct: number;
  survived: boolean;
}

async function duel(opts: {
  seed: number;
  stats: Partial<EntityStats>;
  equip: string[];
  traits?: string[];
}): Promise<Run> {
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
  const me = (s.getState().pawns as Pawn[]).find((p) => p.id === ids[0]);
  return {
    ticks,
    killed: !(last && last.isAlive !== false),
    bloodPct: Math.round((((last?.bloodVolume ?? 0) || 0) / startBlood) * 100),
    survived: !!me && me.isAlive !== false
  };
}

async function kit(label: string, equip: string[], traits?: string[]) {
  const runs: Run[] = [];
  for (const seed of SEEDS)
    runs.push({ ...(await duel({ seed, stats: { brawn: 30, agility: 30, vigour: 30 }, equip, traits })) });
  const killed = runs.filter((r) => r.killed);
  return {
    label,
    // Censored: a run that never killed counts the full budget (see combatBalanceAudit's note).
    ticks: runs.reduce((a, r) => a + (r.killed ? r.ticks : MAX_TICKS), 0) / runs.length,
    // Uncensored, among kills — "how fast does it kill", a different question from "does it win".
    killTicks: killed.length ? killed.reduce((a, r) => a + r.ticks, 0) / killed.length : NaN,
    kills: killed.length,
    deaths: runs.filter((r) => !r.survived).length,
    of: runs.length
  };
}
const row = (r: Awaited<ReturnType<typeof kit>>) =>
  r.label.padEnd(30) +
  String(Math.round(r.ticks)).padStart(6) +
  't  ' +
  (Number.isNaN(r.killTicks) ? '  —  ' : String(Math.round(r.killTicks)).padStart(5) + 't') +
  `  ${r.kills}/${r.of} kills  ${r.deaths} deaths`;

describe('ARMOUR × STYLE — the shield trade, kit vs kit', () => {
  it('every style in every armour class it could field', async () => {
    const out: Awaited<ReturnType<typeof kit>>[] = [];
    // A two-hander has both hands full: its whole budget goes on armour, so run it up to heavy.
    for (const w of ['light', 'medium', 'heavy'])
      out.push(await kit(`2H greatsword · ${w}`, ['steel_greatsword', ...KITS[w]]));
    // A shield user spends part of the budget on the shield. Run the same ladder so the encumbrance
    // cost of doing BOTH is visible rather than assumed.
    for (const w of ['light', 'medium', 'heavy'])
      out.push(await kit(`1H+shield · ${w}`, ['steel_longsword', 'iron_boss_shield', ...KITS[w]]));
    // The duel grip trades the shield for damage — same ladder again.
    for (const w of ['light', 'medium'])
      out.push(await kit(`1H duelist · ${w}`, ['steel_longsword', ...KITS[w]], ['duelist']));

    console.log(
      '[ARMOUR × STYLE] 6 seeds each, drafted colonist vs a live orc reaver\n' +
        'kit                            encounter  kill-speed  outcome\n' +
        out.map(row).join('\n')
    );

    const best = out.slice().sort((a, b) => a.ticks - b.ticks)[0];
    const safest = out.slice().sort((a, b) => a.deaths - b.deaths || a.ticks - b.ticks)[0];
    console.log(`\n  fastest encounter: ${best.label}\n  safest: ${safest.label}`);

    // Every kit must be able to win at least sometimes — a configuration that never kills is broken,
    // not a trade-off.
    for (const r of out) expect(r.kills, `${r.label} never killed`).toBeGreaterThan(0);
  }, 1_800_000);
});
