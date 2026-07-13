// SOCIAL-LAYER service tests: the daily social pass (relationships forming from shared work,
// conversations, standing moods, breaks), the death/grief hook, and the starting-kin pass.
import { describe, it, expect, beforeEach } from 'vitest';
import { socialService } from './SocialService';
import { linkStartingKin, remapKinIds } from '../entities/Pawns';
import { findRelationship } from '../core/Social';
import { rng } from '../core/rng';
import type { GameState, Pawn, PawnRelationship } from '../core/types';

function pawn(id: string, x: number, y: number, extra: Partial<Pawn> = {}): Pawn {
  return {
    id,
    name: `${id.replace('pawn-', 'Pawn')} Test`,
    isAlive: true,
    position: { x, y },
    cultureId: 'c1',
    age: 30,
    stats: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      perception: 10,
      charisma: 10
    },
    traits: [],
    equipment: {},
    inventory: { items: {}, instances: [] },
    state: { mood: 50, isWorking: false, isSleeping: false, isEating: false },
    needs: { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    currentState: 'Idle',
    skills: {},
    ...extra
  } as unknown as Pawn;
}

function stateWith(pawns: Pawn[], extra: Partial<GameState> = {}): GameState {
  return {
    turn: 18000, // exactly one day in
    pawns,
    cultureRelations: [{ a: 'c1', b: 'c2', score: -70, disposition: 'hostile' }],
    jobs: [],
    ...extra
  } as unknown as GameState;
}

beforeEach(() => {
  rng.reseed(20260713);
});

describe('relationship seeding through the service', () => {
  it('a fresh pair of hostile-culture pawns starts disliking each other', () => {
    const a = pawn('pawn-1', 5, 5);
    const b = pawn('pawn-2', 6, 5, { cultureId: 'c2' });
    const s = socialService.adjustRelation(stateWith([a, b]), a, b, 0);
    const rel = findRelationship(s.relationships, 'pawn-1', 'pawn-2')!;
    expect(rel.score).toBe(-40);
    expect(rel.stage).toBe('rivals');
  });

  it('event deltas clamp, tally history, and restage', () => {
    const a = pawn('pawn-1', 5, 5);
    const b = pawn('pawn-2', 6, 5);
    let s = stateWith([a, b]);
    s = socialService.adjustRelation(s, a, b, 18, {
      tags: ['rescued_by'],
      label: 'A rescue',
      kind: 'rescue'
    }); // rescue
    const rel = findRelationship(s.relationships, 'pawn-1', 'pawn-2')!;
    expect(rel.score).toBe(15 + 18); // same-culture seed + rescue
    expect(rel.tags).toContain('rescued_by');
    expect(rel.points.history).toBe(18);
    // the moment is logged: the same-people seed baseline + the rescue line
    expect(rel.log?.some((e) => e.kind === 'seed')).toBe(true);
    expect(rel.log?.some((e) => e.kind === 'rescue' && e.delta === 18)).toBe(true);
  });

  it('meetColony gives every living pair at least a Strangers row, idempotently', () => {
    const a = pawn('pawn-1', 5, 5);
    const b = pawn('pawn-2', 6, 5, { cultureId: 'c2' });
    const c = pawn('pawn-3', 40, 40, { cultureId: 'c3' }); // far away — colonists have still met
    const gone = pawn('pawn-4', 5, 6, { isAlive: false });
    const s1 = socialService.meetColony(stateWith([a, b, c, gone]));
    expect(s1.relationships).toHaveLength(3); // the three living pairs, none for the dead
    // unrelated cultures meet as strangers; same-culture pairs seed warmer (+15, acquaintances)
    expect(findRelationship(s1.relationships, 'pawn-2', 'pawn-3')!.stage).toBe('strangers');
    expect(findRelationship(s1.relationships, 'pawn-1', 'pawn-2')!.stage).toBe('rivals'); // hostile seed
    // idempotent: nothing missing → the SAME state ref back, no row duplicated or reset
    const s2 = socialService.meetColony(s1);
    expect(s2).toBe(s1);
  });
});

describe('processSocialTurn (daily pass)', () => {
  it('pawns working side by side grow closer; the state ref changes only when something moved', () => {
    const a = pawn('pawn-1', 5, 5, {
      state: { mood: 50, isWorking: true, isSleeping: false, isEating: false }
    });
    const b = pawn('pawn-2', 6, 5, {
      state: { mood: 50, isWorking: true, isSleeping: false, isEating: false }
    });
    const s0 = stateWith([a, b]);
    const s1 = socialService.processSocialTurn(s0);
    const rel = findRelationship(s1.relationships, 'pawn-1', 'pawn-2')!;
    expect(rel).toBeDefined();
    // same-culture seed +15, worked-together +0.5, plus any conversation delta on top
    expect(rel.score).toBeGreaterThanOrEqual(15);
    expect(rel.points.history).toBeGreaterThan(0);
  });

  it('proximity dialog: pawns within 2 tiles chat (logged), far-apart pawns do not', () => {
    const a = pawn('pawn-1', 5, 5);
    const b = pawn('pawn-2', 6, 5); // adjacent
    const far = pawn('pawn-3', 60, 60); // out of range
    let s = stateWith([a, b, far]);
    // run the throttled dialog tick a few times; cooldowns pace it, so step the clock between
    for (let k = 0; k < 8; k++) {
      s = { ...s, turn: (k + 1) * 90 };
      s = socialService.processDialogTick(s);
    }
    const near = findRelationship(s.relationships, 'pawn-1', 'pawn-2');
    expect(near).toBeDefined();
    const talks = (near!.log ?? []).filter((e) => e.kind === 'talk');
    expect(talks.length).toBeGreaterThan(0);
    expect(talks[0].label.length).toBeGreaterThan(0);
    // the dialog transcript is stored on the event (for the Relations-tab nested log)
    expect(talks[0].lines?.length).toBeGreaterThan(0);
    expect(talks[0].lines![0].text.length).toBeGreaterThan(0);
    // the far pawn never came within range → no dialog rows with it
    expect(findRelationship(s.relationships, 'pawn-1', 'pawn-3')).toBeUndefined();
    expect(findRelationship(s.relationships, 'pawn-2', 'pawn-3')).toBeUndefined();
  });

  it('proximity dialog respects the per-pair cooldown (no back-to-back chatter)', () => {
    const a = pawn('pawn-1', 5, 5);
    const b = pawn('pawn-2', 6, 5);
    let s = stateWith([a, b]);
    // fire many ticks within the cooldown window (25s * 60 = 1500 ticks) at 90-tick spacing
    let chats = 0;
    for (let k = 0; k < 15; k++) {
      s = { ...s, turn: (k + 1) * 90 }; // up to turn 1350 < 1500 cooldown
      const before = findRelationship(s.relationships, 'pawn-1', 'pawn-2')?.log?.length ?? 0;
      s = socialService.processDialogTick(s);
      const after = findRelationship(s.relationships, 'pawn-1', 'pawn-2')?.log?.length ?? 0;
      if (after > before) chats++;
    }
    // seed row aside, at most ONE actual dialog inside a single cooldown window
    expect(chats).toBeLessThanOrEqual(1);
  });

  it('battle_talk fires when both pawns are drafted for a fight', () => {
    const a = pawn('pawn-1', 5, 5, { drafted: true });
    const b = pawn('pawn-2', 6, 5, { drafted: true });
    let s = stateWith([a, b]);
    let sawBattleTalk = false;
    for (let k = 0; k < 30 && !sawBattleTalk; k++) {
      s = { ...s, turn: (k + 1) * 2000 }; // step past the pair cooldown each time
      s = socialService.processDialogTick(s);
      const log = findRelationship(s.relationships, 'pawn-1', 'pawn-2')?.log ?? [];
      if (log.some((e) => /under arms|before the fight/i.test(e.label))) sawBattleTalk = true;
    }
    expect(sawBattleTalk).toBe(true);
  });

  it('ambient day-to-day drift coalesces into a single rolling time entry', () => {
    const working = () => ({
      state: { mood: 50, isWorking: true, isSleeping: false, isEating: false }
    });
    const a = pawn('pawn-1', 5, 5, working());
    const b = pawn('pawn-2', 6, 5, working());
    let s = stateWith([a, b]);
    for (let day = 0; day < 4; day++) {
      s = { ...s, turn: 18000 * (day + 1) };
      // keep them working side by side each day
      s.pawns.forEach((p) => (p.state = { ...p.state, isWorking: true }));
      s = socialService.processSocialTurn(s);
    }
    const rel = findRelationship(s.relationships, 'pawn-1', 'pawn-2')!;
    const timeEntries = (rel.log ?? []).filter((e) => e.label === 'Time spent together');
    expect(timeEntries).toHaveLength(1); // one rolling total, not one per day
    expect(timeEntries[0].delta).toBeGreaterThan(0.5); // accumulated across the days
  });

  it('a rock-bottom pawn goes on a break and refuses work', () => {
    const a = pawn('pawn-1', 5, 5, {
      state: { mood: 5, isWorking: false, isSleeping: false, isEating: false }
    });
    const s1 = socialService.processSocialTurn(stateWith([a]));
    const after = s1.pawns.find((p) => p.id === 'pawn-1')!;
    expect(after.socialBreak).toBeDefined();
    expect(after.socialBreak!.kind).toBe('break');
    expect(after.socialBreak!.until).toBeGreaterThan(s1.turn);
  });

  it('standing bands are re-evaluated, expired moods pruned', () => {
    const a = pawn('pawn-1', 5, 5, {
      moodModifiers: [{ id: 'hot-meal', label: 'Ate a hot meal', value: 8, expiresAt: 10 }] // long expired
    });
    const s1 = socialService.processSocialTurn(stateWith([a]));
    const after = s1.pawns.find((p) => p.id === 'pawn-1')!;
    expect(after.moodModifiers?.some((m) => m.id === 'hot-meal')).toBe(false);
    // bare-handed pawn with no equipment reads as ragged (standing band)
    expect(after.moodModifiers?.some((m) => m.id === 'prestige-band')).toBe(true);
  });
});

describe('onPawnDeath (grief hook)', () => {
  it('best friends grieve, witnesses bond, and the dead pawn is retired from the graph', () => {
    const dead = pawn('pawn-1', 5, 5);
    const friend = pawn('pawn-2', 6, 5);
    const bystander = pawn('pawn-3', 8, 5);
    const farAway = pawn('pawn-4', 60, 60);
    const rel: PawnRelationship = {
      pawnA: 'pawn-1',
      pawnB: 'pawn-2',
      score: 80,
      stage: 'best_friends',
      tags: [],
      points: { history: 80 }
    };
    const s0 = stateWith([dead, friend, bystander, farAway], { relationships: [rel] });
    const s1 = socialService.onPawnDeath(s0, dead);
    // the friend carries the grief
    const grieving = s1.pawns.find((p) => p.id === 'pawn-2')!;
    expect(grieving.moodModifiers?.some((m) => m.id === 'grief:pawn-1' && m.value === -25)).toBe(
      true
    );
    // the far pawn does not witness-bond; the two nearby do
    expect(findRelationship(s1.relationships, 'pawn-1', 'pawn-2')).toBeUndefined();
    const witnessBond = findRelationship(s1.relationships, 'pawn-2', 'pawn-3');
    expect(witnessBond).toBeDefined();
    expect(witnessBond!.tags).toContain('grief_bond');
    expect((s1.relationships ?? []).some((r) => r.pawnA === 'pawn-4' || r.pawnB === 'pawn-4')).toBe(
      false
    );
  });

  it('kin grieve even without a relationship row', () => {
    const dead = pawn('pawn-1', 5, 5, { kin: [{ pawnId: 'pawn-2', kind: 'sibling' }] });
    const sibling = pawn('pawn-2', 30, 30);
    const s1 = socialService.onPawnDeath(stateWith([dead, sibling]), dead);
    const grieving = s1.pawns.find((p) => p.id === 'pawn-2')!;
    expect(grieving.moodModifiers?.some((m) => m.id === 'grief:pawn-1' && m.value === -20)).toBe(
      true
    );
  });
});

describe('starting kin (linkStartingKin / remapKinIds)', () => {
  it('links are symmetric, same-culture, age-plausible, and share a surname + family', () => {
    rng.reseed(7);
    const roster = Array.from({ length: 40 }, (_, i) =>
      pawn(`pawn-${i}`, 0, 0, { age: 16 + (i % 30), name: `Given${i} Sur${i}` })
    );
    linkStartingKin(roster);
    const linked = roster.filter((p) => p.kin && p.kin.length > 0);
    expect(linked.length).toBeGreaterThan(0);
    const byId = new Map(roster.map((p) => [p.id, p]));
    for (const p of linked) {
      for (const tie of p.kin!) {
        const q = byId.get(tie.pawnId)!;
        // symmetric back-tie
        expect(q.kin!.some((t) => t.pawnId === p.id)).toBe(true);
        // shared family + surname
        expect(p.familyId).toBe(q.familyId);
        expect(p.name.split(' ').slice(-1)[0]).toBe(q.name.split(' ').slice(-1)[0]);
        // plausible age gap for the tie kind
        const gap = Math.abs((p.age ?? 0) - (q.age ?? 0));
        if (tie.kind === 'sibling') expect(gap).toBeLessThanOrEqual(12);
        else expect(gap).toBeGreaterThanOrEqual(16);
      }
    }
  });

  it('remapKinIds repoints ids and drops ties to pawns left behind', () => {
    const a = pawn('pawn-0', 0, 0, {
      familyId: 'family-x',
      kin: [
        { pawnId: 'pawn-1', kind: 'sibling' },
        { pawnId: 'pawn-2', kind: 'parent' }
      ]
    });
    // only pawn-1 makes the cut
    remapKinIds([a], new Map([['pawn-1', 'pawn-9']]));
    expect(a.kin).toEqual([{ pawnId: 'pawn-9', kind: 'sibling' }]);
    // and a pawn whose every tie is dropped loses the family marker
    const b = pawn('pawn-0', 0, 0, {
      familyId: 'family-x',
      kin: [{ pawnId: 'gone', kind: 'child' }]
    });
    remapKinIds([b], new Map());
    expect(b.kin).toBeUndefined();
    expect(b.familyId).toBeUndefined();
  });
});
