import recipesData from '$lib/game/database/items/recipes.json';

type Recipe = {
  inputs?: Record<string, number>;
  inputAlternatives?: Record<string, number>[];
  outputs?: Record<string, number>;
};

export const RUNED_CONCEPT_BRANCH = 'test/runed-construction';

export const RUNED_CONCEPT_ITEMS = new Set<string>([
  'heartwood_plank',
  'moonwood_plank',
  'ironwood_plank',
  'emberwood_plank',
  'emberwood_haft',
  'moonwood_haft',
  'heartwood_haft',
  'rune_sealed_flask',
  'rune_stitched_knapsack',
  'rune_woven_satchel',
  'rune_bound_frame_pack',
  'rune_etched_pick',
  'rune_etched_belt',
  'arcane_robe',
  'great_bone_helm',
  'great_bone_cuirass',
  'great_bone_vambraces',
  'great_bone_greaves',
  'great_bone_gauntlets',
  'great_bone_sabatons',
  'great_tusk_impaler',
  'great_fang_javelin',
  'great_fang_dirk',
  'great_bone_maul',
  'attuned_ruby',
  'attuned_sapphire',
  'attuned_emerald',
  'attuned_topaz',
  'attuned_amethyst',
  'attuned_citrine',
  'attuned_moonstone',
  'ruby_ring',
  'sapphire_ring',
  'emerald_ring',
  'topaz_ring',
  'amethyst_ring',
  'citrine_ring',
  'moonstone_ring',
  'ruby_amulet',
  'sapphire_amulet',
  'emerald_amulet',
  'topaz_amulet',
  'amethyst_amulet',
  'citrine_amulet',
  'moonstone_amulet',
  'scholars_circlet',
  'champions_crown',
  'sovereign_crown',
  'wardens_circlet',
  'gold_torc',
  'champions_torc',
  'wayfarers_pendant',
  'sages_pendant',
  'ember_staff',
  'frost_staff',
  'spark_staff',
  'pyre_staff',
  'rime_staff',
  'tempest_staff',
  'alpha_heart',
  'direwolf_hackles',
  'great_fang',
  'owlbear_pineal',
  'sabretooth_glands',
  'great_bone',
  'fang_reaver',
  'stargazer_circlet',
  'gem_dust',
  'grand_potion_of_might',
  'grand_draught_of_vigor',
  'grand_elixir_of_grace',
  'grand_tonic_of_fortitude',
  'grand_bloodrage_draught',
  'grand_ironhide_tonic',
  'grand_vigor_draught',
  'grand_calming_draught',
  'grand_nightglow_draught',
  'grand_frenzy_draught',
  'grand_venom_coating',
  'grand_caustic_coating',
  'feral_transfusion',
  'alpha_essence',
  'hide_transfusion',
  'ironhide_essence',
  'predator_transfusion',
  'sabretooth_essence',
  'sight_transfusion',
  'third_eye_essence',
  'magic_alloy_bar',
  'enchant_thread',
  'runed_block',
  'purified_catalyst',
  'grand_tanglefoot_coating',
  'grand_dread_coating',
  'grand_farsight_tonic',
  'grand_antivenin_tonic',
  'grand_restful_tonic',
  'razors_grace',
  'fang_charm',
  'rune_etched_axe',
  'rune_ribbed_mace',
  'rune_toothed_cleaver',
  'rune_lashing_greatflail',
  'rune_etched_arming_sword',
  'rune_standard_glaive',
  'rune_chained_flail',
  'rune_graven_spear',
  'rune_needle_rapier',
  'rune_slotted_stiletto',
  'rune_sung_greatsword',
  'rune_bitten_greataxe',
  'rune_fanged_greatcleaver',
  'rune_weighted_warhammer',
  'rune_etched_halberd',
  'rune_banded_longstaff',
  'rune_strung_warbow',
  'rune_cranked_arbalest',
  'rune_whistling_sling',
  'rune_marked_javelin',
  'cinder_rod',
  'hoarfrost_rod',
  'storm_rod',
  'emberglass_scepter',
  'rimeglass_scepter',
  'stormglass_scepter',
  'manaforge_greatstaff',
  'rune_graven_cuirass',
  'rune_graven_helm',
  'rune_graven_vambraces',
  'rune_graven_greaves',
  'rune_stitched_lamellar',
  'rune_stitched_coif',
  'rune_woven_robe',
  'rune_woven_hood',
  'rune_stitched_bracers',
  'rune_stitched_gloves',
  'rune_stitched_greaves',
  'rune_stitched_boots',
  'rune_woven_gloves',
  'rune_woven_boots',
  'rune_woven_hose',
  'rune_graven_gauntlets',
  'rune_graven_sabatons',
  'rune_graven_kite'
]);

const recipesByOutput = new Map<string, Recipe[]>();
for (const r of recipesData as unknown as Recipe[])
  for (const o of Object.keys(r.outputs ?? {}))
    recipesByOutput.set(o, [...(recipesByOutput.get(o) ?? []), r]);

const waiting = new Map<string, boolean>();

export function waitsOnRunedConstruction(id: string): boolean {
  if (RUNED_CONCEPT_ITEMS.has(id)) return true;
  const known = waiting.get(id);
  if (known !== undefined) return known;
  waiting.set(id, false);
  const recipes = recipesByOutput.get(id) ?? [];
  const result =
    recipes.length > 0 &&
    recipes.every((r) =>
      [r.inputs ?? {}, ...(r.inputAlternatives ?? [])].every((inputs) =>
        Object.keys(inputs).some((k) => !k.startsWith('category:') && waitsOnRunedConstruction(k))
      )
    );
  waiting.set(id, result);
  return result;
}
