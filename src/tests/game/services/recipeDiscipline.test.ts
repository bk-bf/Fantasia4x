import { describe, it, expect } from 'vitest';
import { recipeService } from '$lib/game/services/RecipeService';
import { craftDiscipline } from '$lib/game/services/jobs/craftDiscipline';

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
