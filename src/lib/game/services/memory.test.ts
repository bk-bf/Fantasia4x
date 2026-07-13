// PAWN-MEMORY tests: recording around witnesses, weighted recall + wear-out, decay/pruning, and that
// a recalled memory builds a grounded dialog line (naming the subject + detail).
import { describe, it, expect, beforeEach } from 'vitest';
import { memoryService, MEMORABILITY } from './MemoryService';
import { runConversation } from './social/conversations';
import { rng } from '../core/rng';
import { TICKS_PER_SECOND } from '../core/time';
import { TURNS_PER_DAY } from './EnvironmentService';
import type { EventMemory, GameState, Pawn, PawnRelationship } from '../core/types';

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
      { kind: 'combat', turn: 0, subjectId: 'x', subjectName: 'Bram', detail: 'a boar', memorability: 0.5 }
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
      { flirtEligible: false, targetGrieving: false, battleContext: false, recall: { memory, ago: 'the other day' } }
    );
    expect(out.category).toBe('banter'); // botch borrows banter's tone
    expect(out.lines).toHaveLength(3);
    expect(out.lines[0].text).toContain('Bram'); // every botch opener names the subject...
    expect(out.lines[0].text).toContain('a crooked stool'); // ...and the item
    expect(out.subject).toBe('Bram and a crooked stool');
  });
});
