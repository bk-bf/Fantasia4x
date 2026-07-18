import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { activityLog, logCombatSwing, logCombatKill, __resetCombatSessions } from '$lib/stores/Log';
import type { CombatTurnEntry } from '$lib/game/core/Events';

// An engagement is ONE Chronicle entry that accretes every swing, not a fresh line per re-touch.
function swing(turn: number, hit: boolean, damage = 0): CombatTurnEntry {
  return { turn, attackerName: 'Goblin #2', defenderName: 'Wren', hit, damage };
}

function combatEntries() {
  return get(activityLog).filter((e) => e.type === 'combat');
}

describe('engagement-scoped combat logging', () => {
  beforeEach(() => {
    activityLog.set([]);
    __resetCombatSessions();
  });

  it('collapses many swings between one pair into a single Chronicle entry', () => {
    for (let t = 0; t < 40; t++) {
      logCombatSwing('mob-g2', 'Goblin #2', 'pawn-wren', 'Wren', t, 5, 5, swing(t, t % 3 !== 0, 3));
    }
    const entries = combatEntries();
    expect(entries).toHaveLength(1);
    // The single entry carries the full per-swing breakdown for the expandable view.
    expect(entries[0].combatBreakdown?.length).toBe(40);
    expect(entries[0].action).toBe('Goblin #2 engaged Wren');
  });

  it('folds the kill into the engagement entry (no standalone "killed" row)', () => {
    for (let t = 0; t < 5; t++) {
      logCombatSwing('mob-g2', 'Goblin #2', 'pawn-wren', 'Wren', t, 5, 5, swing(t, true, 4));
    }
    logCombatKill('mob-g2', 'Goblin #2', 'pawn-wren', 'Wren', 4, 5, 5, 'claws');
    const entries = combatEntries();
    // One folded entry — the kill is not a separate line.
    expect(entries).toHaveLength(1);
    const sessionEntry = entries[0];
    expect(sessionEntry.action).toBe('Goblin #2 engaged Wren');
    expect(sessionEntry.result).toContain('killed');
    expect(sessionEntry.severity).toBe('critical');
    // The killing swing is flagged in the nested breakdown, and only that one.
    const fatal = sessionEntry.combatBreakdown?.filter((b) => b.fatal) ?? [];
    expect(fatal).toHaveLength(1);
    expect(sessionEntry.combatBreakdown?.[sessionEntry.combatBreakdown.length - 1].fatal).toBe(
      true
    );
  });

  it('a kill bumps the engagement to the newest slot of the chronicle', () => {
    // An unrelated entry logged first; the engagement resolves afterwards.
    logCombatSwing('mob-g2', 'Goblin #2', 'pawn-wren', 'Wren', 0, 5, 5, swing(0, true, 3));
    logCombatSwing('mob-z', 'Wolf', 'pawn-q', 'Quill', 1, 9, 9, {
      turn: 1,
      attackerName: 'Wolf',
      defenderName: 'Quill',
      hit: true,
      damage: 2
    });
    // Goblin/Wren engagement (older entry) resolves in a kill → it should jump to the end
    // (= top of the newest-first chronicle view).
    logCombatKill('mob-g2', 'Goblin #2', 'pawn-wren', 'Wren', 5, 5, 5, 'claws');
    const log = get(activityLog);
    expect(log[log.length - 1].action).toBe('Goblin #2 engaged Wren');
    expect(log[log.length - 1].turn).toBe(5); // restamped to the concluding turn
  });

  it('re-engaging after a long lull opens a new entry (engagement boundary)', () => {
    logCombatSwing('mob-g2', 'Goblin #2', 'pawn-wren', 'Wren', 0, 5, 5, swing(0, true, 3));
    // > ENGAGEMENT_EXPIRE_TICKS (300) later → a distinct engagement.
    logCombatSwing('mob-g2', 'Goblin #2', 'pawn-wren', 'Wren', 400, 5, 5, swing(400, true, 3));
    expect(combatEntries()).toHaveLength(2);
  });

  it('misses are recorded too (so dodges are visible)', () => {
    logCombatSwing('mob-x', 'Orc', 'pawn-y', 'Bo', 0, 1, 1, swing(0, false));
    logCombatSwing('mob-x', 'Orc', 'pawn-y', 'Bo', 1, 1, 1, swing(1, false));
    const entry = combatEntries()[0];
    expect(entry.combatBreakdown?.every((b) => b.hit === false)).toBe(true);
    expect(entry.result).toContain('0/2 hits');
  });

  it('reciprocal swings (A→B and B→A) stay on one entry, not two', () => {
    logCombatSwing('mob-g2', 'Goblin #2', 'pawn-wren', 'Wren', 0, 5, 5, swing(0, true, 3));
    logCombatSwing('pawn-wren', 'Wren', 'mob-g2', 'Goblin #2', 1, 5, 5, swing(1, true, 4));
    const entries = combatEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].combatBreakdown?.length).toBe(2);
    expect(entries[0].action).toBe('Goblin #2 engaged Wren');
  });

  it('a joining combatant accretes onto the existing engagement, not a new row', () => {
    // Goblin opens on Wren; Bo joins against the same goblin; goblin swings back at Bo.
    logCombatSwing('mob-g2', 'Goblin #2', 'pawn-wren', 'Wren', 0, 5, 5, swing(0, true, 3));
    logCombatSwing('pawn-bo', 'Bo', 'mob-g2', 'Goblin #2', 1, 5, 5, swing(1, true, 2));
    logCombatSwing('mob-g2', 'Goblin #2', 'pawn-bo', 'Bo', 2, 5, 5, swing(2, false));
    const entries = combatEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].combatBreakdown?.length).toBe(3);
    // 3 distinct fighters are surfaced in the summary.
    expect(entries[0].result).toContain('3 fighters');
    expect(entries[0].entityIds).toEqual(
      expect.arrayContaining(['mob-g2', 'pawn-wren', 'pawn-bo'])
    );
  });

  it('a kill keeps the brawl open while other fighters remain', () => {
    // Two goblins both fighting Wren — same brawl (joined via Wren).
    logCombatSwing('mob-g1', 'Goblin #1', 'pawn-wren', 'Wren', 0, 5, 5, swing(0, true, 3));
    logCombatSwing('mob-g2', 'Goblin #2', 'pawn-wren', 'Wren', 1, 5, 5, swing(1, true, 3));
    // Wren lands the killing blow on Goblin #1 (swing logged first, as in real combat),
    // then it's reported as a kill. Goblin #2 is still up, so the engagement entry lives on.
    logCombatSwing('pawn-wren', 'Wren', 'mob-g1', 'Goblin #1', 2, 5, 5, {
      turn: 2,
      attackerName: 'Wren',
      defenderName: 'Goblin #1',
      hit: true,
      damage: 5
    });
    logCombatKill('pawn-wren', 'Wren', 'mob-g1', 'Goblin #1', 2, 5, 5, 'spear');
    logCombatSwing('mob-g2', 'Goblin #2', 'pawn-wren', 'Wren', 3, 5, 5, swing(3, true, 2));
    const engaged = combatEntries().filter((e) => e.action.includes('engaged'));
    // No standalone "killed" row — the kill is folded into the one engagement entry.
    expect(combatEntries().every((e) => !e.action.includes('killed'))).toBe(true);
    expect(engaged).toHaveLength(1);
    expect(engaged[0].combatBreakdown?.length).toBe(4);
    // The blow that downed Goblin #1 is flagged fatal in the breakdown.
    expect(engaged[0].combatBreakdown?.filter((b) => b.fatal)).toHaveLength(1);
  });
});
