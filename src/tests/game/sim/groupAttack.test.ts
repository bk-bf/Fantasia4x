import { describe, it, expect } from 'vitest';
import { COMMANDS } from '$lib/game/sim/commands';
import type { GameState, Pawn } from '$lib/game/core/types';

const pawn = (id: string, drafted: boolean, extra: Partial<Pawn> = {}): Pawn =>
  ({
    id,
    name: id,
    drafted,
    isAlive: true,
    position: { x: 0, y: 0 },
    currentState: 'Idle',
    ...extra
  }) as unknown as Pawn;

const stateWith = (pawns: Pawn[]): GameState => ({ pawns }) as unknown as GameState;

describe('attackTargetWith — group surround-and-attack order', () => {
  it('sets an attack draftTarget on every listed drafted pawn', () => {
    const s = stateWith([pawn('p1', true), pawn('p2', true), pawn('p3', true)]);
    const out = COMMANDS.attackTargetWith(s, {
      ids: ['p1', 'p2', 'p3'],
      targetId: 'mob-7',
      targetType: 'mob'
    });
    for (const id of ['p1', 'p2', 'p3']) {
      const p = out.pawns.find((x) => x.id === id)!;
      expect(p.draftTarget).toEqual({ type: 'attack', targetId: 'mob-7', targetType: 'mob' });
    }
  });

  it('skips pawns not in the id list, and undrafted / collapsed / dead pawns', () => {
    const s = stateWith([
      pawn('drafted', true),
      pawn('notlisted', true),
      pawn('undrafted', false),
      pawn('collapsed', true, { currentState: 'Collapsed' } as Partial<Pawn>),
      pawn('dead', true, { isAlive: false } as Partial<Pawn>)
    ]);
    const out = COMMANDS.attackTargetWith(s, {
      ids: ['drafted', 'undrafted', 'collapsed', 'dead'],
      targetId: 'mob-1',
      targetType: 'mob'
    });
    const dt = (id: string) => out.pawns.find((p) => p.id === id)!.draftTarget;
    expect(dt('drafted')).toEqual({ type: 'attack', targetId: 'mob-1', targetType: 'mob' });
    expect(dt('notlisted')).toBeUndefined();
    expect(dt('undrafted')).toBeUndefined();
    expect(dt('collapsed')).toBeUndefined();
    expect(dt('dead')).toBeUndefined();
  });
});
