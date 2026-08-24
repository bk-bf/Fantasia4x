import { describe, it, expect } from 'vitest';
import { rollLineageTrait, pawnLineage } from '$lib/game/core/Lineages';
import type { Pawn, Trait } from '$lib/game/core/types';

/**
 * A voidshard is the rarest thing in the game — 0.01% behind a runed pick, a boss's hoard, or a
 * fortune paid to a kingdom that trusts you. It must never be a dud, which is the whole reason it
 * behaves differently for a pawn who already carries a bloodline.
 */
const bare = (traits: Trait[] = []): Pawn => ({ traits }) as unknown as Pawn;
const fixed = (n: number) => () => n;

describe('voidshard — awakens a bloodline, or carries an existing one further', () => {
  it('a pawn with no lineage is awakened: the parent marker AND a first member', () => {
    const got = rollLineageTrait(bare(), fixed(0));
    expect(got.length, 'never just a bare marker').toBeGreaterThan(0);
    const parent = got.find((t) => t.lineageParent);
    expect(parent, 'the bloodline itself').toBeDefined();
    // …and the pawn is genuinely a member afterwards, by the game's own reader.
    expect(pawnLineage(bare(got))).toBe(parent!.lineageParent);
  });

  it('a pawn who already belongs gets the NEXT rung of their own line, not a second bloodline', () => {
    const first = rollLineageTrait(bare(), fixed(0));
    const member = rollLineageTrait(bare(first), fixed(0));
    expect(member.length, 'the shard still gives something').toBeGreaterThan(0);
    for (const t of member) {
      expect(t.lineageParent, 'never a second parent marker').toBeUndefined();
      expect(t.lineage, 'and it belongs to the line they already carry').toContain(
        pawnLineage(bare(first))
      );
    }
    // The two grants are distinct traits — it advances rather than re-granting.
    expect(first.map((t) => t.id)).not.toContain(member[0].id);
  });

  it('a shard can be eaten repeatedly, each time advancing one rung', () => {
    let held = rollLineageTrait(bare(), fixed(0));
    const line = pawnLineage(bare(held));
    for (let i = 0; i < 3; i++) {
      const next = rollLineageTrait(bare(held), fixed(0));
      if (!next.length) break; // the line ran out — a legitimate stop
      expect(pawnLineage(bare([...held, ...next])), 'still the same bloodline').toBe(line);
      held = [...held, ...next];
    }
    expect(held.length, 'the line grew').toBeGreaterThan(1);
  });

  it('gives nothing when the pawn has exhausted their line, rather than a second marker', () => {
    // Drain it: keep advancing until it stops, then confirm it stays stopped.
    let held = rollLineageTrait(bare(), fixed(0));
    for (let i = 0; i < 40; i++) {
      const next = rollLineageTrait(bare(held), fixed(0));
      if (!next.length) break;
      held = [...held, ...next];
    }
    expect(rollLineageTrait(bare(held), fixed(0))).toEqual([]);
    expect(held.filter((t) => t.lineageParent).length, 'exactly one bloodline, ever').toBe(1);
  });
});
