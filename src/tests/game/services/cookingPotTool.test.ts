import { describe, it, expect } from 'vitest';
import { jobService } from '$lib/game/services/JobService';
import { recipeService } from '$lib/game/services/RecipeService';
import { itemService } from '$lib/game/services/ItemService';
import { WORK_CATEGORIES } from '$lib/game/core/Work';
import type { GameState, Job, Pawn } from '$lib/game/core/types';

/**
 * The clay cooking pot is wired as a proper ADR-009 craft tool for the stews: each stew recipe
 * declares a `cooking` toolRequirement and the Cooking work category lists `clay_cooking_pot`, so a
 * stew craft job is only claimable when a pot is held or in colony stock (auto-grabbed en route).
 */
function makeState(partial: Partial<GameState> = {}): GameState {
  return {
    jobs: [],
    craftingQueue: [],
    designations: {},
    buildings: [],
    droppedItems: [],
    worldMap: [],
    pawns: [],
    stockpile: {},
    workAssignments: {},
    ...partial
  } as unknown as GameState;
}

const craftJob = (orderId: string): Job =>
  ({
    id: `craft-${orderId}`,
    type: 'craft',
    targetX: 0,
    targetY: 0,
    craftQueueId: orderId,
    workRequired: 3,
    workDone: 0,
    claimedBy: null
  }) as Job;

const pawn = (): Pawn => ({ id: 'cook', position: { x: 0, y: 0 } }) as unknown as Pawn;

function stewOrderState(stockpile: Record<string, number>): GameState {
  const item = itemService.getItemById('small_stew');
  return makeState({
    craftingQueue: [{ id: 'o1', item, quantity: 1 } as never],
    jobs: [craftJob('o1')],
    stockpile
  });
}

describe('cooking pot as a craft tool', () => {
  it('Cooking work category lists the clay cooking pot as a required tool', () => {
    const cooking = WORK_CATEGORIES.find((c) => c.id === 'cooking');
    expect(cooking?.toolsRequired).toContain('clay_cooking_pot');
  });

  it('each stew recipe declares a cooking tool requirement', () => {
    for (const id of ['small_stew', 'fine_stew', 'lavish_stew']) {
      const req = recipeService.toolRequirementForRecipe(recipeService.getRecipeForItem(id));
      expect(req).toEqual({ workType: 'cooking', minTier: 0 });
    }
  });

  it('a stew craft job is NOT claimable without a cooking pot in the colony', () => {
    const gs = stewOrderState({}); // no pot anywhere
    const avail = jobService.getAvailableJobs(pawn(), gs);
    expect(avail.some((j) => j.craftQueueId === 'o1')).toBe(false);
  });

  it('the same job becomes claimable once a clay cooking pot is in stock', () => {
    const gs = stewOrderState({ clay_cooking_pot: 1 });
    const avail = jobService.getAvailableJobs(pawn(), gs);
    expect(avail.some((j) => j.craftQueueId === 'o1')).toBe(true);
  });
});
