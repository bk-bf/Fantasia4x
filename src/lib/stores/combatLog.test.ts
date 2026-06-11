import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { activityLog, logCombatSwing, logCombatKill, __resetCombatSessions } from './Log';
import type { CombatTurnEntry } from '$lib/game/core/Events';

/**
 * Regression guard for the combat-log spam fix (COMBAT-SYSTEM): an engagement is
 * ONE Chronicle entry that accretes every swing, not a fresh "engaged in combat"
 * line each time the attacker re-touches the defender.
 */
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

	it('a kill finalizes the entry with a "killed" summary', () => {
		for (let t = 0; t < 5; t++) {
			logCombatSwing('mob-g2', 'Goblin #2', 'pawn-wren', 'Wren', t, 5, 5, swing(t, true, 4));
		}
		logCombatKill('mob-g2', 'pawn-wren');
		const entries = combatEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0].result).toContain('killed');
		expect(entries[0].severity).toBe('critical');
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
});
