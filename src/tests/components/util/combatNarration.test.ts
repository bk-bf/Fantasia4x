import { describe, it, expect } from 'vitest';
import { describeSwing, narrationTier } from '$lib/components/util/combatNarration';
import type { CombatTurnEntry } from '$lib/game/core/defs/events';

function swing(over: Partial<CombatTurnEntry> = {}): CombatTurnEntry {
  return {
    turn: 1,
    attackerName: 'Wren',
    defenderName: 'Goblin #2',
    hit: true,
    damage: 4,
    damageType: 'blunt',
    bodyPart: 'leftUpperLeg',
    woundSeverity: 'minor',
    partMaxHp: 60,
    ...over
  };
}

describe('combat narration', () => {
  it('names the struck body part possessively in the sentence', () => {
    const n = describeSwing(swing());
    expect(n.attacker).toBe('Wren');
    expect(n.target).toBe("Goblin #2's left upper leg");
    expect(n.dodged).toBe(false);
  });

  it('picks a verb from the damage family + severity tier', () => {
    const n = describeSwing(swing({ damageType: 'cutting', woundSeverity: 'serious' }));
    expect(['slashed', 'gashed', 'lacerated']).toContain(n.verb);
    expect(n.tier).toBe('serious');
  });

  it('escalates the tier (and so the verb) on a crit', () => {
    expect(narrationTier(swing({ woundSeverity: 'serious', crit: true }))).toBe('critical');
  });

  it('escalates the tier when one blow eats half the limb', () => {
    expect(narrationTier(swing({ woundSeverity: 'minor', damage: 35, partMaxHp: 60 }))).toBe(
      'serious'
    );
  });

  it('a miss reads as a dodge, never as an injury', () => {
    const n = describeSwing(swing({ hit: false }));
    expect(n.dodged).toBe(true);
    expect(['swung at', 'lunged at', 'lashed out at', 'struck at', 'thrust at']).toContain(n.verb);
    expect(n.target).toBe('Goblin #2');
  });

  it('is deterministic — same swing narrates identically across calls', () => {
    const s = swing({ damageType: 'piercing', woundSeverity: 'critical' });
    expect(describeSwing(s).verb).toBe(describeSwing(s).verb);
  });
});

describe('narrationTier bounds', () => {
  it('saturates at destroyed instead of overflowing past it', () => {
    expect(narrationTier(swing({ woundSeverity: 'destroyed', crit: true }))).toBe('destroyed');
  });

  it('applies both bumps when a crit also eats half the limb', () => {
    expect(
      narrationTier(swing({ woundSeverity: 'minor', crit: true, damage: 35, partMaxHp: 60 }))
    ).toBe('critical');
  });

  it('bumps at exactly half the limb, not just past it', () => {
    expect(narrationTier(swing({ woundSeverity: 'minor', damage: 30, partMaxHp: 60 }))).toBe(
      'serious'
    );
  });

  it('does not bump just under half the limb', () => {
    expect(narrationTier(swing({ woundSeverity: 'minor', damage: 29, partMaxHp: 60 }))).toBe(
      'minor'
    );
  });

  it('falls back to minor when woundSeverity is missing', () => {
    const { woundSeverity: _drop, ...rest } = swing();
    expect(narrationTier(rest as CombatTurnEntry)).toBe('minor');
  });
});
