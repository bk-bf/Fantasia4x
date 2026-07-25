import { describe, it, expect } from 'vitest';
import { buildScenario } from '$lib/game/headless/Scenario';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import type { GameState, Pawn } from '$lib/game/core/types';

/**
 * FSM TRANSITION & INTERRUPT-PRIORITY audit (headless). Drives the REAL sim to prove the tickPawn
 * priority ladder and clean job hand-off. Priority order in PawnStateMachine.tickPawn:
 *   collapse (consciousness) > mental breakdown > DRAFT (skips behaviour) > combat threat > needs > work.
 * A losing pull must release its job to the pool (claimedBy → null) with no lost/duplicated work.
 */
const stk = (s: HeadlessSession) => (s.getState().stockpile ?? {}) as Record<string, number>;
const gs = (s: HeadlessSession) => s.getState() as GameState;
const pawn = (s: HeadlessSession, i = 0) => gs(s).pawns[i] as Pawn;
const stateOf = (s: HeadlessSession, id: string) => gs(s).pawns.find((p) => p.id === id)?.currentState;
// A pawn that is actively engaged on a colony job (claimed a job / has an active craft).
const busyPawn = (s: HeadlessSession) => {
  const jobs = (gs(s).jobs ?? []) as Array<{ claimedBy?: string | null }>;
  const claimedIds = new Set(jobs.filter((j) => j.claimedBy).map((j) => j.claimedBy));
  return gs(s).pawns.find(
    (p) => claimedIds.has(p.id) || p.activeJob || ['Working', 'MovingToResource', 'Hauling'].includes(p.currentState ?? '')
  );
};

async function workingColony(seed: number, extra: Partial<Parameters<typeof buildScenario>[0]> = {}) {
  const s = new HeadlessSession();
  await s.start(
    buildScenario({
      seed,
      map: { w: 18, h: 18 },
      workReady: true,
      needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
      pawns: [{ count: 4, skillLevel: 20 }],
      buildings: [{ id: 'craft_spot' }],
      items: { plant_fiber: 200, spit_meat: 10 },
      seedEntities: false,
      ...extra
    })
  );
  return s;
}

describe('FSM transitions & interrupt priority', () => {
  it('DRAFT interrupts an active job cleanly — job returns to the pool, no lost/duplicated work', async () => {
    const s = await workingColony(101);
    s.command({ type: 'craftItem', payload: { itemId: 'cordage', quantity: 4 } } as never);
    // let a pawn claim + start the craft
    for (let i = 0; i < 20 && !busyPawn(s); i++) s.tick(50);
    const worker = busyPawn(s);
    expect(worker, 'a pawn is actively working the craft').toBeTruthy();
    const claimedBefore = (gs(s).jobs ?? []).filter((j: { claimedBy?: string | null }) => j.claimedBy === worker!.id).length;
    // DRAFT it mid-job
    s.command({ type: 'toggleDraft', payload: { pawnId: worker!.id } } as never);
    s.tick(30);
    const w2 = gs(s).pawns.find((p) => p.id === worker!.id)!;
    const stillClaimed = (gs(s).jobs ?? []).filter((j: { claimedBy?: string | null }) => j.claimedBy === worker!.id).length;
    console.log(`[FSM draft>job] worker ${worker!.currentState}→${w2.currentState}; claimed ${claimedBefore}→${stillClaimed}; drafted=${w2.drafted}`);
    expect(w2.drafted, 'the pawn is now drafted').toBe(true);
    expect(stillClaimed, 'drafting released the claimed job back to the pool').toBe(0);
    expect(w2.activeJob, 'no dangling active job').toBeFalsy();
    // un-draft → the colony finishes the batch EXACTLY once (no lost/duplicated work)
    s.command({ type: 'toggleDraft', payload: { pawnId: worker!.id } } as never);
    for (let i = 0; i < 40 && (stk(s).cordage ?? 0) < 4; i++) s.tick(100);
    console.log(`[FSM draft>job] batch completed cordage=${stk(s).cordage ?? 0} (queued 4)`);
    expect(stk(s).cordage ?? 0, 'the 4-unit batch completes exactly, no work lost or double-counted').toBe(4);
  });

  it('COMBAT threat interrupts work: an adjacent hostile pulls a working pawn into Fighting, job released', async () => {
    const s = await workingColony(102);
    s.command({ type: 'craftItem', payload: { itemId: 'cordage', quantity: 6 } } as never);
    for (let i = 0; i < 20 && !busyPawn(s); i++) s.tick(50);
    const worker = busyPawn(s)!;
    const pos = gs(s).pawns.find((p) => p.id === worker.id)!.position!;
    // spawn a hostile ADJACENT (defensive stance engages at range 1, no vision gate)
    s.command({ type: 'devSpawnMobAt', payload: { creatureId: 'goblin', x: pos.x + 1, y: pos.y } } as never);
    for (let i = 0; i < 12 && stateOf(s, worker.id) !== 'Fighting' && stateOf(s, worker.id) !== 'Fleeing'; i++) s.tick(20);
    const st = stateOf(s, worker.id);
    const stillClaimed = (gs(s).jobs ?? []).filter((j: { claimedBy?: string | null }) => j.claimedBy === worker.id).length;
    console.log(`[FSM combat>job] worker state=${st}; still-claimed=${stillClaimed}`);
    expect(['Fighting', 'Fleeing'], 'an adjacent hostile pulls the pawn into a combat state').toContain(st);
    expect(stillClaimed, 'entering combat released the claimed job').toBe(0);
  });

  it('DRAFT overrides combat auto-engage: a drafted pawn does NOT auto-fight an adjacent hostile', async () => {
    const s = await workingColony(103);
    const p = pawn(s, 0);
    s.command({ type: 'toggleDraft', payload: { pawnId: p.id } } as never);
    s.tick(10);
    const pos = gs(s).pawns.find((x) => x.id === p.id)!.position!;
    s.command({ type: 'devSpawnMobAt', payload: { creatureId: 'goblin', x: pos.x + 1, y: pos.y } } as never);
    for (let i = 0; i < 12; i++) s.tick(20);
    const st = stateOf(s, p.id);
    const drafted = gs(s).pawns.find((x) => x.id === p.id)!.drafted;
    console.log(`[FSM draft>combat] drafted pawn beside a hostile → state=${st} drafted=${drafted}`);
    expect(drafted, 'the pawn stays under player control (drafted)').toBe(true);
    expect(st, 'a drafted pawn does NOT auto-engage — the player commands it').not.toBe('Fighting');
  });

  it('DRAFT overrides a non-critical need; clearing the order returns to need-driven behaviour', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 104,
        map: { w: 16, h: 16 },
        workReady: true,
        needsDisabled: ['fatigue', 'thirst', 'hygiene'], // hunger LIVE
        pawns: [{ count: 3, skillLevel: 20, needs: { hunger: 92 } }], // hungry enough to seek food
        buildings: [{ id: 'craft_spot' }],
        items: { spit_meat: 40, plant_fiber: 40 },
        seedEntities: false
      })
    );
    const p = pawn(s, 0);
    s.command({ type: 'toggleDraft', payload: { pawnId: p.id } } as never);
    // a drafted, hungry pawn holds — it does NOT walk off to eat (forceWork skips the need)
    for (let i = 0; i < 20; i++) s.tick(60);
    const draftedState = stateOf(s, p.id);
    console.log(`[FSM draft>need] drafted hungry pawn state=${draftedState}`);
    expect(['Eating', 'MovingToNeed'], 'a drafted pawn ignores a non-critical hunger need').not.toContain(draftedState);
    // clear the draft → it resumes normal need-driven behaviour and goes to eat
    s.command({ type: 'toggleDraft', payload: { pawnId: p.id } } as never);
    let ate = false;
    for (let i = 0; i < 30 && !ate; i++) {
      s.tick(60);
      if (['Eating', 'MovingToNeed'].includes(stateOf(s, p.id) ?? '')) ate = true;
    }
    console.log(`[FSM draft>need] after un-draft → sought food: ${ate} (state=${stateOf(s, p.id)})`);
    expect(ate, 'un-drafting returns the pawn to need-driven behaviour (it goes to eat)').toBe(true);
  });

  it('COLLAPSE lifecycle & collapse-over-draft: a drafted pawn beaten down goes Collapsed (draft released), then recovers', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 105,
        map: { w: 16, h: 16 },
        workReady: true,
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        // one deliberately frail pawn (low STR/CON) that can't fight the goblins off
        pawns: [{ count: 1, skillLevel: 5, stats: { strength: 4, constitution: 6, dexterity: 8 } }],
        buildings: [{ id: 'campfire' }],
        items: { spit_meat: 10 },
        seedEntities: false
      })
    );
    const p = pawn(s, 0);
    const pos = p.position!;
    // draft the frail pawn (so it does NOT fight back — a drafted pawn skips the combat behaviour) and
    // surround it with goblins whose cumulative pain downs it (pain-collapse, recoverable, not death).
    s.command({ type: 'toggleDraft', payload: { pawnId: p.id } } as never);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
      s.command({ type: 'devSpawnMobAt', payload: { creatureId: 'goblin', x: pos.x + dx, y: pos.y + dy } } as never);
    let collapsed = false;
    for (let i = 0; i < 60 && !collapsed; i++) {
      s.tick(30);
      if (stateOf(s, p.id) === 'Collapsed') collapsed = true;
      if (gs(s).pawns.find((x) => x.id === p.id)?.isAlive === false) break;
    }
    const downedDraft = gs(s).pawns.find((x) => x.id === p.id)?.drafted;
    console.log(`[FSM collapse] frail drafted pawn → state=${stateOf(s, p.id)} drafted=${downedDraft} alive=${gs(s).pawns.find((x) => x.id === p.id)?.isAlive}`);
    expect(collapsed, 'cumulative pain downs the pawn into Collapsed (recoverable, not killed)').toBe(true);
    expect(downedDraft, 'going down RELEASES the draft — an unconscious pawn can\'t be commanded').toBe(false);
    // clear the threat, then confirm it is HELD down and eventually RECOVERS to Idle
    for (const m of [...(gs(s).mobs ?? [])]) s.command({ type: 'devKillEntity', payload: { id: (m as { id: string }).id } } as never);
    s.tick(30);
    expect(stateOf(s, p.id), 'still held down right after the threat clears').toBe('Collapsed');
    let recovered = false;
    for (let i = 0; i < 200 && !recovered; i++) {
      s.tick(60);
      const st = stateOf(s, p.id);
      // Recovery = it left the downed state (stands back up), typically into rest to mend its wounds.
      if (st && st !== 'Collapsed' && gs(s).pawns.find((x) => x.id === p.id)?.isAlive !== false) recovered = true;
    }
    console.log(`[FSM collapse] stood back up: ${recovered} (state=${stateOf(s, p.id)})`);
    expect(recovered, 'once consciousness recovers the pawn stands back up out of Collapsed (into rest/idle)').toBe(true);
  });

  it('STUCK / OSCILLATION invariant: a realistic colony over thousands of ticks never wedges a pawn', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 106,
        map: { w: 24, h: 24 },
        workReady: true,
        // all needs LIVE so pawns cycle work ↔ eat/sleep/drink/wash/socialise
        pawns: [{ count: 6, skillLevel: 20 }],
        buildings: [
          { id: 'craft_spot' },
          { id: 'campfire' },
          { id: 'hay_bed' },
          { id: 'hay_bed' },
          { id: 'well' },
          { id: 'log_stool' }
        ],
        items: { plant_fiber: 400, spit_meat: 60 },
        seedEntities: false
      })
    );
    s.command({ type: 'craftItem', payload: { itemId: 'cordage', quantity: 40 } } as never);
    const TRANSIENT = new Set(['MovingToResource', 'MovingToNeed', 'MovingToDeposit', 'Hauling']);
    const seen = new Map<string, Set<string>>();
    const transientRun = new Map<string, number>(); // consecutive samples stuck in a transient state
    let maxTransientRun = 0;
    const SAMPLES = 40;
    for (let k = 0; k < SAMPLES; k++) {
      s.tick(400); // ~16000 ticks total
      for (const p of gs(s).pawns) {
        const st = p.currentState ?? 'Idle';
        (seen.get(p.id) ?? seen.set(p.id, new Set()).get(p.id)!).add(st);
        const prev = transientRun.get(p.id) ?? 0;
        const run = TRANSIENT.has(st) ? prev + 1 : 0;
        transientRun.set(p.id, run);
        if (run > maxTransientRun) maxTransientRun = run;
      }
    }
    const distinctPerPawn = [...seen.values()].map((set) => set.size);
    const anyDead = gs(s).pawns.some((p) => p.isAlive === false);
    const union = [...new Set([...seen.values()].flatMap((set) => [...set]))].sort();
    console.log(`[FSM stuck] distinct states/pawn=${distinctPerPawn.join(',')}; longest transient run=${maxTransientRun} samples (×400t); dead=${anyDead}`);
    console.log(`[FSM stuck] states exercised across the colony: ${union.join(', ')}`);
    // no pawn frozen in one state the whole run (each cycled through ≥2 states) …
    expect(Math.min(...distinctPerPawn), 'every pawn transitioned through multiple states — none frozen').toBeGreaterThan(1);
    // … and none wedged in a movement/haul state across many consecutive samples (the classic stuck bug)
    expect(maxTransientRun, 'no pawn is stuck in a MovingTo*/Hauling state for thousands of ticks').toBeLessThan(6);
    expect(anyDead, 'no pawn died from a behavioural deadlock in a provisioned colony').toBe(false);
  });

  it('AUTO RESCUE (caretaking job, NOT drafted): an idle caretaker carries a downed colonist to shelter, entering Rescuing', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 107,
        map: { w: 16, h: 16 },
        workReady: true, // caretaking labor on for everyone
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene'],
        pawns: [
          { count: 1, skillLevel: 5, stats: { strength: 4, constitution: 6, dexterity: 8 } }, // frail victim
          { count: 2, skillLevel: 20 } // able caretakers
        ],
        buildings: [{ id: 'hay_bed' }], // a rest building → shelter to carry to
        items: { spit_meat: 10 },
        seedEntities: false
      })
    );
    const victim = pawn(s, 0);
    const vpos = victim.position!;
    const bed = (gs(s).buildings ?? []).find((b) => (b as { type?: string }).type === 'hay_bed') as { x: number; y: number };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]] as const)
      s.command({ type: 'devSpawnMobAt', payload: { creatureId: 'goblin', x: vpos.x + dx, y: vpos.y + dy } } as never);
    for (let i = 0; i < 80 && stateOf(s, victim.id) !== 'Collapsed'; i++) {
      s.tick(30);
      if (gs(s).pawns.find((x) => x.id === victim.id)?.isAlive === false) break;
    }
    expect(stateOf(s, victim.id), 'victim is down').toBe('Collapsed');
    // clear the threat — then issue NO draft/command. An idle caretaker should pick up the rescue as a JOB.
    for (const m of [...(gs(s).mobs ?? [])]) s.command({ type: 'devKillEntity', payload: { id: (m as { id: string }).id } } as never);
    let sawRescuing = false;
    let everCarried = false;
    let delivered = false;
    for (let i = 0; i < 400 && !delivered; i++) {
      s.tick(3); // fine-grained: the carry is fast, so sample often to catch Rescuing / carriedBy
      const carrier = gs(s).pawns.find((p) => p.id !== victim.id && p.currentState === 'Rescuing');
      if (carrier) sawRescuing = true;
      const v = gs(s).pawns.find((p) => p.id === victim.id) as { carriedBy?: string; position?: { x: number; y: number } };
      if (v.carriedBy) everCarried = true;
      // delivered = the downed colonist has been laid on (or next to) the bed and no longer being carried
      if (!v.carriedBy && v.position && Math.abs(v.position.x - bed.x) + Math.abs(v.position.y - bed.y) <= 1) delivered = true;
    }
    const anyDrafted = gs(s).pawns.some((p) => p.drafted);
    void everCarried; // the ~1-tick carriedBy window is often skipped by sampling; `delivered` proves the carry
    console.log(`[FSM auto-rescue] entered Rescuing=${sawRescuing}; carriedBy seen=${everCarried}; delivered to bed=${delivered}; anyone drafted=${anyDrafted}`);
    // The three signals that prove the feature: the new Rescuing state is LIVE, the downed colonist was
    // moved from its collapse tile to the shelter, and it all happened as a caretaking JOB (no draft).
    expect(sawRescuing, 'an idle caretaker took the rescue JOB and entered the (now-live) Rescuing state').toBe(true);
    expect(delivered, 'the downed colonist was carried to the shelter (bed) and set down').toBe(true);
    expect(anyDrafted, 'the rescue happened via the caretaking JOB, with NO pawn drafted').toBe(false);
  });

  it('BREAKDOWN is an uncontrollable state (draft refused): a broken pawn can\'t be commanded out of it', async () => {
    const s = new HeadlessSession();
    await s.start(
      buildScenario({
        seed: 108,
        map: { w: 18, h: 18 },
        pawns: [
          { count: 10, needs: { hunger: 100, fatigue: 100, thirst: 100, hygiene: 100, relaxation: 0, comfort: 0 } }
        ],
        needsDisabled: ['hunger', 'fatigue', 'thirst', 'hygiene', 'relaxation', 'comfort'],
        seedEntities: false
      })
    );
    const BREAK = new Set(['Crying', 'Hiding', 'Panicking']);
    const observed = new Set<string>();
    let brokenId: string | undefined;
    for (let i = 0; i < 40 && !brokenId; i++) {
      s.tick(400);
      for (const p of gs(s).pawns) {
        const st = p.currentState ?? '';
        if (BREAK.has(st)) {
          observed.add(st);
          brokenId = p.id;
        }
      }
    }
    console.log(`[FSM breakdown] uncontrollable states reached: ${[...observed].join(', ') || 'none'}`);
    expect(brokenId, 'a sustained-miserable colony produced an uncontrollable mental breakdown').toBeTruthy();
    // Try to DRAFT the broken pawn out of it — the order must be refused (breakdown outranks draft).
    const before = stateOf(s, brokenId!);
    s.command({ type: 'toggleDraft', payload: { pawnId: brokenId! } } as never);
    s.tick(30);
    const after = gs(s).pawns.find((p) => p.id === brokenId)!;
    console.log(`[FSM breakdown] draft during breakdown: state ${before}→${after.currentState}, drafted=${after.drafted}`);
    expect(BREAK.has(after.currentState ?? ''), 'the pawn stays in its breakdown — a draft can\'t command it out').toBe(true);
    expect(after.drafted, 'the breakdown refuses the draft (like Collapsed)').toBe(false);
  });
});
