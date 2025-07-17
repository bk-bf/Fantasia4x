<script lang="ts">
  import type { Pawn, GameState } from '$lib/game/core/types';
  import { modifierSystem } from '$lib/game/systems/ModifierSystem';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';
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

  export let pawn: Pawn;
  export let gameState: GameState;

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

    // Work Efficiency (using existing ModifierSystem)
    WORK_CATEGORIES.forEach((workCategory) => {
      results.workEfficiency[workCategory.id] = modifierSystem.calculateWorkEfficiency(
        pawn.id,
        workCategory.id,
        gameState
      );
    });

    // Combat Effectiveness
    const combatTypes = ['melee', 'ranged', 'defense', 'accuracy'];
    combatTypes.forEach((combatType) => {
      results.combatEfficiency[combatType] = calculateCombatEfficiency(pawn, combatType, gameState);
    });

    // Survival Abilities
    const survivalTypes = ['foraging', 'navigation', 'weather_resistance', 'disease_resistance'];
    survivalTypes.forEach((survivalType) => {
      results.survivalEfficiency[survivalType] = calculateSurvivalBonus(
        pawn,
        survivalType,
        gameState
      );
    });

    // Physical Bonuses
    const physicalTypes = ['carry_capacity', 'movement_speed', 'stamina', 'health_regeneration'];
    physicalTypes.forEach((physicalType) => {
      results.physicalBonus[physicalType] = calculatePhysicalBonus(pawn, physicalType, gameState);
    });

    // Mental Bonuses
    const mentalTypes = ['learning_speed', 'memory', 'focus', 'social_influence'];
    mentalTypes.forEach((mentalType) => {
      results.mentalBonus[mentalType] = calculateMentalBonus(pawn, mentalType, gameState);
    });

    // Special Effects
    const specialTypes = ['leadership', 'diplomacy', 'trade_bonus', 'research_speed'];
    specialTypes.forEach((specialType) => {
      results.specialEffects[specialType] = calculateSpecialEffect(pawn, specialType, gameState);
    });

    return results;
  }

  // Calculation functions
  function calculateCombatEfficiency(
    pawn: Pawn,
    combatType: string,
    gameState: GameState
  ): ModifierResult {
    const sources = [];
    let baseValue = 1.0;
    let multiplier = 1.0;

    // Stat contributions
    const primaryStat = getCombatPrimaryStat(combatType);
    const statValue = (pawn.stats as any)[primaryStat] || 10;
    const statBonus = statValue / 10;
    multiplier *= statBonus;

    sources.push({
      id: primaryStat,
      name: primaryStat.charAt(0).toUpperCase() + primaryStat.slice(1),
      type: 'stat' as const,
      value: statBonus,
      description: `${primaryStat} (${statValue}) provides ${(statBonus * 100).toFixed(0)}% ${combatType} effectiveness`
    });

    return createModifierResult(baseValue, baseValue * multiplier, multiplier, sources);
  }

  function calculateSurvivalBonus(
    pawn: Pawn,
    survivalType: string,
    gameState: GameState
  ): ModifierResult {
    const sources = [];
    let baseValue = 1.0;
    let multiplier = 1.0;

    const primaryStat = getSurvivalPrimaryStat(survivalType);
    const statValue = (pawn.stats as any)[primaryStat] || 10;
    const statBonus = statValue / 10;
    multiplier *= statBonus;

    sources.push({
      id: primaryStat,
      name: primaryStat.charAt(0).toUpperCase() + primaryStat.slice(1),
      type: 'stat' as const,
      value: statBonus,
      description: `${primaryStat} (${statValue}) provides ${(statBonus * 100).toFixed(0)}% ${survivalType} effectiveness`
    });

    return createModifierResult(baseValue, baseValue * multiplier, multiplier, sources);
  }

  function calculatePhysicalBonus(
    pawn: Pawn,
    physicalType: string,
    gameState: GameState
  ): ModifierResult {
    const sources = [];
    let baseValue = 1.0;
    let multiplier = 1.0;

    const primaryStat = getPhysicalPrimaryStat(physicalType);
    const statValue = (pawn.stats as any)[primaryStat] || 10;
    const statBonus = statValue / 10;
    multiplier *= statBonus;

    sources.push({
      id: primaryStat,
      name: primaryStat.charAt(0).toUpperCase() + primaryStat.slice(1),
      type: 'stat' as const,
      value: statBonus,
      description: `${primaryStat} (${statValue}) affects ${physicalType}`
    });

    return createModifierResult(baseValue, baseValue * multiplier, multiplier, sources);
  }

  function calculateMentalBonus(
    pawn: Pawn,
    mentalType: string,
    gameState: GameState
  ): ModifierResult {
    const sources = [];
    let baseValue = 1.0;
    let multiplier = 1.0;

    const primaryStat = getMentalPrimaryStat(mentalType);
    const statValue = (pawn.stats as any)[primaryStat] || 10;
    const statBonus = statValue / 10;
    multiplier *= statBonus;

    sources.push({
      id: primaryStat,
      name: primaryStat.charAt(0).toUpperCase() + primaryStat.slice(1),
      type: 'stat' as const,
      value: statBonus,
      description: `${primaryStat} (${statValue}) affects ${mentalType}`
    });

    return createModifierResult(baseValue, baseValue * multiplier, multiplier, sources);
  }

  function calculateSpecialEffect(
    pawn: Pawn,
    specialType: string,
    gameState: GameState
  ): ModifierResult {
    const sources = [];
    let baseValue = 1.0;
    let multiplier = 1.0;

    const primaryStat = getSpecialPrimaryStat(specialType);
    const statValue = (pawn.stats as any)[primaryStat] || 10;
    const statBonus = statValue / 10;
    multiplier *= statBonus;

    sources.push({
      id: primaryStat,
      name: primaryStat.charAt(0).toUpperCase() + primaryStat.slice(1),
      type: 'stat' as const,
      value: statBonus,
      description: `${primaryStat} (${statValue}) affects ${specialType}`
    });

    return createModifierResult(baseValue, baseValue * multiplier, multiplier, sources);
  }

  // Helper functions
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

  function getCombatPrimaryStat(combatType: string): string {
    const statMap: Record<string, string> = {
      melee: 'strength',
      ranged: 'dexterity',
      defense: 'constitution',
      accuracy: 'dexterity'
    };
    return statMap[combatType] || 'strength';
  }

  function getSurvivalPrimaryStat(survivalType: string): string {
    const statMap: Record<string, string> = {
      foraging: 'wisdom',
      navigation: 'intelligence',
      weather_resistance: 'constitution',
      disease_resistance: 'constitution'
    };
    return statMap[survivalType] || 'constitution';
  }

  function getPhysicalPrimaryStat(physicalType: string): string {
    const statMap: Record<string, string> = {
      carry_capacity: 'strength',
      movement_speed: 'dexterity',
      stamina: 'constitution',
      health_regeneration: 'constitution'
    };
    return statMap[physicalType] || 'constitution';
  }

  function getMentalPrimaryStat(mentalType: string): string {
    const statMap: Record<string, string> = {
      learning_speed: 'intelligence',
      memory: 'intelligence',
      focus: 'wisdom',
      social_influence: 'charisma'
    };
    return statMap[mentalType] || 'intelligence';
  }

  function getSpecialPrimaryStat(specialType: string): string {
    const statMap: Record<string, string> = {
      leadership: 'charisma',
      diplomacy: 'charisma',
      trade_bonus: 'charisma',
      research_speed: 'intelligence'
    };
    return statMap[specialType] || 'charisma';
  }

  function toggleBreakdown(type: string) {
    showBreakdown[type] = !showBreakdown[type];
    showBreakdown = { ...showBreakdown };
  }

  // Icon functions
  function getCombatIcon(combatType: string): string {
    const iconMap: Record<string, string> = {
      melee: '⚔️',
      ranged: '🏹',
      defense: '🛡️',
      accuracy: '🎯'
    };
    return iconMap[combatType] || '⚔️';
  }

  function getSurvivalIcon(survivalType: string): string {
    const iconMap: Record<string, string> = {
      foraging: '🍃',
      navigation: '🧭',
      weather_resistance: '🌦️',
      disease_resistance: '🏥'
    };
    return iconMap[survivalType] || '🛡️';
  }

  function getPhysicalIcon(physicalType: string): string {
    const iconMap: Record<string, string> = {
      carry_capacity: '📦',
      movement_speed: '💨',
      stamina: '💪',
      health_regeneration: '💚'
    };
    return iconMap[physicalType] || '💪';
  }

  function getMentalIcon(mentalType: string): string {
    const iconMap: Record<string, string> = {
      learning_speed: '📚',
      memory: '🧠',
      focus: '🎯',
      social_influence: '👥'
    };
    return iconMap[mentalType] || '🧠';
  }

  function getSpecialIcon(specialType: string): string {
    const iconMap: Record<string, string> = {
      leadership: '👑',
      diplomacy: '🤝',
      trade_bonus: '💰',
      research_speed: '🔬'
    };
    return iconMap[specialType] || '✨';
  }

  // Description functions
  function getCombatDescription(combatType: string, efficiency: number): string {
    const base =
      efficiency >= 2.0
        ? 'Excellent'
        : efficiency >= 1.5
          ? 'Good'
          : efficiency >= 1.0
            ? 'Average'
            : 'Poor';
    const descriptions: Record<string, string> = {
      melee: `${base} close combat effectiveness`,
      ranged: `${base} ranged combat accuracy`,
      defense: `${base} defensive capabilities`,
      accuracy: `${base} targeting precision`
    };
    return descriptions[combatType] || `${base} combat ability`;
  }

  function getSurvivalDescription(survivalType: string, efficiency: number): string {
    const base =
      efficiency >= 2.0
        ? 'Excellent'
        : efficiency >= 1.5
          ? 'Good'
          : efficiency >= 1.0
            ? 'Average'
            : 'Poor';
    const descriptions: Record<string, string> = {
      foraging: `${base} at finding food and resources`,
      navigation: `${base} pathfinding and orientation`,
      weather_resistance: `${base} resistance to harsh weather`,
      disease_resistance: `${base} immunity to diseases`
    };
    return descriptions[survivalType] || `${base} survival ability`;
  }

  function getPhysicalDescription(physicalType: string, efficiency: number): string {
    const base =
      efficiency >= 2.0
        ? 'Excellent'
        : efficiency >= 1.5
          ? 'Good'
          : efficiency >= 1.0
            ? 'Average'
            : 'Poor';
    const descriptions: Record<string, string> = {
      carry_capacity: `${base} carrying capacity`,
      movement_speed: `${base} movement speed`,
      stamina: `${base} physical endurance`,
      health_regeneration: `${base} natural healing`
    };
    return descriptions[physicalType] || `${base} physical ability`;
  }

  function getMentalDescription(mentalType: string, efficiency: number): string {
    const base =
      efficiency >= 2.0
        ? 'Excellent'
        : efficiency >= 1.5
          ? 'Good'
          : efficiency >= 1.0
            ? 'Average'
            : 'Poor';
    const descriptions: Record<string, string> = {
      learning_speed: `${base} learning ability`,
      memory: `${base} information retention`,
      focus: `${base} concentration ability`,
      social_influence: `${base} social skills`
    };
    return descriptions[mentalType] || `${base} mental ability`;
  }

  function getSpecialDescription(specialType: string, efficiency: number): string {
    const base =
      efficiency >= 2.0
        ? 'Excellent'
        : efficiency >= 1.5
          ? 'Good'
          : efficiency >= 1.0
            ? 'Average'
            : 'Poor';
    const descriptions: Record<string, string> = {
      leadership: `${base} leadership qualities`,
      diplomacy: `${base} diplomatic skills`,
      trade_bonus: `${base} trading acumen`,
      research_speed: `${base} research capabilities`
    };
    return descriptions[specialType] || `${base} special ability`;
  }
</script>

<div class="abilities-section" id="abilities">
  <h3>🎯 Skills & Abilities</h3>

  <!-- Work Efficiency Section -->
  {#if Object.keys(allModifierResults.workEfficiency).length > 0}
    <div class="ability-category">
      <h4 class="category-title">
        ⚡ Work Efficiency ({Object.keys(allModifierResults.workEfficiency).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.workEfficiency) as [workType, result]}
          {@const workCategory = WORK_CATEGORIES.find((w) => w.id === workType)}
          <div class="ability-card" data-category="work-efficiency">
            <div class="ability-header">
              <span class="ability-name">
                {workCategory?.emoji || '🔨'}
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
              {getEfficiencyDescription(result.totalValue)} - {workCategory?.description ||
                'Work activity'}
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
        ⚔️ Combat Effectiveness ({Object.keys(allModifierResults.combatEfficiency).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.combatEfficiency) as [combatType, result]}
          <div class="ability-card" data-category="combat">
            <div class="ability-header">
              <span class="ability-name">
                {getCombatIcon(combatType)}
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
              {getCombatDescription(combatType, result.totalValue)}
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
        🛡️ Survival Abilities ({Object.keys(allModifierResults.survivalEfficiency).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.survivalEfficiency) as [survivalType, result]}
          <div class="ability-card" data-category="survival">
            <div class="ability-header">
              <span class="ability-name">
                {getSurvivalIcon(survivalType)}
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
              {getSurvivalDescription(survivalType, result.totalValue)}
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
        💪 Physical Bonuses ({Object.keys(allModifierResults.physicalBonus).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.physicalBonus) as [physicalType, result]}
          <div class="ability-card" data-category="physical">
            <div class="ability-header">
              <span class="ability-name">
                {getPhysicalIcon(physicalType)}
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
              {getPhysicalDescription(physicalType, result.totalValue)}
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
        🧠 Mental Bonuses ({Object.keys(allModifierResults.mentalBonus).length})
      </h4>

      <div class="abilities-grid">
        {#each Object.entries(allModifierResults.mentalBonus) as [mentalType, result]}
          <div class="ability-card" data-category="mental">
            <div class="ability-header">
              <span class="ability-name">
                {getMentalIcon(mentalType)}
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
              {getMentalDescription(mentalType, result.totalValue)}
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
                {getSpecialIcon(specialType)}
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
              {getSpecialDescription(specialType, result.totalValue)}
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
    background: #0c0c0c;
    border-radius: 8px;
    padding: 25px;
    margin-bottom: 30px;
    border-left: 4px solid #ff9800;
  }

  .abilities-section h3 {
    color: #ff9800;
    margin: 0 0 25px 0;
    font-size: 1.4em;
    text-shadow: 0 0 10px rgba(255, 152, 0, 0.3);
  }

  .ability-category {
    margin-bottom: 35px;
  }

  .category-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ff9800;
    margin: 0 0 20px 0;
    font-size: 1.2em;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 152, 0, 0.3);
    font-weight: bold;
  }

  .abilities-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
    gap: 20px;
  }

  .ability-card {
    background: #000000;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 20px;
    transition: all 0.3s ease;
  }

  .ability-card:hover {
    box-shadow: 0 0 15px rgba(255, 152, 0, 0.2);
  }

  .ability-card:hover .ability-name {
    color: #4caf50;
    transition: color 0.2s ease;
  }

  .ability-card:hover .calculation-header {
    color: #4caf50;
    transition: color 0.2s ease;
  }

  /* Ability Card Categories */
  .ability-card[data-category='work-efficiency'] {
    border-left: 3px solid #ff9800;
  }

  .ability-card[data-category='combat'] {
    border-left: 3px solid #f44336;
  }

  .ability-card[data-category='survival'] {
    border-left: 3px solid #4caf50;
  }

  .ability-card[data-category='physical'] {
    border-left: 3px solid #9c27b0;
  }

  .ability-card[data-category='mental'] {
    border-left: 3px solid #00bcd4;
  }

  .ability-card[data-category='special'] {
    border-left: 3px solid #ffd700;
  }

  .ability-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .ability-name {
    color: #ff9800;
    font-weight: bold;
    font-size: 1.1em;
    flex: 1;
  }

  .ability-value {
    font-family: monospace;
    font-weight: bold;
    font-size: 1.2em;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.3);
  }

  .ability-value.positive {
    background: rgba(76, 175, 80, 0.2);
  }

  .ability-value.negative {
    background: rgba(244, 67, 54, 0.2);
  }

  .ability-value.neutral {
    color: #999;
    background: rgba(153, 153, 153, 0.1);
  }

  .ability-description {
    color: #ccc;
    font-size: 0.9em;
    margin: 0 0 15px 0;
    line-height: 1.4;
  }

  .ability-calculation {
    border-top: 1px solid rgba(255, 152, 0, 0.3);
    padding-top: 15px;
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .calculation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    color: #ff9800;
    font-weight: bold;
    font-size: 0.9em;
  }

  .toggle-breakdown {
    background: none;
    border: 1px solid #ff9800;
    color: #ff9800;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.8em;
    transition: all 0.3s ease;
  }

  .toggle-breakdown:hover {
    background: rgba(255, 152, 0, 0.1);
  }

  .breakdown-details {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
  }

  .calculation-step {
    margin: 3px 0;
    padding: 6px 10px;
    border-radius: 4px;
    border-left: 3px solid #555;
    background: rgba(0, 0, 0, 0.3);
    font-size: 0.8em;
    font-family: monospace;
    line-height: 1.3;
  }

  .calculation-step.base {
    border-left-color: #999;
    background: rgba(153, 153, 153, 0.1);
  }

  .calculation-step.formula {
    border-left-color: #ff9800;
    background: rgba(255, 152, 0, 0.1);
  }

  .calculation-step.stat {
    border-left-color: #2196f3;
    background: rgba(33, 150, 243, 0.1);
  }

  .calculation-step.trait {
    border-left-color: #9c27b0;
    background: rgba(156, 39, 176, 0.1);
  }

  .calculation-step.equipment {
    border-left-color: #ff9800;
    background: rgba(255, 152, 0, 0.1);
  }

  .calculation-step.building {
    border-left-color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
  }

  .source-label {
    color: #fff;
    font-weight: bold;
    font-size: 0.9em;
    font-style: italic;
  }

  .source-description {
    color: #bbb;
    font-size: 0.8em;
    margin-top: 2px;
    line-height: 1.3;
  }

  @media (max-width: 768px) {
    .abilities-grid {
      grid-template-columns: 1fr;
    }

    .ability-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .category-title {
      font-size: 1em;
      text-align: center;
    }

    .ability-calculation {
      font-size: 0.75em;
    }
  }
</style>
