// PAWN-MEMORY tests: recording around witnesses, weighted recall + wear-out, decay/pruning, and that
// a recalled memory builds a grounded dialog line (naming the subject + detail).
import { describe, it, expect, beforeEach } from 'vitest';
import { memoryService, MEMORABILITY } from '$lib/game/services/MemoryService';
import { runConversation, combatBark } from '$lib/game/services/social/conversations';
import { rng } from '$lib/game/core/rng';
import { TICKS_PER_SECOND } from '$lib/game/core/time';
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
    expect(doer.memories ?? []).toHaveLength(0); // the subject doesn't remember ribbing themselves
    expect(far.memories ?? []).toHaveLength(0); // out of sight
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
    expect(got!.told).toBe(1); // recall bumps the retell counter
    memoryService.recall(a, b, 100);
    expect(a.memories![0].told).toBe(2);
  });
});

describe('prune', () => {
  it('drops a faded trivial memory but keeps historic forever', () => {
    const p = pawn('p', 0, 0);
    p.memories = [
      { kind: 'idled', turn: 0, memorability: MEMORABILITY.idled }, // trivial, ~4-day window
      { kind: 'death', turn: 0, subjectName: 'Old Sib', memorability: MEMORABILITY.death } // historic
    ];
    const changed = memoryService.prune(p, DAY * 10); // 10 days later
    expect(changed).toBe(true);
    expect(p.memories!.map((m) => m.kind)).toEqual(['death']); // trivial gone, historic pinned
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
    expect(sufferer.memories ?? []).toHaveLength(0); // the sufferer isn't a witness to their own affliction
    expect(far.memories ?? []).toHaveLength(0);
    // already present last tick (in prevStages) → not an onset, no new memory
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
      expect(line).not.toContain('{foe}'); // placeholder always resolved
      expect(line.length).toBeLessThan(40); // barks stay short — no drawn-out speeches
    }
    // no foe supplied → {foe} slots fall back to "it", never a leftover placeholder
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
    expect(out.category).toBe('banter'); // botch borrows banter's tone
    expect(out.lines).toHaveLength(3);
    expect(out.lines[0].text).toContain('Bram'); // every botch opener names the subject...
    expect(out.lines[0].text).toContain('a crooked stool'); // ...and the item
    expect(out.subject).toBe('Bram and a crooked stool');
  });
});
