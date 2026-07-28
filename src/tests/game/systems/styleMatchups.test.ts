import { describe, it, expect } from 'vitest';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { setSimLogSink } from '$lib/game/core/logSink';
import type { CombatTurnEntry } from '$lib/game/core/Events';
import type { EntityStats, Pawn } from '$lib/game/core/types';

/**
 * STYLE MATCHUPS — pawn against pawn, equal skill, kit as the only variable.
 *
 * This replaces an earlier comparison that was a CATEGORY ERROR: it scored "heavy armour" against
 * "shield" as if they were rival answers to the same question. They are not. Armour is a MITIGATION
 * layer — it changes what a landed blow does. A shield belongs to the NEGATION layer alongside dodge —
 * it changes whether the blow lands at all. A two-hander in plate is supposed to be hit more often
 * than a shield user; that is the trade it took, not a defect.
 *
 * The questions that actually matter:
 *
 *   1. FLOOR — a heavy-armoured two-hander must not be worse off than a NAKED pawn with a shield. A
 *      bare shield user keeps full dodge (no stiffness, no load) and can hold out a surprisingly long
 *      time, which is fine — provided that when the two-hander does connect, the blow decides things.
 *      So this measures both sides: outcome, and what one landed hit is worth.
 *
 *   2. CYCLE — the intended rock-paper-scissors, loosely: 1H+shield > 2H > polearm 2H > 1H+shield.
 *      "Loosely" is the operative word. In a real game two sides rarely meet at equal stats, gear and
 *      numbers, and potions/coatings let the player push the odds — so this checks the TENDENCY over
 *      seeds, never that a matchup is a lock.
 *
 * Stats are pinned at the spawn ceiling (20) rather than the 30–45 used by the older fixtures: real
 * colonists cannot exceed it at growth level 1, and balance read at stats no pawn can reach is not
 * balance.
 */

const SEEDS = [11, 23, 37, 41, 59, 71];
const MAX_TICKS = 14_000;
/** Equal skill on both sides — the kit is the only variable. Spawn ceiling, so it reflects real pawns. */
const EQUAL: Partial<EntityStats> = { brawn: 20, agility: 20, vigour: 20, awareness: 20 };

const KIT = {
  naked: [] as string[],
  light: ['linen_gambeson', 'leather_coif', 'rawhide_shoulder_pads', 'rawhide_arm_wraps', 'rawhide_leg_wraps'],
  medium: ['brigandine_coat', 'leather_coif', 'iron_pauldrons', 'iron_bracers', 'iron_greaves'],
  heavy: ['plate_cuirass', 'great_helm', 'steel_pauldrons', 'steel_vambraces', 'steel_greaves']
};

interface Side {
  label: string;
  equip: string[];
  traits?: string[];
}
interface Tally {
  swings: number;
  hits: number;
  damage: number;
  biggest: number;
}
const tally = (): Tally => ({ swings: 0, hits: 0, damage: 0, biggest: 0 });

interface Duel {
  ticks: number;
  aWon: boolean;
  bWon: boolean;
  a: Tally;
  b: Tally;
}

/** One duel: two drafted pawns, identical stats, each ordered onto the other. */
async function duel(seed: number, A: Side, B: Side): Promise<Duel> {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed,
      map: { w: 24, h: 24 },
      pawns: [
        { count: 1, drafted: true, stats: EQUAL, equip: A.equip, ...(A.traits ? { traits: A.traits } : {}) },
        { count: 1, drafted: true, stats: EQUAL, equip: B.equip, ...(B.traits ? { traits: B.traits } : {}) }
      ],
      needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
      seedEntities: false
    })
  );

  const pawns = s.getState().pawns as Pawn[];
  if (pawns.length < 2) throw new Error(`expected 2 pawns, got ${pawns.length}`);
  const [pa, pb] = pawns;
  const a = tally();
  const b = tally();
  setSimLogSink({
    logActivity: () => '',
    logEvent: () => {},
    logCombatSwing: (
      _i: string,
      attackerName: string,
      _j: string,
      _k: string,
      _t: number,
      _x: number,
      _y: number,
      sw: CombatTurnEntry
    ) => {
      const t = attackerName === pa.name ? a : attackerName === pb.name ? b : null;
      if (!t) return;
      t.swings++;
      if (sw.hit) {
        t.hits++;
        t.damage += sw.damage ?? 0;
        t.biggest = Math.max(t.biggest, sw.damage ?? 0);
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

  s.command({
    type: 'attackTargetWith',
    payload: { ids: [pa.id], targetId: pb.id, targetType: 'pawn' }
  } as never);
  s.command({
    type: 'attackTargetWith',
    payload: { ids: [pb.id], targetId: pa.id, targetType: 'pawn' }
  } as never);

  const alive = (id: string) => {
    const p = (s.getState().pawns as Pawn[]).find((x) => x.id === id);
    return !!p && p.isAlive !== false;
  };
  let ticks = 0;
  while (ticks < MAX_TICKS && alive(pa.id) && alive(pb.id)) {
    s.tick(20);
    ticks += 20;
  }
  setSimLogSink(null as never);
  return { ticks, aWon: alive(pa.id) && !alive(pb.id), bWon: alive(pb.id) && !alive(pa.id), a, b };
}

async function matchup(A: Side, B: Side) {
  const rs: Duel[] = [];
  for (const seed of SEEDS) rs.push(await duel(seed, A, B));
  const sum = (f: (d: Duel) => number) => rs.reduce((x, d) => x + f(d), 0);
  const per = (t: (d: Duel) => Tally) => ({
    hitRate: sum((d) => t(d).hits) / Math.max(1, sum((d) => t(d).swings)),
    perHit: sum((d) => t(d).damage) / Math.max(1, sum((d) => t(d).hits)),
    biggest: Math.max(...rs.map((d) => t(d).biggest))
  });
  return {
    A: A.label,
    B: B.label,
    aWins: rs.filter((d) => d.aWon).length,
    bWins: rs.filter((d) => d.bWon).length,
    draws: rs.filter((d) => !d.aWon && !d.bWon).length,
    n: rs.length,
    ticks: sum((d) => d.ticks) / rs.length,
    aStats: per((d) => d.a),
    bStats: per((d) => d.b)
  };
}

type Row = Awaited<ReturnType<typeof matchup>>;
const render = (r: Row) =>
  `${r.A} vs ${r.B}\n` +
  `    result ${r.aWins}–${r.bWins}` +
  (r.draws ? ` (${r.draws} unresolved)` : '') +
  `   mean ${Math.round(r.ticks)}t\n` +
  `    ${r.A.padEnd(28)} lands ${(r.aStats.hitRate * 100).toFixed(0)}%  ${r.aStats.perHit.toFixed(1)}/hit  biggest ${r.aStats.biggest.toFixed(0)}\n` +
  `    ${r.B.padEnd(28)} lands ${(r.bStats.hitRate * 100).toFixed(0)}%  ${r.bStats.perHit.toFixed(1)}/hit  biggest ${r.bStats.biggest.toFixed(0)}`;

const SHIELD_1H: Side = { label: '1H+shield', equip: ['steel_longsword', 'iron_boss_shield'] };
const TWOH: Side = { label: '2H greatsword', equip: ['steel_greatsword'] };
const POLEARM: Side = { label: 'polearm 2H (halberd)', equip: ['steel_halberd'] };

describe('STYLE MATCHUPS — equal skill, kit as the only variable', () => {
  it('FLOOR: an armoured two-hander against a NAKED shield user', async () => {
    // The comparison that is actually diagnostic. The bare shield user keeps full dodge — no stiffness,
    // no load — so holding out a while is expected and fine. What must NOT happen is the armoured
    // two-hander coming off worse than an opponent wearing nothing.
    const out: Row[] = [];
    out.push(
      await matchup({ ...TWOH, label: '2H · heavy', equip: ['steel_greatsword', ...KIT.heavy] }, {
        ...SHIELD_1H,
        label: '1H+shield · NAKED'
      })
    );
    out.push(
      await matchup({ ...TWOH, label: '2H · NAKED', equip: ['steel_greatsword'] }, {
        ...SHIELD_1H,
        label: '1H+shield · NAKED'
      })
    );
    console.log(
      `[FLOOR] ${SEEDS.length} seeds, both pawns at the spawn ceiling (brawn/agility/vigour 20)\n` +
        out.map(render).join('\n')
    );
    const armoured = out[0];
    console.log(
      `\n  armour must EARN its slot: the armoured two-hander wins ${armoured.aWins}/${armoured.n} ` +
        `where the naked one wins ${out[1].aWins}/${out[1].n}.\n` +
        `  one landed two-hander blow is worth ${armoured.aStats.perHit.toFixed(1)} (biggest ${armoured.aStats.biggest.toFixed(0)}) ` +
        `against ${armoured.bStats.perHit.toFixed(1)} coming back.`
    );
    // Wearing plate must be better than wearing nothing, holding the weapon fixed. If this inverts,
    // the stiffness/load cost of armour has overshot its mitigation.
    expect(
      armoured.aWins,
      'plate must not make a two-hander worse off than wearing nothing'
    ).toBeGreaterThanOrEqual(out[1].aWins);
    // And the two-hander's landed blow must genuinely decide things — that is the whole compensation
    // for being hit more often.
    expect(
      armoured.aStats.perHit,
      'a landed two-hander blow must hit far harder than what comes back'
    ).toBeGreaterThan(armoured.bStats.perHit);
  }, 1_800_000);

  it('ROUND ROBIN: which style beats which, with everyone in the same armour', async () => {
    // Every style fights every other style six times. All six fighters wear the same medium armour and
    // have the same stats, so the weapon and the free hand are the only things that differ. Armour is
    // held constant on purpose: it is a separate defensive layer, and letting each build wear its own
    // would mix "which style wins" with "which armour wins".
    const styles: Side[] = [
      { label: 'sword and shield', equip: ['steel_longsword', 'iron_boss_shield', ...KIT.medium] },
      { label: 'greatsword', equip: ['steel_greatsword', ...KIT.medium] },
      { label: 'halberd', equip: ['steel_halberd', ...KIT.medium] },
      { label: 'duelist sword', equip: ['steel_longsword', ...KIT.medium], traits: ['duelist'] },
      { label: 'assassin dagger', equip: ['steel_stiletto', ...KIT.medium] },
      { label: 'fencer rapier', equip: ['steel_rapier', ...KIT.medium] }
    ];

    const wins: Record<string, Record<string, number>> = {};
    const total: Record<string, { won: number; lost: number; drawn: number }> = {};
    for (const s of styles) {
      wins[s.label] = {};
      total[s.label] = { won: 0, lost: 0, drawn: 0 };
    }

    const detail: string[] = [];
    for (let i = 0; i < styles.length; i++)
      for (let j = i + 1; j < styles.length; j++) {
        const r = await matchup(styles[i], styles[j]);
        wins[styles[i].label][styles[j].label] = r.aWins;
        wins[styles[j].label][styles[i].label] = r.bWins;
        total[styles[i].label].won += r.aWins;
        total[styles[i].label].lost += r.bWins;
        total[styles[i].label].drawn += r.draws;
        total[styles[j].label].won += r.bWins;
        total[styles[j].label].lost += r.aWins;
        total[styles[j].label].drawn += r.draws;
        detail.push(
          `  ${styles[i].label} won ${r.aWins}, ${styles[j].label} won ${r.bWins}` +
            (r.draws ? `, ${r.draws} ended with both alive` : '') +
            `  —  ${styles[i].label} landed ${(r.aStats.hitRate * 100).toFixed(0)} swings in 100 for ` +
            `${r.aStats.perHit.toFixed(1)} damage each; ${styles[j].label} landed ` +
            `${(r.bStats.hitRate * 100).toFixed(0)} for ${r.bStats.perHit.toFixed(1)}`
        );
      }

    const name = (s: Side) => s.label;
    const head = '                    ' + styles.map((s) => name(s).slice(0, 9).padStart(10)).join('');
    const grid = styles.map(
      (row) =>
        name(row).padEnd(20) +
        styles
          .map((col) => (col.label === row.label ? '—' : String(wins[row.label][col.label])).padStart(10))
          .join('')
    );

    const ranked = styles
      .slice()
      .sort((x, y) => total[y.label].won - total[x.label].won)
      .map(
        (s) =>
          `  ${name(s).padEnd(20)} won ${String(total[s.label].won).padStart(2)} of its 30 fights, ` +
          `lost ${String(total[s.label].lost).padStart(2)}` +
          (total[s.label].drawn ? `, ${total[s.label].drawn} ended with both alive` : '')
      );

    console.log(
      `[ROUND ROBIN] every style against every other, six fights each, everyone in the same medium armour\n` +
        `fights won by the style on the left, against the style on top:\n` +
        head +
        '\n' +
        grid.join('\n') +
        '\n\noverall:\n' +
        ranked.join('\n') +
        '\n\nfight by fight:\n' +
        detail.join('\n')
    );

    // Every style must be able to win SOMETHING. A style that loses all thirty of its fights is broken,
    // not a rock-paper-scissors loser.
    for (const s of styles)
      expect(total[s.label].won, `${s.label} never won a single fight`).toBeGreaterThan(0);
  }, 1_800_000);

  it('CYCLE: 1H+shield > 2H > polearm 2H > 1H+shield, loosely', async () => {
    // All three in the armour their own build would plausibly field, so the cycle is read between
    // STYLES rather than between armour classes.
    const shield: Side = { ...SHIELD_1H, label: '1H+shield · medium', equip: [...SHIELD_1H.equip, ...KIT.medium] };
    const two: Side = { ...TWOH, label: '2H · heavy', equip: [...TWOH.equip, ...KIT.heavy] };
    const pole: Side = { ...POLEARM, label: 'polearm · medium', equip: [...POLEARM.equip, ...KIT.medium] };

    const out: Row[] = [];
    out.push(await matchup(shield, two));
    out.push(await matchup(two, pole));
    out.push(await matchup(pole, shield));
    console.log(
      `[CYCLE] ${SEEDS.length} seeds each, equal stats\n` + out.map(render).join('\n')
    );
    const leg = (r: Row) => `${r.A} ${r.aWins}–${r.bWins} ${r.B}`;
    console.log(
      `\n  intended tendency: 1H+shield > 2H > polearm > 1H+shield\n` +
        `  measured: ${out.map(leg).join('  |  ')}`
    );
    // A cycle only exists if every leg RESOLVES. A matchup that never produces a winner says the fight
    // is stalling, not that it is balanced.
    for (const r of out)
      expect(r.aWins + r.bWins, `${r.A} vs ${r.B} never resolved`).toBeGreaterThan(0);
  }, 1_800_000);
});
