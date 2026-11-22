import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { memoryService, MEMORABILITY } from '$lib/game/services/MemoryService';
import {
  runConversation,
  combatBark,
  chooseCategory
} from '$lib/game/services/social/conversations';
import { rng } from '$lib/game/core/util/rng';
import { TICKS_PER_SECOND } from '$lib/game/core/util/time';
import { TURNS_PER_DAY } from '$lib/game/services/EnvironmentService';
import type {
  EntityCondition,
  EventMemory,
  GameState,
  Pawn,
  PawnRelationship
} from '$lib/game/core/types';

const DAY = TURNS_PER_DAY * TICKS_PER_SECOND;

function pawn(id: string, x: number, y: number, extra: Partial<Pawn> = {}): Pawn {
  return {
    id,
    name: `${id} Test`,
    isAlive: true,
    position: { x, y },
    state: { mood: 50, isWorking: false, isSleeping: false, isEating: false },
    stats: { charisma: 10 },
    traits: [],
    ...extra
  } as unknown as Pawn;
}

beforeEach(() => rng.reseed(20260713));
afterEach(() => vi.restoreAllMocks());

describe('recordAround', () => {
  it('records onto near pawns only, never the subject', () => {
    const doer = pawn('doer', 5, 5);
    const near = pawn('near', 6, 5);
    const far = pawn('far', 40, 40);
    const state = { turn: 0, pawns: [doer, near, far] } as unknown as GameState;
    memoryService.recordAround(state, 5, 5, 'doer', 10, () => ({
      kind: 'botch',
      turn: 0,
      subjectId: 'doer',
      subjectName: 'Doer',
      detail: 'a crooked stool',
      memorability: MEMORABILITY.botch
    }));
    expect(near.memories?.length).toBe(1);
    expect(near.memories?.[0].subjectId).toBe('doer');
    expect(doer.memories ?? []).toHaveLength(0);
    expect(far.memories ?? []).toHaveLength(0);
  });
});

describe('recall', () => {
  it('returns undefined with no memories, else picks one and wears it out (told++)', () => {
    const a = pawn('a', 0, 0);
    const b = pawn('b', 1, 0);
    expect(memoryService.recall(a, b, 0)).toBeUndefined();
    a.memories = [
      {
        kind: 'combat',
        turn: 0,
        subjectId: 'x',
        subjectName: 'Bram',
        detail: 'a boar',
        memorability: 0.5
      }
    ];
    const got = memoryService.recall(a, b, 100);
    expect(got).toBeDefined();
    expect(got!.told).toBe(1);
    memoryService.recall(a, b, 100);
    expect(a.memories![0].told).toBe(2);
  });
});

describe('prune', () => {
  it('drops a faded trivial memory but keeps historic forever', () => {
    const p = pawn('p', 0, 0);
    p.memories = [
      { kind: 'idled', turn: 0, memorability: MEMORABILITY.idled },
      { kind: 'death', turn: 0, subjectName: 'Old Sib', memorability: MEMORABILITY.death }
    ];
    const changed = memoryService.prune(p, DAY * 10);
    expect(changed).toBe(true);
    expect(p.memories!.map((m) => m.kind)).toEqual(['death']);
  });
});

describe('condition onset → affliction memory', () => {
  it('a dire condition onsetting mints an affliction memory on witnesses (deduped by prevStages)', () => {
    const sufferer = pawn('sufferer', 5, 5, { name: 'Bram Oak' });
    const near = pawn('near', 6, 5);
    const far = pawn('far', 40, 40);
    const state = { turn: 0, pawns: [sufferer, near, far] } as unknown as GameState;
    const conditions: EntityCondition[] = [{ id: 'hypothermia', severity: 0.8 }];
    memoryService.recordConditionOnsets(state, sufferer, undefined, conditions);
    expect(near.memories?.length).toBe(1);
    expect(near.memories?.[0].kind).toBe('affliction');
    expect(near.memories?.[0].subjectName).toBe('Bram');
    expect(near.memories?.[0].detail).toBe('half freeze to death');
    expect(sufferer.memories ?? []).toHaveLength(0);
    expect(far.memories ?? []).toHaveLength(0);
    const near2 = pawn('near2', 6, 5);
    const state2 = { turn: 10, pawns: [sufferer, near2] } as unknown as GameState;
    memoryService.recordConditionOnsets(
      state2,
      sufferer,
      new Map([['hypothermia', 'Severe']]),
      conditions
    );
    expect(near2.memories ?? []).toHaveLength(0);
  });
});

describe('combat barks', () => {
  it('picks a terse line and fills {foe}, with a fallback when no foe is named', () => {
    for (const kind of ['hit', 'miss', 'hurt', 'kill'] as const) {
      const line = combatBark(kind, 'the boar');
      expect(line.length).toBeGreaterThan(0);
      expect(line).not.toContain('{foe}');
      expect(line.length).toBeLessThan(40);
    }
    expect(combatBark('hurt')).not.toContain('{foe}');
  });
});

describe('recall → grounded dialog line', () => {
  it('a recalled botch names the subject and the item, as banter', () => {
    const a = pawn('a', 0, 0);
    const b = pawn('b', 1, 0);
    const rel: PawnRelationship = {
      pawnA: 'a',
      pawnB: 'b',
      score: 50,
      stage: 'friends',
      tags: [],
      points: { history: 0 }
    };
    const memory: EventMemory = {
      kind: 'botch',
      turn: 0,
      subjectId: 'c',
      subjectName: 'Bram',
      detail: 'a crooked stool',
      memorability: MEMORABILITY.botch
    };
    const out = runConversation(
      a,
      b,
      rel,
      { turn: 200 },
      {
        flirtEligible: false,
        targetGrieving: false,
        battleContext: false,
        recall: { memory, ago: 'the other day' }
      }
    );
    expect(out.category).toBe('banter');
    expect(out.lines).toHaveLength(3);
    expect(out.lines[0].text).toContain('Bram');
    expect(out.lines[0].text).toContain('a crooked stool');
    expect(out.subject).toBe('Bram and a crooked stool');
  });
});

describe('memory store limits', () => {
  it('a full store evicts the oldest ordinary memory and keeps one of exactly historic weight', () => {
    const p = pawn('p', 0, 0);
    p.memories = [{ kind: 'death', turn: 0, memorability: 0.9 }];
    for (let i = 1; i < 30; i++) p.memories.push({ kind: 'combat', turn: i, memorability: 0.5 });
    memoryService.record(p, { kind: 'combat', turn: 30, memorability: 0.5 });
    expect(p.memories).toHaveLength(30);
    expect(p.memories[0].memorability).toBe(0.9);
    expect(p.memories[1].turn).toBe(2);
  });

  it('a memorable event is recalled for 90 days, an ordinary one for 20', () => {
    const p = pawn('p', 0, 0);
    p.memories = [
      { kind: 'masterwork', turn: 0, memorability: 0.65 },
      { kind: 'combat', turn: 0, memorability: 0.4 }
    ];
    memoryService.prune(p, DAY * 30);
    expect(p.memories!.map((m) => m.memorability)).toEqual([0.65]);
  });

  it('a historic memory outlives even the longest recall window', () => {
    const p = pawn('p', 0, 0);
    p.memories = [{ kind: 'death', turn: 0, memorability: 0.95 }];
    expect(memoryService.prune(p, DAY * 400)).toBe(false);
    expect(p.memories).toHaveLength(1);
  });
});

describe('recall weighting', () => {
  it('a memory about the listener outweighs an equal one about someone else', () => {
    const a = pawn('a', 0, 0);
    const b = pawn('b', 1, 0);
    a.memories = [
      { kind: 'combat', turn: 0, subjectId: 'x', memorability: 0.5 },
      { kind: 'combat', turn: 0, subjectId: 'b', memorability: 0.5 }
    ];
    vi.spyOn(rng, 'random').mockReturnValue(0.45);
    expect(memoryService.recall(a, b, 0)?.subjectId).toBe('b');
  });
});

describe('conversation rules', () => {
  const rel = (stage: PawnRelationship['stage']): PawnRelationship => ({
    pawnA: 'a',
    pawnB: 'b',
    score: 0,
    stage,
    tags: [],
    points: { history: 0 }
  });

  it('small talk between strangers succeeds at its own odds, no better', () => {
    vi.spyOn(rng, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);
    const out = runConversation(
      pawn('a', 0, 0),
      pawn('b', 1, 0),
      rel('strangers'),
      { turn: 0 },
      { flirtEligible: false, targetGrieving: false, battleContext: false }
    );
    expect(out.category).toBe('small_talk');
    expect(out.positive).toBe(false);
  });

  it('enemies only ever insult or argue', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++)
      seen.add(
        chooseCategory(rel('enemies'), {
          flirtEligible: false,
          targetGrieving: false,
          battleContext: false
        })
      );
    expect([...seen].sort()).toEqual(['argue', 'insult']);
  });

  it('a combat bark draws different lines for different rolls', () => {
    const lines = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((r) => combatBark('hit', 'it', r)));
    expect(lines.size).toBeGreaterThan(1);
  });
});
