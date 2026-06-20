import { describe, it, expect } from 'vitest';
import { driveEncumbrance, getConditionCurrentStage } from '../core/needs';
import { itemService } from '../services/ItemService';
import type { EntityCondition, GameState, Pawn } from '../core/types';

/**
 * Unified load model: worn armour + pack weight ÷ a STR-scaled capacity drives the staged `encumbered`
 * condition (set DIRECTLY from the ratio, not accrued). Armour fills the WEIGHT budget but adds VOLUME
 * (pockets). Replaces the old combat-only armour-encumbrance hook.
 */
describe('driveEncumbrance (load → staged condition)', () => {
  it('adds nothing while light, onsets past ~0.8, clears when unburdened again', () => {
    const c: EntityCondition[] = [];
    driveEncumbrance(c, 0.5);
    expect(c.find((x) => x.id === 'encumbered')).toBeUndefined(); // light → no condition

    driveEncumbrance(c, 1.1); // over capacity
    const enc = c.find((x) => x.id === 'encumbered');
    expect(enc).toBeDefined();
    expect(enc!.severity).toBeGreaterThan(0);

    driveEncumbrance(c, 0.4); // dropped the load
    expect(c.find((x) => x.id === 'encumbered')).toBeUndefined(); // cleared
  });

  it('severity rises with load and graduates burdened → encumbered → overloaded', () => {
    const light: EntityCondition[] = [];
    const mid: EntityCondition[] = [];
    const heavy: EntityCondition[] = [];
    driveEncumbrance(light, 0.9); // just over the floor
    driveEncumbrance(mid, 1.15);
    driveEncumbrance(heavy, 1.45); // maxed

    const sev = (c: EntityCondition[]) => c.find((x) => x.id === 'encumbered')!.severity;
    expect(sev(light)).toBeLessThan(sev(mid));
    expect(sev(mid)).toBeLessThan(sev(heavy));

    expect(getConditionCurrentStage(light.find((x) => x.id === 'encumbered')!)?.label).toBe(
      'burdened'
    );
    expect(getConditionCurrentStage(heavy.find((x) => x.id === 'encumbered')!)?.label).toBe(
      'overloaded'
    );
  });

  it('the overloaded stage cuts combat (DEX → dodge + aim) and movement', () => {
    const c: EntityCondition[] = [];
    driveEncumbrance(c, 1.5);
    const stage = getConditionCurrentStage(c.find((x) => x.id === 'encumbered')!);
    // Evasion + aim now flow through the DEX penalty (the stat the dodge/hit formulas read), plus a
    // STR hit; movement is its own modifier.
    expect(stage!.modifiers.dexterity).toBeLessThan(1); // easier to hit + worse aim
    expect(stage!.modifiers.strength).toBeLessThan(1); // weaker under the load
    expect(stage!.modifiers.moveSpeed).toBeLessThan(1); // slower
  });
});

describe('carry capacity: worn armour adds VOLUME (pockets) but fills WEIGHT', () => {
  const makePawn = (over: Partial<Pawn> = {}): Pawn =>
    ({
      id: 'p',
      stats: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        perception: 10,
        intelligence: 10,
        charisma: 10
      },
      physicalTraits: { weight: 70, height: 170 },
      inventory: {
        items: {},
        instances: [],
        weightKg: 0,
        maxWeightKg: 0,
        volumeL: 0,
        maxVolumeL: 0
      },
      equipment: {},
      ...(over as object)
    }) as unknown as Pawn;

  it('a worn hauberk raises VOLUME capacity (pockets) over an unarmoured pawn', () => {
    const bare = makePawn();
    const armored = makePawn({
      equipment: { bodyMid: { itemId: 'mail_hauberk', durability: 100 } }
    } as Partial<Pawn>);
    const v0 = itemService.getCarryCapacityBreakdown(bare).volume.total;
    const v1 = itemService.getCarryCapacityBreakdown(armored).volume.total;
    expect(v1).toBeGreaterThan(v0); // armour pockets add volume

    // …and that armour's WEIGHT counts as carried load (it fills the weight budget).
    const loadBare = itemService.getCurrentCarryLoad(bare, {} as GameState).weightKg;
    const loadArmored = itemService.getCurrentCarryLoad(armored, {} as GameState).weightKg;
    expect(loadArmored).toBeGreaterThan(loadBare);
  });
});
