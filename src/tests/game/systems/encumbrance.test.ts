import { describe, it, expect } from 'vitest';
import { driveEncumbrance, getConditionCurrentStage } from '$lib/game/core/rules/body/conditions';
import { itemService } from '$lib/game/services/ItemService';
import type { EntityCondition, GameState, Pawn } from '$lib/game/core/types';

describe('driveEncumbrance (load → staged condition)', () => {
  it('adds nothing up to full capacity, onsets only OVER 1.0, clears when unburdened again', () => {
    const c: EntityCondition[] = [];
    driveEncumbrance(c, 0.5);
    expect(c.find((x) => x.id === 'encumbered')).toBeUndefined();

    driveEncumbrance(c, 0.95);
    expect(c.find((x) => x.id === 'encumbered')).toBeUndefined();

    driveEncumbrance(c, 1.0);
    expect(c.find((x) => x.id === 'encumbered')).toBeUndefined();

    driveEncumbrance(c, 1.1);
    const enc = c.find((x) => x.id === 'encumbered');
    expect(enc).toBeDefined();
    expect(enc!.severity).toBeGreaterThan(0);

    driveEncumbrance(c, 0.4);
    expect(c.find((x) => x.id === 'encumbered')).toBeUndefined();
  });

  it('severity rises with load and graduates burdened → encumbered → overloaded', () => {
    const light: EntityCondition[] = [];
    const mid: EntityCondition[] = [];
    const heavy: EntityCondition[] = [];
    driveEncumbrance(light, 1.05);
    driveEncumbrance(mid, 1.15);
    driveEncumbrance(heavy, 1.45);

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

  it('the overloaded stage cuts combat (DEXTERITY → dodge + aim) and movement', () => {
    const c: EntityCondition[] = [];
    driveEncumbrance(c, 1.5);
    const stage = getConditionCurrentStage(c.find((x) => x.id === 'encumbered')!);
    expect(stage!.modifiers.cutting_resistance).toBeLessThan(0);
    expect(stage!.modifiers.melee_damage).toBeLessThan(0);
    expect(stage!.modifiers.moveSpeed).toBeLessThan(1);
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
    expect(v1).toBeGreaterThan(v0);

    const loadBare = itemService.getCurrentCarryLoad(bare, {} as GameState).weightKg;
    const loadArmored = itemService.getCurrentCarryLoad(armored, {} as GameState).weightKg;
    expect(loadArmored).toBeGreaterThan(loadBare);
  });
});
