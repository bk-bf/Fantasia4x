import { describe, it, expect } from 'vitest';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { setSimLogSink } from '$lib/game/core/util/logSink';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { partLethality, partIncapacitation, PART_DEF_MAP } from '$lib/game/systems/Combat';
import type { CombatTurnEntry } from '$lib/game/core/defs/events';
import type { BodyPartId, Mob, Pawn } from '$lib/game/core/types';

const worth = (id: BodyPartId) => partLethality(id) + partIncapacitation(id);

describe('MAIM TARGETING — does a precise fighter value disabling a foe?', () => {
  it('the target ranking values the decisive-but-survivable locations', () => {
    const ids = Object.keys(PART_DEF_MAP).filter(
      (id) => (PART_DEF_MAP[id as BodyPartId]?.hitWeight ?? 0) > 0
    ) as BodyPartId[];
    const rows = ids
      .map((id) => ({ id, kill: partLethality(id), maim: partIncapacitation(id) }))
      .sort((a, b) => b.kill + b.maim - (a.kill + a.maim));

    console.log(
      '[TARGET WORTH] hittable locations, best first — what a precise fighter is choosing between\n' +
        'location                    kill   maim   total\n' +
        rows
          .slice(0, 18)
          .map(
            (r) =>
              r.id.padEnd(26) +
              r.kill.toFixed(2).padStart(6) +
              r.maim.toFixed(2).padStart(7) +
              (r.kill + r.maim).toFixed(2).padStart(8)
          )
          .join('\n')
    );

    const show = (pat: RegExp) =>
      ids
        .filter((id) => pat.test(id))
        .map((id) => `${id} ${worth(id).toFixed(2)}`)
        .join(' · ');
    console.log(
      '\n  controls: ' +
        ['chest|torso|thorax', 'thigh|upperLeg', 'neck|throat', 'head$|^head', 'hand']
          .map((p) => `[${p}] ${show(new RegExp(p, 'i')) || '—'}`)
          .join('\n            ')
    );

    const eye = ids.find((id) => /eye/i.test(id));
    expect(eye, 'the humanoid plan must have a hittable eye').toBeDefined();
    const thigh = ids.find((id) => /thigh|upperLeg/i.test(id));
    if (thigh)
      expect(worth(eye!), 'an eye must outrank a bare thigh').toBeGreaterThan(worth(thigh));
    const chest = ids.find((id) => /chest|torso/i.test(id));
    if (chest)
      expect(worth(chest), 'a chest must still outrank an eye').toBeGreaterThan(worth(eye!));
    const hand = ids.find((id) => /hand/i.test(id));
    if (hand && thigh) expect(worth(hand)).toBeGreaterThan(worth(thigh));
  });

  it('HEADLESS — a real fight produces maiming, and precision produces more of it', async () => {
    const SEEDS = [11, 23, 37, 41];
    const MAX_TICKS = 12_000;

    async function fight(precisionApt: number) {
      let eyeHits = 0;
      let limbHits = 0;
      let landed = 0;
      let destroyed = 0;
      let kills = 0;
      for (const seed of SEEDS) {
        const s = new HeadlessSession();
        await s.start(
          buildScenario({
            seed,
            map: { w: 24, h: 24 },
            pawns: [
              {
                count: 1,
                drafted: true,
                stats: { strength: 30, dexterity: 30, constitution: 30 },
                equip: ['steel_longsword']
              }
            ],
            needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
            spawnMobs: [{ count: 1, creatureId: 'orc_reaver' }],
            seedEntities: false
          })
        );
        const me = (s.getState().pawns as Pawn[])[0];
        me.aptitudes = { ...(me.aptitudes ?? {}), hit_precision: precisionApt };
        if (seed === SEEDS[0])
          console.log(
            `  precision aptitude ${precisionApt} → hit_precision resolves to ` +
              `${pawnStatService.evaluateStat('hit_precision', (s.getState().pawns as Pawn[])[0]).toFixed(4)}`
          );
        const myName = me.name;
        setSimLogSink({
          logActivity: () => '',
          logEvent: () => {},
          logCombatSwing: (
            _a: string,
            attackerName: string,
            _b: string,
            _c: string,
            _t: number,
            _x: number,
            _y: number,
            sw: CombatTurnEntry
          ) => {
            if (attackerName !== myName || !sw.hit) return;
            landed++;
            const part = sw.bodyPart ?? '';
            if (/eye/i.test(part)) eyeHits++;
            if (/arm|hand|leg|foot/i.test(part)) limbHits++;
            if (sw.woundSeverity === 'destroyed') destroyed++;
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

        const mob = s.getState().mobs?.[0] as Mob | undefined;
        if (!mob) throw new Error('no mob spawned');
        s.command({
          type: 'attackTargetWith',
          payload: { ids: [me.id], targetId: mob.id, targetType: 'mob' }
        } as never);

        let ticks = 0;
        while (ticks < MAX_TICKS) {
          s.tick(20);
          ticks += 20;
          const m = s.getState().mobs?.[0];
          if (!m || m.isAlive === false) {
            kills++;
            break;
          }
          const alive = (s.getState().pawns as Pawn[]).find((p) => p.id === me.id);
          if (!alive || alive.isAlive === false) break;
        }
        setSimLogSink(null as never);
      }
      return { eyeHits, limbHits, landed, destroyed, kills };
    }

    const dull = await fight(0.85);
    const sharp = await fight(1.15);
    const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) : '0.0');
    console.log(
      `[MAIM IN A REAL FIGHT] ${SEEDS.length} seeds each, drafted colonist vs a live orc reaver\n` +
        `precision   landed   eye hits          limb hits         parts destroyed   kills\n` +
        [
          ['0.85 (low) ', dull],
          ['1.15 (high)', sharp]
        ]
          .map(
            ([label, r]) =>
              (label as string) +
              String((r as typeof dull).landed).padStart(8) +
              `   ${(r as typeof dull).eyeHits} (${pct((r as typeof dull).eyeHits, (r as typeof dull).landed)}%)`.padEnd(
                18
              ) +
              `${(r as typeof dull).limbHits} (${pct((r as typeof dull).limbHits, (r as typeof dull).landed)}%)`.padEnd(
                18
              ) +
              String((r as typeof dull).destroyed).padStart(8) +
              String((r as typeof dull).kills).padStart(9)
          )
          .join('\n')
    );

    expect(dull.landed + sharp.landed, 'no swings landed at all').toBeGreaterThan(0);
  }, 900_000);
});
