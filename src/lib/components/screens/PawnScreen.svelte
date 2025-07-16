<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { getTraitIcon } from '$lib/game/core/Race';
  import { onMount } from 'svelte';
  import { onDestroy } from 'svelte';
  import type { GameState, Pawn, Equipment, EquipmentSlot } from '$lib/game/core/types';
  import {
    equipItem,
    unequipItem,
    useConsumable,
    canEquipItem,
    syncAllPawnInventories
  } from '$lib/game/core/PawnEquipment';
  import { itemService } from '$lib/game/services/ItemService';
  import { modifierSystem } from '$lib/game/systems/ModifierSystem';
  import { WORK_CATEGORIES } from '$lib/game/core/Work';
  import type { WorkEfficiencyResult, ModifierResult } from '$lib/game/systems/ModifierSystem';

  let pawns: Pawn[] = [];
  let selectedPawn: Pawn | null = null;
  let selectedPawnId: string | null = null;
  let pawnScreenElement: HTMLElement;
  let equipmentLoading = false;

  // State for breakdown toggles
  let showBreakdown: Record<string, boolean> = {};

  // Calculate all modifier results using ModifierSystem
  $: allModifierResults =
    selectedPawn && $gameState ? calculateAllModifierResults(selectedPawn, $gameState) : {};

  function calculateAllModifierResults(pawn: Pawn, gameState: any) {
    const results = {
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

  // Combat efficiency calculation
  function calculateCombatEfficiency(
    pawn: Pawn,
    combatType: string,
    gameState: any
  ): ModifierResult {
    const sources = [];
    let baseValue = 1.0;
    let multiplier = 1.0;

    // Stat contributions
    const primaryStat = getCombatPrimaryStat(combatType);
    const statValue = pawn.stats[primaryStat] || 10;
    const statBonus = statValue / 10;
    multiplier *= statBonus;

    sources.push({
      id: primaryStat,
      name: primaryStat.charAt(0).toUpperCase() + primaryStat.slice(1),
      type: 'stat',
      value: statBonus,
      description: `${primaryStat} (${statValue}) provides ${(statBonus * 100).toFixed(0)}% ${combatType} effectiveness`
    });

    // Equipment bonuses
    const equipmentResult = modifierSystem.calculateEquipmentBonuses(pawn);
    Object.entries(equipmentResult).forEach(([effectName, result]) => {
      if (isCombatRelatedEffect(effectName, combatType)) {
        const bonus = 1 + result.totalValue / 100;
        multiplier *= bonus;
        sources.push({
          id: `equipment_${effectName}`,
          name: `Equipment: ${effectName}`,
          type: 'item',
          value: bonus,
          description: `Equipment provides ${result.totalValue.toFixed(0)}% ${combatType} bonus`
        });
      }
    });

    // Trait bonuses
    const traitResult = modifierSystem.calculateAllTraitEffects(pawn);
    Object.entries(traitResult).forEach(([effectName, result]) => {
      if (isCombatRelatedEffect(effectName, combatType)) {
        const bonus = 1 + result.totalValue / 100;
        multiplier *= bonus;
        sources.push({
          id: `trait_${effectName}`,
          name: `Trait: ${effectName}`,
          type: 'trait',
          value: bonus,
          description: `Racial traits provide ${result.totalValue.toFixed(0)}% ${combatType} bonus`
        });
      }
    });

    return createModifierResult(baseValue, baseValue * multiplier, multiplier, sources);
  }

  // Survival bonus calculation
  function calculateSurvivalBonus(
    pawn: Pawn,
    survivalType: string,
    gameState: any
  ): ModifierResult {
    const sources = [];
    let baseValue = 1.0;
    let multiplier = 1.0;

    const primaryStat = getSurvivalPrimaryStat(survivalType);
    const statValue = pawn.stats[primaryStat] || 10;
    const statBonus = statValue / 10;
    multiplier *= statBonus;

    sources.push({
      id: primaryStat,
      name: primaryStat.charAt(0).toUpperCase() + primaryStat.slice(1),
      type: 'stat',
      value: statBonus,
      description: `${primaryStat} (${statValue}) provides ${(statBonus * 100).toFixed(0)}% ${survivalType} effectiveness`
    });

    return createModifierResult(baseValue, baseValue * multiplier, multiplier, sources);
  }

  // Physical bonus calculation
  function calculatePhysicalBonus(
    pawn: Pawn,
    physicalType: string,
    gameState: any
  ): ModifierResult {
    const sources = [];
    let baseValue = 1.0;
    let multiplier = 1.0;

    const primaryStat = getPhysicalPrimaryStat(physicalType);
    const statValue = pawn.stats[primaryStat] || 10;
    const statBonus = statValue / 10;
    multiplier *= statBonus;

    sources.push({
      id: primaryStat,
      name: primaryStat.charAt(0).toUpperCase() + primaryStat.slice(1),
      type: 'stat',
      value: statBonus,
      description: `${primaryStat} (${statValue}) provides ${(statBonus * 100).toFixed(0)}% ${physicalType} effectiveness`
    });

    return createModifierResult(baseValue, baseValue * multiplier, multiplier, sources);
  }

  // Mental bonus calculation
  function calculateMentalBonus(pawn: Pawn, mentalType: string, gameState: any): ModifierResult {
    const sources = [];
    let baseValue = 1.0;
    let multiplier = 1.0;

    const primaryStat = getMentalPrimaryStat(mentalType);
    const statValue = pawn.stats[primaryStat] || 10;
    const statBonus = statValue / 10;
    multiplier *= statBonus;

    sources.push({
      id: primaryStat,
      name: primaryStat.charAt(0).toUpperCase() + primaryStat.slice(1),
      type: 'stat',
      value: statBonus,
      description: `${primaryStat} (${statValue}) provides ${(statBonus * 100).toFixed(0)}% ${mentalType} effectiveness`
    });

    return createModifierResult(baseValue, baseValue * multiplier, multiplier, sources);
  }

  // Special effect calculation
  function calculateSpecialEffect(pawn: Pawn, specialType: string, gameState: any): ModifierResult {
    const sources = [];
    let baseValue = 1.0;
    let multiplier = 1.0;

    const primaryStat = getSpecialPrimaryStat(specialType);
    const statValue = pawn.stats[primaryStat] || 10;
    const statBonus = statValue / 10;
    multiplier *= statBonus;

    sources.push({
      id: primaryStat,
      name: primaryStat.charAt(0).toUpperCase() + primaryStat.slice(1),
      type: 'stat',
      value: statBonus,
      description: `${primaryStat} (${statValue}) provides ${(statBonus * 100).toFixed(0)}% ${specialType} effectiveness`
    });

    return createModifierResult(baseValue, baseValue * multiplier, multiplier, sources);
  }

  // Helper functions for stat mapping
  function getCombatPrimaryStat(combatType: string): string {
    const statMap = {
      melee: 'strength',
      ranged: 'dexterity',
      defense: 'constitution',
      accuracy: 'dexterity'
    };
    return statMap[combatType] || 'strength';
  }

  function getSurvivalPrimaryStat(survivalType: string): string {
    const statMap = {
      foraging: 'wisdom',
      navigation: 'intelligence',
      weather_resistance: 'constitution',
      disease_resistance: 'constitution'
    };
    return statMap[survivalType] || 'wisdom';
  }

  function getPhysicalPrimaryStat(physicalType: string): string {
    const statMap = {
      carry_capacity: 'strength',
      movement_speed: 'dexterity',
      stamina: 'constitution',
      health_regeneration: 'constitution'
    };
    return statMap[physicalType] || 'strength';
  }

  function getMentalPrimaryStat(mentalType: string): string {
    const statMap = {
      learning_speed: 'intelligence',
      memory: 'intelligence',
      focus: 'wisdom',
      social_influence: 'charisma'
    };
    return statMap[mentalType] || 'intelligence';
  }

  function getSpecialPrimaryStat(specialType: string): string {
    const statMap = {
      leadership: 'charisma',
      diplomacy: 'charisma',
      trade_bonus: 'charisma',
      research_speed: 'intelligence'
    };
    return statMap[specialType] || 'charisma';
  }

  function isCombatRelatedEffect(effectName: string, combatType: string): boolean {
    const lowerEffect = effectName.toLowerCase();
    const lowerCombat = combatType.toLowerCase();

    return (
      lowerEffect.includes(lowerCombat) ||
      lowerEffect.includes('combat') ||
      lowerEffect.includes('attack') ||
      lowerEffect.includes('damage') ||
      lowerEffect.includes('defense')
    );
  }

  function createModifierResult(
    baseValue: number,
    totalValue: number,
    multiplier: number,
    sources: any[]
  ): ModifierResult {
    return {
      baseValue,
      totalValue,
      multiplier,
      sources,
      breakdown: {
        base: baseValue,
        additiveBonus: 0,
        multiplicativeBonus: multiplier,
        final: totalValue
      }
    };
  }

  function toggleBreakdown(type: string) {
    showBreakdown[type] = !showBreakdown[type];
    showBreakdown = { ...showBreakdown };
  }

  // Icon functions
  function getCombatIcon(combatType: string): string {
    const iconMap = {
      melee: '⚔️',
      ranged: '🏹',
      defense: '🛡️',
      accuracy: '🎯'
    };
    return iconMap[combatType] || '⚔️';
  }

  function getSurvivalIcon(survivalType: string): string {
    const iconMap = {
      foraging: '🍃',
      navigation: '🧭',
      weather_resistance: '🌦️',
      disease_resistance: '🏥'
    };
    return iconMap[survivalType] || '🛡️';
  }

  function getPhysicalIcon(physicalType: string): string {
    const iconMap = {
      carry_capacity: '📦',
      movement_speed: '💨',
      stamina: '💪',
      health_regeneration: '💚'
    };
    return iconMap[physicalType] || '💪';
  }

  function getMentalIcon(mentalType: string): string {
    const iconMap = {
      learning_speed: '📚',
      memory: '🧠',
      focus: '🎯',
      social_influence: '👥'
    };
    return iconMap[mentalType] || '🧠';
  }

  function getSpecialIcon(specialType: string): string {
    const iconMap = {
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
    const descriptions = {
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
    const descriptions = {
      foraging: `${base} at finding food and resources`,
      navigation: `${base} pathfinding and orientation`,
      weather_resistance: `${base} resistance to harsh weather`,
      disease_resistance: `${base} immunity to diseases`
    };
    return descriptions[survivalType] || `${base} survival skill`;
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
    const descriptions = {
      carry_capacity: `${base} ability to carry heavy loads`,
      movement_speed: `${base} movement and agility`,
      stamina: `${base} endurance and staying power`,
      health_regeneration: `${base} natural healing rate`
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
    const descriptions = {
      learning_speed: `${base} ability to acquire new skills`,
      memory: `${base} retention and recall`,
      focus: `${base} concentration and attention`,
      social_influence: `${base} persuasion and charisma`
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
    const descriptions = {
      leadership: `${base} ability to lead others`,
      diplomacy: `${base} negotiation skills`,
      trade_bonus: `${base} commercial acumen`,
      research_speed: `${base} scientific methodology`
    };
    return descriptions[specialType] || `${base} special ability`;
  }

  function formatAbilityName(abilityName: string): string {
    return abilityName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/_/g, ' ')
      .trim();
  }

  function getEfficiencyColor(efficiency: number): string {
    if (efficiency >= 3.0) return '#4CAF50';
    if (efficiency >= 2.0) return '#8BC34A';
    if (efficiency >= 1.5) return '#FFA726';
    if (efficiency >= 1.0) return '#FF9800';
    return '#9E9E9E';
  }

  function getEfficiencyDescription(efficiency: number): string {
    if (efficiency >= 3.0) return 'Highly efficient';
    if (efficiency >= 2.0) return 'Very efficient';
    if (efficiency >= 1.5) return 'Efficient';
    if (efficiency >= 1.0) return 'Standard efficiency';
    return 'Below average';
  }

  function formatWorkName(workId: string): string {
    return workId.charAt(0).toUpperCase() + workId.slice(1).replace(/([A-Z])/g, ' $1');
  }

  // Game state subscription and pawn management
  const unsubscribe = gameState.subscribe((state) => {
    pawns = state.pawns || [];

    if (selectedPawnId && pawns.length > 0) {
      const updatedPawn = pawns.find((p) => p.id === selectedPawnId);
      if (updatedPawn) {
        selectedPawn = updatedPawn;
      }
    } else if (!selectedPawn && pawns.length > 0) {
      selectedPawn = pawns[0];
      selectedPawnId = pawns[0].id;
    }
  });

  onMount(() => {
    if (pawnScreenElement) {
      pawnScreenElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  function scrollToSection(sectionId: string) {
    const element = document.getElementById(sectionId);
    if (element && pawnScreenElement) {
      const elementTop = element.offsetTop;
      pawnScreenElement.scrollTo({
        top: elementTop - 20,
        behavior: 'smooth'
      });
    }
  }

  onDestroy(() => {
    unsubscribe();
  });

  function selectPawn(pawn: Pawn) {
    selectedPawn = pawn;
    selectedPawnId = pawn.id;
  }

  // Utility functions for stats, mood, health, needs
  function getStatColor(statValue: number): string {
    if (statValue >= 18) return '#4CAF50';
    if (statValue >= 15) return '#8BC34A';
    if (statValue >= 12) return '#FFA726';
    if (statValue >= 9) return '#FF9800';
    return '#9E9E9E';
  }

  function getStatDescription(statName: string, statValue: number): string {
    const descriptions: Record<string, Record<string, string>> = {
      strength: {
        exceptional: 'Legendary physical might',
        high: 'Exceptional muscular power',
        good: 'Above-average strength',
        average: 'Decent physical power',
        low: 'Below-average strength'
      },
      dexterity: {
        exceptional: 'Supernatural agility and grace',
        high: 'Exceptional speed and coordination',
        good: 'Quick reflexes and nimble',
        average: 'Adequate coordination',
        low: 'Somewhat clumsy'
      },
      intelligence: {
        exceptional: 'Brilliant genius-level intellect',
        high: 'Highly intelligent and analytical',
        good: 'Quick learner and sharp mind',
        average: 'Average reasoning ability',
        low: 'Slower to grasp concepts'
      },
      wisdom: {
        exceptional: 'Profound wisdom and insight',
        high: 'Excellent judgment and perception',
        good: 'Good instincts and awareness',
        average: 'Decent common sense',
        low: 'Sometimes poor judgment'
      },
      charisma: {
        exceptional: 'Magnetic personality and leadership',
        high: 'Very charming and persuasive',
        good: 'Pleasant and likeable',
        average: 'Unremarkable social skills',
        low: 'Awkward in social situations'
      },
      constitution: {
        exceptional: 'Iron constitution and endurance',
        high: 'Very hardy and resilient',
        good: 'Good health and stamina',
        average: 'Average physical resilience',
        low: 'Somewhat frail'
      }
    };

    const level =
      statValue >= 18
        ? 'exceptional'
        : statValue >= 15
          ? 'high'
          : statValue >= 12
            ? 'good'
            : statValue >= 9
              ? 'average'
              : 'low';
    return descriptions[statName]?.[level] || 'Unknown';
  }

  function getMoodColor(mood: number): string {
    if (mood >= 80) return '#4CAF50';
    if (mood >= 60) return '#8BC34A';
    if (mood >= 40) return '#FFA726';
    if (mood >= 20) return '#FF5722';
    return '#D32F2F';
  }

  function getMoodDescription(mood: number): string {
    if (mood >= 80) return 'Ecstatic and joyful';
    if (mood >= 60) return 'Content and happy';
    if (mood >= 40) return 'Neutral mood';
    if (mood >= 20) return 'Somewhat sad';
    return 'Deeply depressed';
  }

  function getHealthColor(health: number): string {
    if (health >= 90) return '#4CAF50';
    if (health >= 70) return '#8BC34A';
    if (health >= 50) return '#FFA726';
    if (health >= 25) return '#FF5722';
    return '#D32F2F';
  }

  function getHealthDescription(health: number): string {
    if (health >= 90) return 'Perfect health';
    if (health >= 70) return 'Good condition';
    if (health >= 50) return 'Some injuries';
    if (health >= 25) return 'Badly wounded';
    return 'Critical condition';
  }

  function getNeedColor(needValue: number): string {
    if (needValue <= 20) return '#4CAF50';
    if (needValue <= 40) return '#8BC34A';
    if (needValue <= 60) return '#FFA726';
    if (needValue <= 80) return '#FF5722';
    return '#D32F2F';
  }

  function getNeedDescription(needType: string, needValue: number): string {
    const descriptions: Record<string, Record<string, string>> = {
      hunger: {
        satisfied: 'Well fed',
        content: 'Slightly hungry',
        moderate: 'Hungry',
        high: 'Very hungry',
        critical: 'Starving'
      },
      fatigue: {
        satisfied: 'Well rested',
        content: 'Slightly tired',
        moderate: 'Tired',
        high: 'Very tired',
        critical: 'Exhausted'
      },
      sleep: {
        satisfied: 'Alert and awake',
        content: 'Slightly sleepy',
        moderate: 'Sleepy',
        high: 'Very sleepy',
        critical: 'Must sleep soon'
      }
    };

    const level =
      needValue <= 20
        ? 'satisfied'
        : needValue <= 40
          ? 'content'
          : needValue <= 60
            ? 'moderate'
            : needValue <= 80
              ? 'high'
              : 'critical';
    return descriptions[needType]?.[level] || 'Unknown';
  }

  function formatEffectValue(effectName: string, effectValue: any): string {
    if (typeof effectValue === 'number') {
      if (effectName.includes('Bonus') || effectName.includes('Penalty')) {
        return effectValue > 0 ? `+${effectValue}` : `${effectValue}`;
      } else if (
        effectName.includes('Rate') ||
        effectName.includes('Resistance') ||
        effectName.includes('Efficiency')
      ) {
        if (effectValue > 1) {
          return `+${Math.round((effectValue - 1) * 100)}%`;
        } else if (effectValue < 1) {
          return `-${Math.round((1 - effectValue) * 100)}%`;
        }
        return `${Math.round(effectValue * 100)}%`;
      }
      return `${effectValue}`;
    }
    return String(effectValue);
  }

  // Equipment management functions
  function equipPawnItem(pawnId: string, itemId: string) {
    equipmentLoading = true;
    gameState.update((state) => {
      const pawnIndex = state.pawns.findIndex((p) => p.id === pawnId);
      if (pawnIndex !== -1) {
        state.pawns[pawnIndex] = equipItem(state.pawns[pawnIndex], itemId);
        state = syncAllPawnInventories(state);
      }
      equipmentLoading = false;
      return state;
    });
  }

  function unequipPawnItem(pawnId: string, slot: string) {
    equipmentLoading = true;
    gameState.update((state) => {
      const pawnIndex = state.pawns.findIndex((p) => p.id === pawnId);
      if (pawnIndex !== -1) {
        state.pawns[pawnIndex] = unequipItem(state.pawns[pawnIndex], slot as EquipmentSlot);
        state = syncAllPawnInventories(state);
      }
      equipmentLoading = false;
      return state;
    });
  }

  function useConsumableItem(pawnId: string, itemId: string) {
    gameState.update((state) => {
      const pawnIndex = state.pawns.findIndex((p) => p.id === pawnId);
      if (pawnIndex !== -1) {
        state.pawns[pawnIndex] = useConsumable(state.pawns[pawnIndex], itemId);
        const itemIndex = state.item.findIndex((item) => item.id === itemId);
        if (itemIndex !== -1 && state.item[itemIndex].amount >= 1) {
          const updatedItems = [...state.item];
          updatedItems[itemIndex] = {
            ...updatedItems[itemIndex],
            amount: updatedItems[itemIndex].amount - 1
          };
          if (updatedItems[itemIndex].amount <= 0) {
            updatedItems.splice(itemIndex, 1);
          }
          state.item = updatedItems;
          state = syncAllPawnInventories(state);
        }
      }
      return state;
    });
  }

  function canEquipPawnItem(pawn: Pawn, itemId: string): boolean {
    return canEquipItem(pawn, itemId);
  }
</script>

<div class="pawn-screen" bind:this={pawnScreenElement}>
  <div class="pawn-header">
    <button class="back-btn" on:click={() => uiState.setScreen('main')}>← Back to Map</button>
    <h2>👥 Your People</h2>
    <p class="pawn-subtitle">Individual colonists and their traits</p>

    <!-- Pawn Selection -->
    <div class="pawn-selector">
      {#each pawns as pawn}
        <button
          class="pawn-selector-btn"
          class:selected={selectedPawn?.id === pawn.id}
          on:click={() => selectPawn(pawn)}
        >
          {pawn.name}
        </button>
      {/each}
    </div>

    <!-- Quick navigation -->
    {#if selectedPawn}
      <div class="quick-nav">
        <button class="nav-btn" on:click={() => scrollToSection('overview')}>Overview</button>
        <button class="nav-btn" on:click={() => scrollToSection('stats')}>Stats</button>
        <button class="nav-btn" on:click={() => scrollToSection('needs')}>Needs</button>
        <button class="nav-btn" on:click={() => scrollToSection('traits')}>Traits</button>
        <button class="nav-btn" on:click={() => scrollToSection('abilities')}>Abilities</button>
        <button class="nav-btn" on:click={() => scrollToSection('equipment')}>Equipment</button>
      </div>
    {/if}
  </div>

  {#if selectedPawn}
    <div class="pawn-content">
      <!-- Pawn Overview -->
      <div class="pawn-overview" id="overview">
        <div class="pawn-info-card">
          <h3>👤 {selectedPawn.name}</h3>
          <div class="overview-stats">
            <div class="overview-item">
              <span class="overview-label">Height:</span>
              <span class="overview-value">{selectedPawn.physicalTraits.height}cm</span>
            </div>
            <div class="overview-item">
              <span class="overview-label">Weight:</span>
              <span class="overview-value">{selectedPawn.physicalTraits.weight}kg</span>
            </div>
            <div class="overview-item">
              <span class="overview-label">Size:</span>
              <span class="overview-value">{selectedPawn.physicalTraits.size}</span>
            </div>
            <div class="overview-item">
              <span class="overview-label">Current Work:</span>
              <span class="overview-value">{selectedPawn.currentWork || 'None'}</span>
            </div>
          </div>

          <!-- Status Overview -->
          <div class="status-overview">
            <div class="status-item">
              <span class="status-label">Mood:</span>
              <span class="status-value" style="color: {getMoodColor(selectedPawn.state.mood)}">
                {selectedPawn.state.mood}% - {getMoodDescription(selectedPawn.state.mood)}
              </span>
            </div>
            <div class="status-item">
              <span class="status-label">Health:</span>
              <span class="status-value" style="color: {getHealthColor(selectedPawn.state.health)}">
                {selectedPawn.state.health}% - {getHealthDescription(selectedPawn.state.health)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Individual Stats -->
      <div class="stats-section" id="stats">
        <h3>📊 Individual Stats</h3>
        <div class="stats-grid">
          {#each Object.entries(selectedPawn.stats) as [statName, statValue]}
            <div class="stat-card">
              <div class="stat-header">
                <span class="stat-name">{statName.charAt(0).toUpperCase() + statName.slice(1)}</span
                >
                <span class="stat-value" style="color: {getStatColor(statValue)}">{statValue}</span>
              </div>
              <div class="stat-bar">
                <div
                  class="stat-fill"
                  style="width: {(statValue / 20) * 100}%; background-color: {getStatColor(
                    statValue
                  )}"
                ></div>
              </div>
              <p class="stat-description">{getStatDescription(statName, statValue)}</p>
            </div>
          {/each}
        </div>
      </div>

      <!-- Needs and State -->
      <div class="needs-section" id="needs">
        <h3>🏥 Current Needs & State</h3>
        <div class="needs-grid">
          <div class="need-card">
            <div class="need-header">
              <span class="need-name">🍖 Hunger</span>
              <span class="need-value" style="color: {getNeedColor(selectedPawn.needs.hunger)}">
                {Math.round(selectedPawn.needs.hunger)}%
              </span>
            </div>
            <div class="need-bar">
              <div
                class="need-fill"
                style="width: {selectedPawn.needs.hunger}%; background-color: {getNeedColor(
                  selectedPawn.needs.hunger
                )}"
              ></div>
            </div>
            <p class="need-description">
              {getNeedDescription('hunger', selectedPawn.needs.hunger)}
            </p>
          </div>

          <div class="need-card">
            <div class="need-header">
              <span class="need-name">😴 Fatigue</span>
              <span class="need-value" style="color: {getNeedColor(selectedPawn.needs.fatigue)}">
                {Math.round(selectedPawn.needs.fatigue)}%
              </span>
            </div>
            <div class="need-bar">
              <div
                class="need-fill"
                style="width: {selectedPawn.needs.fatigue}%; background-color: {getNeedColor(
                  selectedPawn.needs.fatigue
                )}"
              ></div>
            </div>
            <p class="need-description">
              {getNeedDescription('fatigue', selectedPawn.needs.fatigue)}
            </p>
          </div>

          <div class="need-card">
            <div class="need-header">
              <span class="need-name">🌙 Sleep</span>
              <span class="need-value" style="color: {getNeedColor(selectedPawn.needs.sleep)}">
                {Math.round(selectedPawn.needs.sleep)}%
              </span>
            </div>
            <div class="need-bar">
              <div
                class="need-fill"
                style="width: {selectedPawn.needs.sleep}%; background-color: {getNeedColor(
                  selectedPawn.needs.sleep
                )}"
              ></div>
            </div>
            <p class="need-description">{getNeedDescription('sleep', selectedPawn.needs.sleep)}</p>
          </div>
        </div>

        <!-- Current Activities -->
        <div class="activities-section">
          <h4>Current Activities</h4>
          <div class="activities-list">
            <div class="activity-item" class:active={selectedPawn.state.isWorking}>
              <span class="activity-icon">🔨</span>
              <span class="activity-name">Working</span>
              <span class="activity-status">
                {selectedPawn.state.isWorking ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div class="activity-item" class:active={selectedPawn.state.isSleeping}>
              <span class="activity-icon">😴</span>
              <span class="activity-name">Sleeping</span>
              <span class="activity-status">
                {selectedPawn.state.isSleeping ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div class="activity-item" class:active={selectedPawn.state.isEating}>
              <span class="activity-icon">🍽️</span>
              <span class="activity-name">Eating</span>
              <span class="activity-status">
                {selectedPawn.state.isEating ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Racial Traits -->
      <div class="traits-section" id="traits">
        <h3>✨ Racial Traits ({selectedPawn.racialTraits?.length || 0})</h3>
        {#if selectedPawn.racialTraits && selectedPawn.racialTraits.length > 0}
          <div class="traits-grid">
            {#each selectedPawn.racialTraits as trait}
              <div class="trait-card">
                <div class="trait-card-header">
                  <span class="trait-icon">{trait.icon || getTraitIcon(trait.name)}</span>
                  <div class="trait-title">
                    <h4>{trait.name}</h4>
                    <div class="trait-meta">
                      <span class="trait-category">Inherited Trait</span>
                    </div>
                  </div>
                </div>

                <p class="trait-description">{trait.description}</p>

                <!-- Trait Effects -->
                <div class="trait-effects">
                  <h5>Effects on {selectedPawn.name}:</h5>
                  <div class="effects-list">
                    {#each Object.entries(trait.effects || {}) as [effectName, effectValue]}
                      <div class="effect-item">
                        {#if effectName.includes('Bonus')}
                          +{effectValue} {effectName.replace('Bonus', '').toLowerCase()}
                        {:else if effectName.includes('Penalty')}
                          {effectValue} {effectName.replace('Penalty', '').toLowerCase()}
                        {:else if effectName === 'workEfficiency'}
                          {#each Object.entries(effectValue) as [workType, multiplier]}
                            +{Math.round((multiplier - 1) * 100)}% {workType} efficiency
                          {/each}
                        {:else}
                          {effectName.replace(/([A-Z])/g, ' $1').trim()}: {formatEffectValue(
                            effectName,
                            effectValue
                          )}
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="no-traits">
            <p>This pawn has no racial traits.</p>
          </div>
        {/if}
      </div>

      <!-- Skills & Abilities - COMPLETELY REWRITTEN -->
      <div class="abilities-section" id="abilities">
        <h3>🎯 Skills & Abilities</h3>

        {#if selectedPawn}
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
                              <span class="source-label"
                                >{source.name}: {source.value.toFixed(2)}x</span
                              >
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
                          {#each result.sources as source}
                            <div class="calculation-step" class:stat={source.type === 'stat'}>
                              <span class="source-label"
                                >{source.name}: {source.value.toFixed(2)}x</span
                              >
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
                          {#each result.sources as source}
                            <div class="calculation-step" class:stat={source.type === 'stat'}>
                              <span class="source-label"
                                >{source.name}: {source.value.toFixed(2)}x</span
                              >
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
                          {#each result.sources as source}
                            <div class="calculation-step" class:stat={source.type === 'stat'}>
                              <span class="source-label"
                                >{source.name}: {source.value.toFixed(2)}x</span
                              >
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
                          {#each result.sources as source}
                            <div class="calculation-step" class:stat={source.type === 'stat'}>
                              <span class="source-label"
                                >{source.name}: {source.value.toFixed(2)}x</span
                              >
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
                          {#each result.sources as source}
                            <div class="calculation-step" class:stat={source.type === 'stat'}>
                              <span class="source-label"
                                >{source.name}: {source.value.toFixed(2)}x</span
                              >
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
        {:else}
          <div class="no-pawn-selected">
            <p>Select a pawn to view their abilities and skills.</p>
          </div>
        {/if}
      </div>

      <!-- Equipment and Inventory -->
      <div class="equipment-section" id="equipment">
        <h3>⚔️ Equipment & Inventory</h3>
        <p class="inventory-note">
          All items from global storage are automatically available to equip
        </p>

        <!-- Currently Equipped -->
        <div class="equipped-items">
          <h4>Currently Equipped:</h4>
          <div class="equipment-slots">
            {#if selectedPawn}
              {#each ['weapon', 'armor', 'tool', 'accessory'] as slot}
                <div class="equipment-slot">
                  <div class="slot-header">
                    <span class="slot-name">{slot.charAt(0).toUpperCase() + slot.slice(1)}</span>
                    {#if selectedPawn.equipment && selectedPawn.equipment[slot as EquipmentSlot]}
                      <button
                        class="unequip-btn"
                        class:loading={equipmentLoading}
                        on:click={() => selectedPawn && unequipPawnItem(selectedPawn.id, slot)}
                        disabled={equipmentLoading}
                      >
                        {equipmentLoading ? 'Unequipping...' : 'Unequip'}
                      </button>
                    {/if}
                  </div>

                  {#if selectedPawn.equipment && selectedPawn.equipment[slot as EquipmentSlot]}
                    {@const equippedItem = selectedPawn.equipment[slot as EquipmentSlot]}
                    {#if equippedItem}
                      {@const itemInfo = itemService.getItemById(equippedItem.itemId)}
                      <div class="equipped-item">
                        <span class="item-icon">{itemInfo?.emoji || '📦'}</span>
                        <div class="item-details">
                          <span class="item-name">{itemInfo?.name}</span>
                          <div class="durability-bar">
                            <div
                              class="durability-fill"
                              style="width: {(equippedItem.durability /
                                equippedItem.maxDurability) *
                                100}%"
                            ></div>
                          </div>
                          <span class="durability-text">
                            {equippedItem.durability}/{equippedItem.maxDurability}
                          </span>
                        </div>
                      </div>
                    {:else}
                      <div class="empty-slot">Empty {slot} slot</div>
                    {/if}
                  {:else}
                    <div class="empty-slot">Empty {slot} slot</div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Available Items -->
        <div class="inventory-items">
          {#if selectedPawn}
            <h4>Available Items:</h4>
            <div class="inventory-grid">
              {#each Object.entries(selectedPawn.inventory.items || {}) as [itemId, quantity]}
                {@const itemInfo = itemService.getItemById(itemId)}
                {#if itemInfo && quantity > 0 && itemInfo.type !== 'material'}
                  <div class="inventory-item" data-type={itemInfo.type}>
                    <div class="item-header">
                      <span class="item-icon">{itemInfo.emoji}</span>
                      <span class="item-name">{itemInfo.name}</span>
                      <span class="item-quantity">x{Math.floor(quantity)}</span>
                    </div>

                    <p class="item-description">{itemInfo.description}</p>

                    <div class="item-actions">
                      {#if itemInfo.type === 'consumable'}
                        <button
                          class="use-btn"
                          on:click={() =>
                            selectedPawn && useConsumableItem(selectedPawn.id, itemId)}
                        >
                          Use
                        </button>
                      {:else if ['weapon', 'armor', 'tool'].includes(itemInfo.type)}
                        <button
                          class="equip-btn"
                          class:loading={equipmentLoading}
                          on:click={() => selectedPawn && equipPawnItem(selectedPawn.id, itemId)}
                          disabled={!selectedPawn ||
                            !canEquipPawnItem(selectedPawn, itemId) ||
                            equipmentLoading}
                        >
                          {equipmentLoading ? 'Equipping...' : 'Equip'}
                        </button>
                      {/if}
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <div class="no-pawn-selected">
      <p>Select a pawn to view their details.</p>
    </div>
  {/if}
</div>

<style>
  .pawn-screen {
    padding: 20px;
    background: #000000;
    color: #e0e0e0;
    font-family: 'Courier New', monospace;
    flex: 1;
    overflow-y: auto;
    box-sizing: border-box;
    padding-bottom: 40px;
  }

  .pawn-header {
    text-align: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #4caf50;
    position: relative;
  }

  .pawn-header h2 {
    color: #4caf50;
    margin: 0 0 10px 0;
    font-size: 2em;
    text-shadow: 0 0 10px rgba(76, 175, 80, 0.3);
  }

  .pawn-subtitle {
    color: #888;
    margin: 0 0 20px 0;
    font-style: italic;
  }

  .pawn-selector {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .pawn-selector-btn {
    padding: 8px 16px;
    background: #000000;
    border: 1px solid #4caf50;
    color: #4caf50;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1em;
    transition: all 0.2s ease;
  }

  .pawn-selector-btn:hover {
    background: #4caf50;
    color: #000;
  }

  .pawn-selector-btn.selected {
    background: #4caf50;
    color: #000;
    font-weight: bold;
  }

  .quick-nav {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-top: 15px;
    flex-wrap: wrap;
  }

  .nav-btn {
    padding: 6px 12px;
    background: #000000;
    border: 1px solid #4caf50;
    color: #4caf50;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    transition: all 0.2s ease;
  }

  .nav-btn:hover {
    background: #4caf50;
    color: #000;
  }

  .back-btn {
    position: absolute;
    top: 0;
    right: 0;
    padding: 8px 16px;
    background: #000000;
    border: 1px solid #4caf50;
    color: #4caf50;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .back-btn:hover {
    background: #4caf50;
    color: #000;
  }

  .pawn-content {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .pawn-overview {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #4caf50;
  }

  .pawn-info-card h3 {
    color: #4caf50;
    margin: 0 0 15px 0;
    font-size: 1.5em;
  }

  .overview-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 15px;
    margin-bottom: 20px;
  }

  .overview-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .overview-label {
    color: #888;
    font-size: 0.9em;
  }

  .overview-value {
    color: #4caf50;
    font-weight: bold;
    font-size: 1.1em;
    text-transform: capitalize;
  }

  .status-overview {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 15px;
  }

  .status-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .status-label {
    color: #888;
    font-size: 0.9em;
  }

  .status-value {
    font-weight: bold;
    font-size: 1.1em;
  }

  .stats-section {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 25px;
    margin-bottom: 30px;
    border-left: 4px solid #2196f3;
  }

  .stats-section h3 {
    color: #2196f3;
    margin: 0 0 25px 0;
    font-size: 1.4em;
    text-shadow: 0 0 10px rgba(33, 150, 243, 0.3);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 15px;
  }

  .stat-card {
    background: #000000;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 20px;
    transition: all 0.3s ease;
  }

  .stat-card:hover {
    border-color: #2196f3;
    box-shadow: 0 0 15px rgba(33, 150, 243, 0.2);
  }

  .stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .stat-name {
    color: #2196f3;
    font-weight: bold;
    font-size: 1.1em;
  }

  .stat-value {
    font-family: monospace;
    font-weight: bold;
    font-size: 1.2em;
  }

  .stat-bar {
    height: 8px;
    background: #333;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
  }

  .stat-fill {
    height: 100%;
    transition: width 0.5s ease;
    border-radius: 4px;
  }

  .stat-description {
    color: #ccc;
    font-size: 0.9em;
    margin: 0;
    line-height: 1.4;
  }

  .needs-section {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 25px;
    margin-bottom: 30px;
    border-left: 4px solid #ff5722;
  }

  .needs-section h3 {
    color: #ff5722;
    margin: 0 0 25px 0;
    font-size: 1.4em;
    text-shadow: 0 0 10px rgba(255, 87, 34, 0.3);
  }

  .needs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .need-card {
    background: #000000;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 20px;
    transition: all 0.3s ease;
  }

  .need-card:hover {
    border-color: #ff5722;
    box-shadow: 0 0 15px rgba(255, 87, 34, 0.2);
  }

  .need-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .need-name {
    color: #ff5722;
    font-weight: bold;
    font-size: 1.1em;
  }

  .need-value {
    font-family: monospace;
    font-weight: bold;
    font-size: 1.1em;
  }

  .need-bar {
    height: 8px;
    background: #333;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
  }

  .need-fill {
    height: 100%;
    transition: width 0.5s ease;
    border-radius: 4px;
  }

  .need-description {
    color: #ccc;
    font-size: 0.9em;
    margin: 0;
  }

  .activities-section h4 {
    color: #ff5722;
    margin: 0 0 15px 0;
    font-size: 1.1em;
  }

  .activities-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .activity-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 15px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 6px;
    border-left: 3px solid #333;
    transition: all 0.3s ease;
  }

  .activity-item.active {
    border-left-color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
  }

  .activity-icon {
    font-size: 1.2em;
  }

  .activity-name {
    color: #e0e0e0;
    font-weight: bold;
    flex: 1;
  }

  .activity-status {
    color: #888;
    font-size: 0.9em;
  }

  .activity-item.active .activity-status {
    color: #4caf50;
  }

  .traits-section {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 25px;
    margin-bottom: 30px;
    border-left: 4px solid #9c27b0;
  }

  .traits-section h3 {
    color: #9c27b0;
    margin: 0 0 25px 0;
    font-size: 1.4em;
    text-shadow: 0 0 10px rgba(156, 39, 176, 0.3);
  }

  .traits-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
    gap: 20px;
  }

  .trait-card {
    background: #000000;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 20px;
    transition: all 0.3s ease;
  }

  .trait-card:hover {
    border-color: #9c27b0;
    box-shadow: 0 0 15px rgba(156, 39, 176, 0.2);
  }

  .trait-card-header {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 15px;
  }

  .trait-icon {
    font-size: 2em;
    flex-shrink: 0;
  }

  .trait-title h4 {
    color: #9c27b0;
    margin: 0 0 5px 0;
    font-size: 1.2em;
  }

  .trait-meta {
    display: flex;
    gap: 10px;
  }

  .trait-category {
    background: rgba(156, 39, 176, 0.2);
    color: #9c27b0;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75em;
    font-weight: bold;
  }

  .trait-description {
    color: #ccc;
    margin: 0 0 20px 0;
    line-height: 1.5;
  }

  .trait-effects h5 {
    color: #9c27b0;
    margin: 0 0 10px 0;
    font-size: 1em;
  }

  .effects-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .effect-item {
    background: rgba(156, 39, 176, 0.1);
    padding: 8px 12px;
    border-radius: 4px;
    color: #e0e0e0;
    font-size: 0.9em;
    border-left: 3px solid #9c27b0;
  }

  .no-traits {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 40px;
    text-align: center;
    color: #888;
    border: 2px dashed #333;
  }

  /* Abilities Section */
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

  .abilities-container {
    display: flex;
    flex-direction: column;
    gap: 30px;
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
    background: rgba(76, 175, 80, 0.1);
    border: 1px solid rgba(76, 175, 80, 0.3);
    color: #a5d6a7;
    border-left-color: #ff9800;
    background: rgba(255, 152, 0, 0.1);
  }

  .calculation-step.stat {
    border-left-color: #2196f3;
    background: rgba(33, 150, 243, 0.1);
  }

  .calculation-step.trait {
    background: rgba(156, 39, 176, 0.1);
    border: 1px solid rgba(156, 39, 176, 0.3);
    color: #e1bee7;
    border-left-color: #9c27b0;
    background: rgba(156, 39, 176, 0.1);
  }

  .calculation-step.equipment {
    background: rgba(255, 152, 0, 0.1);
    border: 1px solid rgba(255, 152, 0, 0.3);
    color: #ffcc80;
    border-left-color: #ff9800;
    background: rgba(255, 152, 0, 0.1);
  }

  .calculation-step.building {
    border-left-color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
  }

  .calculation-step.experience {
    background: rgba(255, 193, 7, 0.1);
    border: 1px solid rgba(255, 193, 7, 0.3);
    color: #ffecb3;
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

  .formula-text {
    font-weight: bold;
    color: #4caf50;
  }

  .ability-summary {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .modifier-count {
    color: #888;
    font-size: 0.75em;
    text-align: center;
    font-style: italic;
  }

  .no-abilities {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 40px;
    text-align: center;
    color: #888;
    border: 2px dashed #333;
  }

  .debug-info {
    color: #ff9800;
    font-size: 0.9em;
    margin-top: 10px;
  }

  /* Equipment Section */
  .equipment-section {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 25px;
    border-left: 4px solid #607d8b;
    margin-bottom: 30px;
  }

  .equipment-section h3 {
    color: #607d8b;
    margin: 0 0 15px 0;
    font-size: 1.4em;
    text-shadow: 0 0 10px rgba(96, 125, 139, 0.3);
  }

  .inventory-note {
    color: #888;
    margin: 0 0 25px 0;
    font-style: italic;
    text-align: center;
  }

  .equipped-items h4 {
    color: #607d8b;
    margin: 0 0 20px 0;
    font-size: 1.1em;
  }

  .equipment-slots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .equipment-slot {
    background: #000000;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 15px;
  }

  .slot-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .slot-name {
    color: #607d8b;
    font-weight: bold;
  }

  .unequip-btn {
    background: #ff5722;
    border: 1px solid #ff5722;
    color: white;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.8em;
  }

  .unequip-btn:hover {
    background: #d84315;
  }

  .unequip-btn.loading {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .equipped-item {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .item-icon {
    font-size: 1.5em;
  }

  .item-details {
    flex: 1;
  }

  .item-name {
    color: #e0e0e0;
    font-weight: bold;
    display: block;
    margin-bottom: 5px;
  }

  .durability-bar {
    height: 6px;
    background: #333;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 3px;
  }

  .durability-fill {
    height: 100%;
    background: #4caf50;
    transition: width 0.3s ease;
  }

  .durability-text {
    color: #888;
    font-size: 0.8em;
  }

  .empty-slot {
    color: #666;
    font-style: italic;
    text-align: center;
    padding: 20px;
  }

  .inventory-items h4 {
    color: #607d8b;
    margin: 0 0 20px 0;
    font-size: 1.1em;
  }

  .inventory-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 15px;
  }

  .inventory-item {
    background: #000000;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 15px;
    transition: all 0.3s ease;
  }

  .inventory-item:hover {
    border-color: #607d8b;
  }

  .inventory-item[data-type='weapon'] {
    border-left: 3px solid #f44336;
  }

  .inventory-item[data-type='armor'] {
    border-left: 3px solid #2196f3;
  }

  .inventory-item[data-type='tool'] {
    border-left: 3px solid #ff9800;
  }

  .inventory-item[data-type='consumable'] {
    border-left: 3px solid #4caf50;
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .item-quantity {
    color: #888;
    font-weight: bold;
    margin-left: auto;
  }

  .item-description {
    color: #ccc;
    font-size: 0.9em;
    margin: 0 0 15px 0;
    line-height: 1.4;
  }

  .item-actions {
    display: flex;
    gap: 8px;
  }

  .use-btn,
  .equip-btn {
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    border: 1px solid;
    transition: all 0.3s ease;
  }

  .use-btn {
    background: #4caf50;
    border-color: #4caf50;
    color: white;
  }

  .use-btn:hover {
    background: #388e3c;
  }

  .equip-btn {
    background: #2196f3;
    border-color: #2196f3;
    color: white;
  }

  .equip-btn:hover {
    background: #1976d2;
  }

  .equip-btn:disabled {
    background: #666;
    border-color: #666;
    cursor: not-allowed;
    opacity: 0.6;
  }

  .equip-btn.loading {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .no-pawn-selected {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 60px;
    text-align: center;
    color: #888;
    border: 2px dashed #333;
    margin-top: 50px;
    font-style: italic;
  }

  /* Scrollbar styling */
  .pawn-screen::-webkit-scrollbar {
    width: 8px;
  }

  .pawn-screen::-webkit-scrollbar-track {
    background: #000000;
  }

  .pawn-screen::-webkit-scrollbar-thumb {
    background: #4caf50;
    border-radius: 4px;
  }

  /* Enhanced hover effects */
  @media (max-width: 768px) {
    .pawn-screen {
      padding: 15px;
    }

    .quick-nav {
      flex-direction: column;
      gap: 5px;
    }

    .nav-btn {
      text-align: center;
    }

    .stats-grid,
    .needs-grid,
    .traits-grid,
    .abilities-grid,
    .equipment-slots,
    .inventory-grid {
      grid-template-columns: 1fr;
    }

    .overview-stats,
    .status-overview {
      grid-template-columns: 1fr;
    }

    .ability-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .pawn-selector {
      flex-direction: column;
    }

    .back-btn {
      position: static;
      margin-bottom: 15px;
    }

    .abilities-grid {
      grid-template-columns: 1fr;
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
