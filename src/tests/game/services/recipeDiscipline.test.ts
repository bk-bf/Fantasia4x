import { describe, it, expect } from 'vitest';
import { recipeService } from '$lib/game/services/RecipeService';
import { craftDiscipline } from '$lib/game/services/jobs/craftDiscipline';

/**
 * §D — generic `crafting` is DISSOLVED: every craft must route to a real discipline (via its recipe
 * `discipline` tag, its station's flag, a food output → meals, or a `toolRequirement.workType`). This
 * guard fails the moment a recipe is added with no route, so a new craft can't silently fall into a
 * dead generic bucket — it must declare where it belongs.
 */
describe('generic crafting is dissolved — every recipe routes to a discipline', () => {
  it('no recipe falls back to generic crafting', () => {
    const orphans: string[] = [];
    for (const r of recipeService.getAllRecipes()) {
      const out = Object.keys(r.outputs ?? {})[0];
      if (!out) continue;
      const disc = craftDiscipline({ item: { id: out }, stationType: r.station, recipeId: r.id });
      if (disc === 'crafting') orphans.push(`${r.id} @${r.station ?? '-'} → ${out}`);
    }
    expect(orphans, `these recipes route to generic crafting:\n${orphans.join('\n')}`).toEqual([]);
  });
});
