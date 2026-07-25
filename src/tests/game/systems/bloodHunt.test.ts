import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import type { GameState, Pawn } from '$lib/game/core/types';

/**
 * BLOOD HUNT audit (LINEAGES-II, headless). A pawn with a lineage `bloodNeedKind` (vampire/werewolf)
 * fills `bloodHunger` ~2/game-hour; at the feed threshold a vampiric one FEEDS on the nearest colonist,
 * and if it can't feed to the brim the `bloodthirst` rage SEIZES it into the uncontrollable BLOOD_HUNT
 * state (draft refused, like Collapsed). Driven with the `devSetBloodNeed` lever (the harness couldn't
 * spawn a blood-need pawn before — this closes the audit's [~]). TICKS_PER_GAME_HOUR = 750.
 */
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
        pawns: [{ count: 1, skillLevel: 10 }], // ALONE → no colonist to feed on → it rages
        seedEntities: false
      })
    );
    const v = P(s, 0);
    // Vampire, blood-hunger already at the brim: the next hourly tick tips it into the rage.
    s.command({ type: 'devSetBloodNeed', payload: { pawnId: v.id, kind: 'humanoid', bloodHunger: 100 } } as never);
    for (let i = 0; i < 6 && stateOf(s, v.id) !== 'BloodHunt'; i++) s.tick(200); // cross a 750-tick hour boundary
    console.log(`[BLOOD rage] lone vampire state=${stateOf(s, v.id)} @turn ${gs(s).turn}`);
    expect(stateOf(s, v.id), 'the unfed rage seizes the pawn into BloodHunt').toBe('BloodHunt');
    // Try to DRAFT it out — refused, exactly like Collapsed/breakdown (the hunger does not answer to orders).
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
        pawns: [{ count: 2, skillLevel: 10 }], // a vampire + a colonist to feed on
        seedEntities: false
      })
    );
    const vamp = P(s, 0);
    const prey = P(s, 1);
    const preyBlood0 = blood(s, prey.id);
    // Seize the rage right now (rage:true stamps bloodthirst directly).
    s.command({ type: 'devSetBloodNeed', payload: { pawnId: vamp.id, kind: 'humanoid', bloodHunger: 100, rage: true } } as never);
    let sawRage = false;
    for (let i = 0; i < 120; i++) {
      s.tick(1); // per-tick: the seize→feed→sate cycle resolves within a single tick when prey is adjacent
      if (stateOf(s, vamp.id) === 'BloodHunt') sawRage = true;
    }
    const preyBlood1 = blood(s, prey.id);
    const endState = stateOf(s, vamp.id);
    const hunger = (gs(s).pawns.find((p) => p.id === vamp.id) as { needs?: { bloodHunger?: number } })?.needs?.bloodHunger ?? 0;
    console.log(`[BLOOD feed] raged=${sawRage}; prey blood ${preyBlood0.toFixed(0)}→${preyBlood1.toFixed(0)}; vampire ended=${endState} bloodHunger=${hunger.toFixed(0)}`);
    // The substance: it FED (prey lost blood), it SATED (bloodHunger reset), and control RETURNED (not raging).
    expect(preyBlood1, 'it fed on the colonist — the prey lost blood').toBeLessThan(preyBlood0);
    expect(hunger, 'feeding reset the blood hunger').toBeLessThan(50);
    expect(endState, 'once fed, control returns — it is no longer in BloodHunt').not.toBe('BloodHunt');
  });
});
