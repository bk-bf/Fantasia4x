<script lang="ts">
  import type { Pawn, GameState } from '$lib/game/core/types';
  import { modifierSystem } from '$lib/game/systems/ModifierSystem';
  import type {
    WorkEfficiencyResult,
    ModifierResult,
    ModifierSource
  } from '$lib/game/systems/ModifierSystem';
  import {
    getEfficiencyColor,
    getEfficiencyDescription,
    formatAbilityName,
    formatWorkName,
    formatEffectValue
  } from '$lib/utils/pawnUtils';
  import abilitiesData from '$lib/game/database/abilities.jsonc';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';

  export let pawn: Pawn;
  export let gameState: GameState;

  // ── Ability definitions loaded from DB ────────────────────────────────────
  type AbilityDef = {
    id: string;
    category: string;
    primaryStat: string;
    description: string;
    formula?: { base: number; perPoint: number };
  };
  const ABILITIES: AbilityDef[] = abilitiesData as unknown as AbilityDef[];
  const ABILITY_MAP: Record<string, AbilityDef> = {};
  ABILITIES.forEach((ab) => {
    ABILITY_MAP[ab.id] = ab;
  });

  // State for breakdown toggles
  let showBreakdown: Record<string, boolean> = {};

  // Calculate all modifier results using ModifierSystem
  $: allModifierResults = calculateAllModifierResults(pawn, gameState);

  function calculateAllModifierResults(pawn: Pawn, gameState: GameState) {
    const results: {
      workEfficiency: Record<string, any>;
      combatEfficiency: Record<string, any>;
      survivalEfficiency: Record<string, any>;
      physicalBonus: Record<string, any>;
      mentalBonus: Record<string, any>;
      specialEffects: Record<string, any>;
    } = {
      workEfficiency: {},
      combatEfficiency: {},
      survivalEfficiency: {},
      physicalBonus: {},
      mentalBonus: {},
      specialEffects: {}
    };

    // Work efficiency — iterate WORK_CATEGORIES (source of truth), compute via ModifierSystem
    WORK_CATEGORIES.forEach((wc) => {
      results.workEfficiency[wc.id] = modifierSystem.calculateWorkEfficiency(
        pawn.id,
        wc.id,
        gameState
      );
    });

    // All other ability categories — driven by abilities.jsonc
    const resultBuckets: Record<string, Record<string, any>> = {
      combat: results.combatEfficiency,
      survival: results.survivalEfficiency,
      physical: results.physicalBonus,
      mental: results.mentalBonus,
      special: results.specialEffects
    };
    ABILITIES.forEach((ab) => {
      const bucket = resultBuckets[ab.category];
      if (bucket) bucket[ab.id] = calculateEfficiency(pawn, ab.id);
    });

    return results;
  }

  // ── Generic ability efficiency calculator ─────────────────────────────────
  function calculateEfficiency(pawn: Pawn, abilityId: string): ModifierResult {
    const def = ABILITY_MAP[abilityId];
    const statName = def?.primaryStat || 'strength';
    const base = def?.formula?.base ?? 1.0;
    const perPoint = def?.formula?.perPoint ?? 0.1;
    const statValue = (pawn.stats as any)[statName] || 10;
    const value = base + (statValue - 10) * perPoint;
    const sources: ModifierSource[] = [
      {
        id: statName,
        name: statName.charAt(0).toUpperCase() + statName.slice(1),
        type: 'stat',
        value: value,
        description: `${statName} (${statValue}): ${base} + (${statValue}−10) × ${perPoint} = ${value.toFixed(2)}`
      }
    ];
    return createModifierResult(base, value, value, sources);
  }

  // ── Unified description helpers ──────────────────────────────────────────────
  function getAbilityDescription(id: string, efficiency: number): string {
    const base =
      efficiency >= 2.0
        ? 'Excellent'
        : efficiency >= 1.5
          ? 'Good'
          : efficiency >= 1.0
            ? 'Average'
            : 'Poor';
    return `${base} ${ABILITY_MAP[id]?.description || 'ability'}`;
  }

  // Helper
  function createModifierResult(
    baseValue: number,
    totalValue: number,
    multiplier: number,
    sources: ModifierSource[]
  ): ModifierResult {
    return {
      baseValue,
      totalValue,
      multiplier,
      sources,
      breakdown: {
        base: baseValue,
        additiveBonus: 0,
        multiplicativeBonus: multiplier - 1,
        final: totalValue
      }
    };
  }

  function toggleBreakdown(type: string) {
    showBreakdown[type] = !showBreakdown[type];
    showBreakdown = { ...showBreakdown };
  }
</script>

<div class="abilities-section" id="abilities">
  <h3>| SKILLS &amp; ABILITIES</h3>

  <!-- Work Efficiency Section -->
  {#if Object.keys(allModifierResults.workEfficiency).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        WORK EFFICIENCY ({Object.keys(allModifierResults.workEfficiency).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.workEfficiency) as [workType, result]}
          {@const workDesc = WORK_CATEGORIES.find((w) => w.id === workType)?.description}
          <div class="ability-card" data-category="work-efficiency">
            <div class="ability-header">
              <span class="ability-name">
                {formatWorkName(workType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue > 1.0}
                class:negative={result.totalValue < 1.0}
                class:neutral={result.totalValue === 1.0}
                style="color: {getEfficiencyColor(result.totalValue)}"
              >
                {result.totalValue.toFixed(2)}x
              </span>
            </div>

            <p class="ability-description">
              {getEfficiencyDescription(result.totalValue)} - {workDesc || 'Work activity'}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Modifiers ({result.sources.length})</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`work_${workType}`)}
                >
                  {showBreakdown[`work_${workType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`work_${workType}`]}
                <div class="breakdown-details">
                  <div class="calculation-step base">
                    Base: {result.baseValue.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Total Multiplier: {result.multiplier.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Final: {result.baseValue.toFixed(2)} × {result.multiplier.toFixed(2)} = {result.totalValue.toFixed(
                      2
                    )}x
                  </div>

                  {#each result.sources as source}
                    <div
                      class="calculation-step"
                      class:stat={source.type === 'stat'}
                      class:trait={source.type === 'trait'}
                      class:equipment={source.type === 'item'}
                      class:building={source.type === 'building'}
                    >
                      <span class="source-label">{source.name}: {source.value.toFixed(2)}x</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Combat Effectiveness Section -->
  {#if Object.keys(allModifierResults.combatEfficiency).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        COMBAT EFFECTIVENESS ({Object.keys(allModifierResults.combatEfficiency).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.combatEfficiency) as [combatType, result]}
          <div class="ability-card" data-category="combat">
            <div class="ability-header">
              <span class="ability-name">
                {formatAbilityName(combatType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue > 1.0}
                class:negative={result.totalValue < 1.0}
                class:neutral={result.totalValue === 1.0}
                style="color: {getEfficiencyColor(result.totalValue)}"
              >
                {result.totalValue.toFixed(2)}x
              </span>
            </div>

            <p class="ability-description">
              {getAbilityDescription(combatType, result.totalValue)}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Modifiers ({result.sources.length})</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`combat_${combatType}`)}
                >
                  {showBreakdown[`combat_${combatType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`combat_${combatType}`]}
                <div class="breakdown-details">
                  <div class="calculation-step base">
                    Base: {result.baseValue.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Total Multiplier: {result.multiplier.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Final: {result.baseValue.toFixed(2)} × {result.multiplier.toFixed(2)} = {result.totalValue.toFixed(
                      2
                    )}x
                  </div>

                  {#each result.sources as source}
                    <div
                      class="calculation-step"
                      class:stat={source.type === 'stat'}
                      class:trait={source.type === 'trait'}
                      class:equipment={source.type === 'item'}
                      class:building={source.type === 'building'}
                    >
                      <span class="source-label">{source.name}: {source.value.toFixed(2)}x</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Survival Abilities Section -->
  {#if Object.keys(allModifierResults.survivalEfficiency).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        SURVIVAL ABILITIES ({Object.keys(allModifierResults.survivalEfficiency).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.survivalEfficiency) as [survivalType, result]}
          <div class="ability-card" data-category="survival">
            <div class="ability-header">
              <span class="ability-name">
                {formatAbilityName(survivalType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue > 1.0}
                class:negative={result.totalValue < 1.0}
                class:neutral={result.totalValue === 1.0}
                style="color: {getEfficiencyColor(result.totalValue)}"
              >
                {result.totalValue.toFixed(2)}x
              </span>
            </div>

            <p class="ability-description">
              {getAbilityDescription(survivalType, result.totalValue)}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Modifiers ({result.sources.length})</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`survival_${survivalType}`)}
                >
                  {showBreakdown[`survival_${survivalType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`survival_${survivalType}`]}
                <div class="breakdown-details">
                  <div class="calculation-step base">
                    Base: {result.baseValue.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Total Multiplier: {result.multiplier.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Final: {result.baseValue.toFixed(2)} × {result.multiplier.toFixed(2)} = {result.totalValue.toFixed(
                      2
                    )}x
                  </div>

                  {#each result.sources as source}
                    <div
                      class="calculation-step"
                      class:stat={source.type === 'stat'}
                      class:trait={source.type === 'trait'}
                      class:equipment={source.type === 'item'}
                      class:building={source.type === 'building'}
                    >
                      <span class="source-label">{source.name}: {source.value.toFixed(2)}x</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Physical Bonuses Section -->
  {#if Object.keys(allModifierResults.physicalBonus).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        PHYSICAL BONUSES ({Object.keys(allModifierResults.physicalBonus).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.physicalBonus) as [physicalType, result]}
          <div class="ability-card" data-category="physical">
            <div class="ability-header">
              <span class="ability-name">
                {formatAbilityName(physicalType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue > 1.0}
                class:negative={result.totalValue < 1.0}
                class:neutral={result.totalValue === 1.0}
                style="color: {getEfficiencyColor(result.totalValue)}"
              >
                {result.totalValue.toFixed(2)}x
              </span>
            </div>

            <p class="ability-description">
              {getAbilityDescription(physicalType, result.totalValue)}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Modifiers ({result.sources.length})</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`physical_${physicalType}`)}
                >
                  {showBreakdown[`physical_${physicalType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`physical_${physicalType}`]}
                <div class="breakdown-details">
                  <div class="calculation-step base">
                    Base: {result.baseValue.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Total Multiplier: {result.multiplier.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Final: {result.baseValue.toFixed(2)} × {result.multiplier.toFixed(2)} = {result.totalValue.toFixed(
                      2
                    )}x
                  </div>

                  {#each result.sources as source}
                    <div
                      class="calculation-step"
                      class:stat={source.type === 'stat'}
                      class:trait={source.type === 'trait'}
                      class:equipment={source.type === 'item'}
                      class:building={source.type === 'building'}
                    >
                      <span class="source-label">{source.name}: {source.value.toFixed(2)}x</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Mental Bonuses Section -->
  {#if Object.keys(allModifierResults.mentalBonus).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        MENTAL BONUSES ({Object.keys(allModifierResults.mentalBonus).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.mentalBonus) as [mentalType, result]}
          <div class="ability-card" data-category="mental">
            <div class="ability-header">
              <span class="ability-name">
                {formatAbilityName(mentalType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue > 1.0}
                class:negative={result.totalValue < 1.0}
                class:neutral={result.totalValue === 1.0}
                style="color: {getEfficiencyColor(result.totalValue)}"
              >
                {result.totalValue.toFixed(2)}x
              </span>
            </div>

            <p class="ability-description">
              {getAbilityDescription(mentalType, result.totalValue)}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Modifiers ({result.sources.length})</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`mental_${mentalType}`)}
                >
                  {showBreakdown[`mental_${mentalType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`mental_${mentalType}`]}
                <div class="breakdown-details">
                  <div class="calculation-step base">
                    Base: {result.baseValue.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Total Multiplier: {result.multiplier.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Final: {result.baseValue.toFixed(2)} × {result.multiplier.toFixed(2)} = {result.totalValue.toFixed(
                      2
                    )}x
                  </div>

                  {#each result.sources as source}
                    <div
                      class="calculation-step"
                      class:stat={source.type === 'stat'}
                      class:trait={source.type === 'trait'}
                      class:equipment={source.type === 'item'}
                      class:building={source.type === 'building'}
                    >
                      <span class="source-label">{source.name}: {source.value.toFixed(2)}x</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Special Effects Section -->
  {#if Object.keys(allModifierResults.specialEffects).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        ✨ Special Effects ({Object.keys(allModifierResults.specialEffects).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.specialEffects) as [specialType, result]}
          <div class="ability-card" data-category="special">
            <div class="ability-header">
              <span class="ability-name">
                {formatAbilityName(specialType)}
              </span>
              <span
                class="ability-value"
                class:positive={result.totalValue > 1.0}
                class:negative={result.totalValue < 1.0}
                class:neutral={result.totalValue === 1.0}
                style="color: {getEfficiencyColor(result.totalValue)}"
              >
                {result.totalValue.toFixed(2)}x
              </span>
            </div>

            <p class="ability-description">
              {getAbilityDescription(specialType, result.totalValue)}
            </p>

            <div class="ability-calculation">
              <div class="calculation-header">
                <span>Modifiers ({result.sources.length})</span>
                <button
                  class="toggle-breakdown"
                  on:click={() => toggleBreakdown(`special_${specialType}`)}
                >
                  {showBreakdown[`special_${specialType}`] ? '▼' : '▶'}
                </button>
              </div>

              {#if showBreakdown[`special_${specialType}`]}
                <div class="breakdown-details">
                  <div class="calculation-step base">
                    Base: {result.baseValue.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Total Multiplier: {result.multiplier.toFixed(2)}x
                  </div>
                  <div class="calculation-step formula">
                    Final: {result.baseValue.toFixed(2)} × {result.multiplier.toFixed(2)} = {result.totalValue.toFixed(
                      2
                    )}x
                  </div>

                  {#each result.sources as source}
                    <div
                      class="calculation-step"
                      class:stat={source.type === 'stat'}
                      class:trait={source.type === 'trait'}
                      class:equipment={source.type === 'item'}
                      class:building={source.type === 'building'}
                    >
                      <span class="source-label">{source.name}: {source.value.toFixed(2)}x</span>
                      <div class="source-description">{source.description}</div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .abilities-section {
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding: 0;
    margin-bottom: 0;
  }

  .abilities-section h3 {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin: 1px 0 0 0;
    font-weight: normal;
  }

  .ability-category {
    margin-bottom: 0;
  }

  .category-title {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-dim);
    margin: 0;
    font-size: 11px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--border);
    font-weight: normal;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: var(--bg);
  }

  .abilities-grid {
    display: flex;
    flex-direction: column;
  }

  .ability-card {
    background: var(--bg);
    border: none;
    border-bottom: 1px solid var(--border);
    padding: 3px 8px;
    transition: background 0.1s;
  }

  .ability-card:hover {
    background: var(--bg-hover);
  }

  .ability-card:hover .ability-name,
  .ability-card:hover .calculation-header {
    color: var(--accent-hi);
  }

  .ability-card[data-category='work-efficiency'],
  .ability-card[data-category='combat'],
  .ability-card[data-category='survival'],
  .ability-card[data-category='physical'],
  .ability-card[data-category='mental'],
  .ability-card[data-category='special'] {
    border-left: none;
  }

  .ability-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
  }

  .ability-name {
    color: var(--text-dim);
    font-weight: normal;
    font-size: 11px;
    flex: 1;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .ability-value {
    font-family: 'Courier New', monospace;
    font-weight: bold;
    font-size: 11px;
    padding: 0;
    background: none;
  }

  .ability-value.positive {
    color: var(--pos);
  }
  .ability-value.negative {
    color: var(--neg);
  }
  .ability-value.neutral {
    color: var(--text-muted);
  }

  .ability-description {
    color: var(--text-muted);
    font-size: 11px;
    margin: 0;
    line-height: 1.3;
    font-style: italic;
  }

  .ability-calculation {
    padding-top: 4px;
    margin-top: 2px;
    border-top: 1px solid var(--border);
  }

  .calculation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
    color: var(--text-dim);
    font-weight: normal;
    font-size: 11px;
  }

  .toggle-breakdown {
    background: var(--bg-hover);
    border: 1px solid var(--border-hi);
    color: var(--text);
    padding: 1px 5px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 10px;
  }
  .toggle-breakdown:hover {
    color: var(--accent-hi);
  }

  .breakdown-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 4px;
  }

  .calculation-step {
    margin: 0;
    padding: 2px 6px;
    border-left: 2px solid var(--border);
    background: var(--bg-panel);
    font-size: 10px;
    font-family: 'Courier New', monospace;
    line-height: 1.3;
    color: var(--text-muted);
  }

  .calculation-step.base {
    border-left-color: var(--text-muted);
  }
  .calculation-step.formula {
    border-left-color: var(--accent-hi);
  }
  .calculation-step.stat {
    border-left-color: var(--text);
  }
  .calculation-step.trait {
    border-left-color: var(--border-hi);
  }
  .calculation-step.equipment {
    border-left-color: var(--accent-hi);
  }
  .calculation-step.building {
    border-left-color: var(--pos);
  }

  .source-label {
    color: var(--text);
    font-weight: bold;
    font-size: 10px;
  }

  .source-description {
    color: var(--text-muted);
    font-size: 10px;
    margin-top: 1px;
    line-height: 1.3;
  }
</style>
