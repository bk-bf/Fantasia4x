import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import type { GameState, Pawn } from '$lib/game/core/types';

const gs = (s: HeadlessSession) => s.getState() as GameState;
const P = (s: HeadlessSession, i: number) => gs(s).pawns[i] as Pawn;
const stateOf = (s: HeadlessSession, id: string) => gs(s).pawns.find((p) => p.id === id)?.currentState;
const blood = (s: HeadlessSession, id: string) =>
  (gs(s).pawns.find((p) => p.id === id) as { bloodVolume?: number })?.bloodVolume ?? 100;

describe('blood hunt (LINEAGES-II)', () => {
  it('an unfed vampire RAGES into the uncontrollable BLOOD_HUNT state; the draft is refused', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 120,
        map: { w: 14, h: 14 },
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        pawns: [{ count: 1, skillLevel: 10 }],
        seedEntities: false
      })
    );
    const v = P(s, 0);
    s.command({ type: 'devSetBloodNeed', payload: { pawnId: v.id, kind: 'humanoid', bloodHunger: 100 } } as never);
    for (let i = 0; i < 6 && stateOf(s, v.id) !== 'BloodHunt'; i++) s.tick(200);
    console.log(`[BLOOD rage] lone vampire state=${stateOf(s, v.id)} @turn ${gs(s).turn}`);
    expect(stateOf(s, v.id), 'the unfed rage seizes the pawn into BloodHunt').toBe('BloodHunt');
    s.command({ type: 'toggleDraft', payload: { pawnId: v.id } } as never);
    s.tick(30);
    const after = gs(s).pawns.find((p) => p.id === v.id)!;
    console.log(`[BLOOD rage] after draft: state=${after.currentState} drafted=${after.drafted}`);
    expect(after.currentState, 'still raging — a draft cannot command it out').toBe('BloodHunt');
    expect(after.drafted, 'the blood hunt refuses the draft').toBe(false);
  });

  it('a raging vampire FEEDS on a nearby colonist (blood drain) and then returns to control', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 121,
        map: { w: 14, h: 14 },
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        pawns: [{ count: 2, skillLevel: 10 }],
        seedEntities: false
      })
    );
    const vamp = P(s, 0);
    const prey = P(s, 1);
    const preyBlood0 = blood(s, prey.id);
    s.command({ type: 'devSetBloodNeed', payload: { pawnId: vamp.id, kind: 'humanoid', bloodHunger: 100, rage: true } } as never);
    let sawRage = false;
    for (let i = 0; i < 120; i++) {
      s.tick(1);
      if (stateOf(s, vamp.id) === 'BloodHunt') sawRage = true;
    }
    const preyBlood1 = blood(s, prey.id);
    const endState = stateOf(s, vamp.id);
    const hunger = (gs(s).pawns.find((p) => p.id === vamp.id) as { needs?: { bloodHunger?: number } })?.needs?.bloodHunger ?? 0;
    console.log(`[BLOOD feed] raged=${sawRage}; prey blood ${preyBlood0.toFixed(0)}→${preyBlood1.toFixed(0)}; vampire ended=${endState} bloodHunger=${hunger.toFixed(0)}`);
    expect(preyBlood1, 'it fed on the colonist — the prey lost blood').toBeLessThan(preyBlood0);
    expect(hunger, 'feeding reset the blood hunger').toBeLessThan(50);
    expect(endState, 'once fed, control returns — it is no longer in BloodHunt').not.toBe('BloodHunt');
  });
});
