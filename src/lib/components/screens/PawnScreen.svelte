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
  import { getItemInfo } from '$lib/game/core/Items';
  import {
    calculatePawnAbilities,
    categorizeAbilities,
    getAbilityDescription
  } from '$lib/game/entities/Pawns';

  let pawns: Pawn[] = [];
  let selectedPawn: Pawn | null = null;
  let selectedPawnId: string | null = null; // Track by ID instead
  let pawnScreenElement: HTMLElement;
  let equipmentLoading = false;

  const unsubscribe = gameState.subscribe((state) => {
    pawns = state.pawns || [];

    // Update selectedPawn to the latest version from state
    if (selectedPawnId && pawns.length > 0) {
      const updatedPawn = pawns.find((p) => p.id === selectedPawnId);
      if (updatedPawn) {
        selectedPawn = updatedPawn;
      }
    } else if (!selectedPawn && pawns.length > 0) {
      // Auto-select first pawn if none selected
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
    selectedPawnId = pawn.id; // Store the ID for tracking
  }

  function getStatColor(statValue: number): string {
    if (statValue >= 18) return '#4CAF50'; // Green for exceptional
    if (statValue >= 15) return '#8BC34A'; // Light green for high
    if (statValue >= 12) return '#FFA726'; // Orange for good
    if (statValue >= 9) return '#FF9800'; // Darker orange for average
    return '#9E9E9E'; // Gray for low
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
    if (mood >= 80) return '#4CAF50'; // Green for happy
    if (mood >= 60) return '#8BC34A'; // Light green for content
    if (mood >= 40) return '#FFA726'; // Orange for neutral
    if (mood >= 20) return '#FF5722'; // Red for sad
    return '#D32F2F'; // Dark red for depressed
  }

  function getMoodDescription(mood: number): string {
    if (mood >= 80) return 'Ecstatic and joyful';
    if (mood >= 60) return 'Content and happy';
    if (mood >= 40) return 'Neutral mood';
    if (mood >= 20) return 'Somewhat sad';
    return 'Deeply depressed';
  }

  function getHealthColor(health: number): string {
    if (health >= 90) return '#4CAF50'; // Green for healthy
    if (health >= 70) return '#8BC34A'; // Light green for good
    if (health >= 50) return '#FFA726'; // Orange for injured
    if (health >= 25) return '#FF5722'; // Red for badly hurt
    return '#D32F2F'; // Dark red for critical
  }

  function getHealthDescription(health: number): string {
    if (health >= 90) return 'Perfect health';
    if (health >= 70) return 'Good condition';
    if (health >= 50) return 'Some injuries';
    if (health >= 25) return 'Badly wounded';
    return 'Critical condition';
  }

  function getNeedColor(needValue: number): string {
    if (needValue <= 20) return '#4CAF50'; // Green for satisfied
    if (needValue <= 40) return '#8BC34A'; // Light green for content
    if (needValue <= 60) return '#FFA726'; // Orange for moderate
    if (needValue <= 80) return '#FF5722'; // Red for high need
    return '#D32F2F'; // Dark red for critical
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
        // Apply effects to pawn
        state.pawns[pawnIndex] = useConsumable(state.pawns[pawnIndex], itemId);

        // Consume item from global storage
        const itemIndex = state.item.findIndex((item) => item.id === itemId);
        if (itemIndex !== -1 && state.item[itemIndex].amount >= 1) {
          const updatedItems = [...state.item];
          updatedItems[itemIndex] = {
            ...updatedItems[itemIndex],
            amount: updatedItems[itemIndex].amount - 1
          };

          // Remove item if amount becomes 0
          if (updatedItems[itemIndex].amount <= 0) {
            updatedItems.splice(itemIndex, 1);
          }

          state.item = updatedItems;

          // IMMEDIATELY sync all pawn inventories after consuming
          state = syncAllPawnInventories(state);
        }
      }
      return state;
    });
  }

  function canEquipPawnItem(pawn: Pawn, itemId: string): boolean {
    return canEquipItem(pawn, itemId);
  }

  // Add these functions to transfer items between global storage and pawn inventory:

  export function transferItemToPawn(
    gameState: GameState,
    pawnId: string,
    itemId: string,
    quantity: number = 1
  ): GameState {
    // Check if global storage has enough of the item
    const globalItem = gameState.item.find((item) => item.id === itemId);
    if (!globalItem || globalItem.amount < quantity) {
      return gameState; // Not enough items in global storage
    }

    // Find the pawn
    const pawnIndex = gameState.pawns.findIndex((p) => p.id === pawnId);
    if (pawnIndex === -1) {
      return gameState; // Pawn not found
    }

    const updatedState = { ...gameState };

    // Remove from global storage
    const globalItemIndex = updatedState.item.findIndex((item) => item.id === itemId);
    updatedState.item = [...updatedState.item];
    updatedState.item[globalItemIndex] = {
      ...updatedState.item[globalItemIndex],
      amount: updatedState.item[globalItemIndex].amount - quantity
    };

    // Add to pawn inventory
    updatedState.pawns = [...updatedState.pawns];
    const pawn = { ...updatedState.pawns[pawnIndex] };
    pawn.inventory = {
      ...pawn.inventory,
      items: {
        ...pawn.inventory.items,
        [itemId]: (pawn.inventory.items[itemId] || 0) + quantity
      }
    };
    updatedState.pawns[pawnIndex] = pawn;

    return updatedState;
  }

  export function transferItemFromPawn(
    gameState: GameState,
    pawnId: string,
    itemId: string,
    quantity: number = 1
  ): GameState {
    // Find the pawn
    const pawnIndex = gameState.pawns.findIndex((p) => p.id === pawnId);
    if (pawnIndex === -1) {
      return gameState; // Pawn not found
    }

    const pawn = gameState.pawns[pawnIndex];
    const pawnItemAmount = pawn.inventory.items[itemId] || 0;

    if (pawnItemAmount < quantity) {
      return gameState; // Pawn doesn't have enough items
    }

    const updatedState = { ...gameState };

    // Remove from pawn inventory
    updatedState.pawns = [...updatedState.pawns];
    const updatedPawn = { ...updatedState.pawns[pawnIndex] };
    updatedPawn.inventory = {
      ...updatedPawn.inventory,
      items: { ...updatedPawn.inventory.items }
    };

    if (pawnItemAmount === quantity) {
      delete updatedPawn.inventory.items[itemId];
    } else {
      updatedPawn.inventory.items[itemId] = pawnItemAmount - quantity;
    }
    updatedState.pawns[pawnIndex] = updatedPawn;

    // Add to global storage
    updatedState.item = [...updatedState.item];
    const globalItemIndex = updatedState.item.findIndex((item) => item.id === itemId);

    if (globalItemIndex !== -1) {
      updatedState.item[globalItemIndex] = {
        ...updatedState.item[globalItemIndex],
        amount: updatedState.item[globalItemIndex].amount + quantity
      };
    } else {
      const itemInfo = getItemInfo(itemId);
      if (itemInfo) {
        updatedState.item.push({ ...itemInfo, amount: quantity });
      }
    }

    return updatedState;
  }

  // Helper function to get all equipped items
  function getAllEquippedItems(pawns: Pawn[]): Set<string> {
    const equippedItems = new Set<string>();

    pawns.forEach((pawn) => {
      Object.values(pawn.equipment).forEach((equipped) => {
        if (equipped) {
          equippedItems.add(equipped.itemId);
        }
      });
    });

    return equippedItems;
  }

  function formatAbilityName(abilityName: string): string {
    // Convert camelCase to readable format
    return abilityName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace('Efficiency', '')
      .replace('Bonus', ' Bonus')
      .replace('Rate', ' Rate')
      .trim();
  }

  function formatAbilityValue(abilityName: string, value: number): string {
    // Format different types of values appropriately
    if (
      abilityName.includes('Efficiency') ||
      abilityName.includes('Speed') ||
      abilityName.includes('Resistance')
    ) {
      // FIXED: Don't show negative percentages for base values of 0
      if (value === 0) {
        return '0%';
      } else if (value > 1) {
        return `+${Math.round((value - 1) * 100)}%`;
      } else if (value < 1) {
        return `-${Math.round((1 - value) * 100)}%`;
      }
      return '100%';
    } else if (abilityName.includes('Rate') || abilityName.includes('Influence')) {
      if (value === 0) {
        return '0%';
      }
      return `${(value * 100).toFixed(0)}%`;
    } else if (abilityName.includes('Capacity') || abilityName.includes('Range')) {
      return `${Math.round(value)}`;
    } else {
      return value % 1 === 0 ? value.toString() : value.toFixed(1);
    }
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
        <button class="nav-btn" on:click={() => scrollToSection('skills')}>Skills</button>
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

      <!-- Skills & Abilities -->
      <div class="skills-section" id="skills">
        <h3>🎯 Skills & Abilities</h3>

        {#if selectedPawn}
          {@const allAbilities = calculatePawnAbilities(selectedPawn)}
          {@const categorizedAbilities = categorizeAbilities(allAbilities)}

          {#if Object.keys(categorizedAbilities).length > 0}
            <div class="abilities-container">
              {#each Object.entries(categorizedAbilities) as [categoryName, abilityNames]}
                <div class="ability-category">
                  <h4 class="category-title">
                    {#if categoryName === 'Combat'}
                      ⚔️ {categoryName} ({abilityNames.length})
                    {:else if categoryName === 'Work Skills'}
                      🔨 {categoryName} ({abilityNames.length})
                    {:else if categoryName === 'Survival'}
                      🛡️ {categoryName} ({abilityNames.length})
                    {:else if categoryName === 'Physical'}
                      💪 {categoryName} ({abilityNames.length})
                    {:else if categoryName === 'Mental'}
                      🧠 {categoryName} ({abilityNames.length})
                    {:else if categoryName === 'Special'}
                      ✨ {categoryName} ({abilityNames.length})
                    {:else}
                      📊 {categoryName} ({abilityNames.length})
                    {/if}
                  </h4>

                  <div class="abilities-grid">
                    {#each abilityNames as abilityName}
                      {@const abilityData = allAbilities[abilityName]}
                      <div
                        class="ability-card"
                        data-category={categoryName.toLowerCase().replace(' ', '-')}
                      >
                        <div class="ability-header">
                          <span class="ability-name">{formatAbilityName(abilityName)}</span>
                          <span
                            class="ability-value"
                            class:positive={abilityData.value > 0}
                            class:negative={abilityData.value < 0}
                            class:neutral={abilityData.value === 0}
                          >
                            {formatAbilityValue(abilityName, abilityData.value)}
                          </span>
                        </div>

                        <p class="ability-description">
                          {getAbilityDescription(abilityName, abilityData)}
                        </p>

                        <!-- Detailed calculation breakdown -->
                        <div class="ability-calculation">
                          <div class="calculation-header">Calculation:</div>
                          {#each abilityData.sources as source, index}
                            <div
                              class="calculation-step"
                              class:trait={source.includes('Trait')}
                              class:equipment={source.includes('Equipment')}
                              class:base={source.includes('Base')}
                              class:experience={source.includes('Experience')}
                              class:formula={!source.includes('Trait') &&
                                !source.includes('Equipment') &&
                                !source.includes('Base') &&
                                !source.includes('Experience')}
                            >
                              {#if source.includes('Trait') || source.includes('Equipment') || source.includes('Base') || source.includes('Experience')}
                                <span class="source-label">{source}</span>
                              {:else}
                                <span class="formula-text">{source}</span>
                              {/if}
                            </div>
                          {/each}
                        </div>

                        <!-- Quick summary of modifiers -->
                        <div class="ability-summary">
                          {#if abilityData.sources.length > 1}
                            <div class="modifier-count">
                              {abilityData.sources.length} modifiers affecting this ability
                            </div>
                          {:else}
                            <div class="modifier-count">Single source ability</div>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="no-abilities">
              <p>No calculated abilities found for this pawn.</p>
              <p class="debug-info">
                This might indicate an issue with the ability calculation system.
              </p>
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
                      {@const itemInfo = getItemInfo(equippedItem.itemId)}
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

        <!-- Available Items (Shared from Global) -->
        <div class="inventory-items">
          {#if selectedPawn}
            <h4>Available Items:</h4>
            <div class="inventory-grid">
              {#each Object.entries(selectedPawn.inventory.items || {}) as [itemId, quantity]}
                {@const itemInfo = getItemInfo(itemId)}
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
  {/if}
</div>

<style>
  .ability-value.neutral {
    color: #999;
    background: rgba(153, 153, 153, 0.1);
  }

  .calculation-step.experience {
    background: rgba(255, 193, 7, 0.1);
    border: 1px solid rgba(255, 193, 7, 0.3);
    color: #ffecb3;
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

  .no-pawn-selected {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 40px;
    text-align: center;
    color: #888;
    font-style: italic;
    border: 2px dashed #333;
  }

  /* Category icons in titles */
  .category-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #4caf50;
    margin: 0 0 15px 0;
    font-size: 1.1em;
    font-weight: bold;
  }

  /* Enhanced hover effects */
  .ability-card:hover .ability-name {
    color: #4caf50;
    transition: color 0.2s ease;
  }

  .ability-card:hover .calculation-header {
    color: #4caf50;
    transition: color 0.2s ease;
  }

  /* Responsive enhancements */
  @media (max-width: 768px) {
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
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
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

  .stats-section h3 {
    color: #4caf50;
    margin: 0 0 20px 0;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 15px;
  }

  .stat-card {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 15px;
    border-left: 4px solid #555;
  }

  .stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .stat-name {
    font-weight: bold;
    color: #e0e0e0;
  }

  .stat-value {
    font-weight: bold;
    font-size: 1.2em;
  }

  .stat-bar {
    height: 6px;
    background: #555;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 10px;
  }

  .stat-fill {
    height: 100%;
    transition: width 0.5s ease;
    border-radius: 3px;
  }

  .stat-description {
    color: #888;
    font-size: 0.85em;
    margin: 0;
    font-style: italic;
  }

  .needs-section h3 {
    color: #4caf50;
    margin: 0 0 20px 0;
  }

  .needs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin-bottom: 25px;
  }

  .need-card {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 15px;
    border-left: 4px solid #ff9800;
  }

  .need-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .need-name {
    font-weight: bold;
    color: #e0e0e0;
  }

  .need-value {
    font-weight: bold;
    font-size: 1.1em;
  }

  .need-bar {
    height: 6px;
    background: #555;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 10px;
  }

  .need-fill {
    height: 100%;
    transition: width 0.5s ease;
    border-radius: 3px;
  }

  .need-description {
    color: #888;
    font-size: 0.85em;
    margin: 0;
    font-style: italic;
  }

  .activities-section h4 {
    color: #ff9800;
    margin: 0 0 15px 0;
  }

  .activities-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
  }

  .activity-item {
    background: #0a0a0a;
    border-radius: 6px;
    padding: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #333;
    transition: all 0.2s ease;
  }

  .activity-item.active {
    border-color: #ff9800;
    background: rgba(255, 152, 0, 0.1);
  }

  .activity-icon {
    font-size: 1.2em;
  }

  .activity-name {
    flex: 1;
    color: #e0e0e0;
  }

  .activity-status {
    font-size: 0.8em;
    color: #888;
  }

  .activity-item.active .activity-status {
    color: #ff9800;
    font-weight: bold;
  }

  .traits-section h3 {
    color: #4caf50;
    margin: 0 0 20px 0;
  }

  .traits-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 20px;
  }

  .trait-card {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #9c27b0;
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .trait-card-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .trait-icon {
    font-size: 1.8em;
    color: #9c27b0;
    flex-shrink: 0;
  }

  .trait-title {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .trait-card h4 {
    color: #9c27b0;
    margin: 0;
    font-size: 1.2em;
    font-weight: bold;
  }

  .trait-meta {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .trait-category {
    background: rgba(156, 39, 176, 0.2);
    color: #9c27b0;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.8em;
    font-weight: bold;
  }

  .trait-description {
    color: #ccc;
    font-style: italic;
    margin: 0;
    line-height: 1.4;
  }

  .trait-effects h5 {
    color: #e0e0e0;
    margin: 0 0 8px 0;
    font-size: 1em;
    font-weight: bold;
  }

  .effects-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .effect-item {
    color: #9c27b0;
    font-size: 0.9em;
    font-family: monospace;
    padding: 6px 10px;
    background: #000000;
    border-radius: 4px;
    border: 1px solid rgba(156, 39, 176, 0.3);
  }

  .effect-item:before {
    content: '•';
    color: #9c27b0;
    font-weight: bold;
    margin-right: 8px;
  }

  .skills-section h3 {
    color: #4caf50;
    margin: 0 0 20px 0;
  }

  .skills-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
  }

  .skill-card {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 15px;
    border-left: 4px solid #2196f3;
  }

  .skill-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .skill-name {
    font-weight: bold;
    color: #e0e0e0;
    text-transform: capitalize;
  }

  .skill-level {
    color: #2196f3;
    font-weight: bold;
  }

  .skill-bar {
    height: 6px;
    background: #555;
    border-radius: 3px;
    overflow: hidden;
  }

  .skill-fill {
    height: 100%;
    transition: width 0.5s ease;
    border-radius: 3px;
  }

  .no-traits,
  .no-skills,
  .no-pawn {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 30px;
    text-align: center;
    color: #888;
    font-style: italic;
    border: 2px dashed #333;
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

  /* Responsive design */
  @media (max-width: 768px) {
    .pawn-screen {
      padding: 10px;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .needs-grid {
      grid-template-columns: 1fr;
    }

    .traits-grid {
      grid-template-columns: 1fr;
    }

    .quick-nav {
      flex-wrap: wrap;
      justify-content: center;
    }

    .pawn-selector {
      flex-wrap: wrap;
      justify-content: center;
    }
  }
  /* Equipment Section */
  .equipment-section {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 25px;
    border-left: 4px solid #e91e63;
    margin-top: 30px;
  }

  .equipment-section h3 {
    color: #e91e63;
    margin: 0 0 25px 0;
    font-size: 1.4em;
    text-shadow: 0 0 10px rgba(233, 30, 99, 0.3);
  }

  .equipped-items h4,
  .inventory-items h4 {
    color: #ff6b9d;
    margin: 0 0 20px 0;
    font-size: 1.1em;
    border-bottom: 1px solid rgba(233, 30, 99, 0.3);
    padding-bottom: 8px;
  }

  /* Equipment Slots */
  .equipment-slots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
    margin-bottom: 35px;
  }

  .equipment-slot {
    background: #000000;
    border: 2px solid #333;
    border-radius: 8px;
    padding: 15px;
    transition: all 0.3s ease;
    position: relative;
  }

  .equipment-slot:hover {
    border-color: #e91e63;
    box-shadow: 0 0 15px rgba(233, 30, 99, 0.2);
  }

  .slot-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .slot-name {
    color: #ff6b9d;
    font-weight: bold;
    font-size: 1em;
    text-transform: capitalize;
  }

  .unequip-btn {
    background: rgba(233, 30, 99, 0.2);
    border: 1px solid #e91e63;
    color: #e91e63;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.8em;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .unequip-btn:hover {
    background: #e91e63;
    color: #000;
  }

  /* Equipped Items */
  .equipped-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    background: #111;
    border-radius: 6px;
    border: 1px solid #444;
  }

  .equipped-item .item-icon {
    font-size: 1.8em;
    flex-shrink: 0;
  }

  .item-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .equipped-item .item-name {
    color: #e91e63;
    font-weight: bold;
    font-size: 1em;
  }

  .durability-bar {
    width: 100%;
    height: 4px;
    background: #333;
    border-radius: 2px;
    overflow: hidden;
  }

  .durability-fill {
    height: 100%;
    background: linear-gradient(90deg, #f44336 0%, #ff9800 50%, #4caf50 100%);
    transition: width 0.3s ease;
    border-radius: 2px;
  }

  .durability-text {
    color: #999;
    font-size: 0.8em;
    font-family: monospace;
  }

  .empty-slot {
    color: #666;
    font-style: italic;
    text-align: center;
    padding: 20px;
    border: 2px dashed #333;
    border-radius: 6px;
    background: #0a0a0a;
  }

  /* Inventory Grid */
  .inventory-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
  }

  .inventory-item {
    background: #000000;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 15px;
    transition: all 0.3s ease;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .inventory-item:hover {
    border-color: #e91e63;
    box-shadow: 0 0 15px rgba(233, 30, 99, 0.15);
    transform: translateY(-2px);
  }

  .inventory-item .item-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .inventory-item .item-icon {
    font-size: 1.5em;
    flex-shrink: 0;
  }

  .inventory-item .item-name {
    color: #e91e63;
    font-weight: bold;
    flex: 1;
  }

  .item-quantity {
    background: rgba(233, 30, 99, 0.2);
    color: #e91e63;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.8em;
    font-weight: bold;
  }

  .item-description {
    color: #ccc;
    font-size: 0.9em;
    line-height: 1.4;
    margin: 0;
    font-style: italic;
  }

  /* Item Actions */
  .item-actions {
    display: flex;
    gap: 8px;
    margin-top: auto;
  }

  .use-btn,
  .equip-btn {
    flex: 1;
    padding: 8px 12px;
    border-radius: 4px;
    border: none;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .use-btn {
    background: rgba(76, 175, 80, 0.2);
    color: #4caf50;
    border: 1px solid #4caf50;
  }

  .use-btn:hover {
    background: #4caf50;
    color: #000;
  }

  .equip-btn {
    background: rgba(233, 30, 99, 0.2);
    color: #e91e63;
    border: 1px solid #e91e63;
  }

  .equip-btn:hover:not(:disabled) {
    background: #e91e63;
    color: #000;
  }

  .equip-btn:disabled {
    background: #222;
    color: #666;
    border-color: #333;
    cursor: not-allowed;
  }

  /* Equipment Status Indicators */
  .equipment-slot.has-item {
    border-color: #e91e63;
  }

  .equipment-slot.empty {
    border-color: #333;
    border-style: dashed;
  }

  /* Item Type Badges */
  .inventory-item[data-type='weapon'] {
    border-left: 4px solid #f44336;
  }

  .inventory-item[data-type='armor'] {
    border-left: 4px solid #2196f3;
  }

  .inventory-item[data-type='tool'] {
    border-left: 4px solid #ff9800;
  }

  .inventory-item[data-type='consumable'] {
    border-left: 4px solid #4caf50;
  }

  /* Responsive Design for Equipment */
  @media (max-width: 768px) {
    .equipment-slots {
      grid-template-columns: 1fr;
    }

    .inventory-grid {
      grid-template-columns: 1fr;
    }
    .inventory-note {
      background: rgba(76, 175, 80, 0.1);
      border: 1px solid #4caf50;
      padding: 10px;
      border-radius: 4px;
      color: #4caf50;
      font-style: italic;
      margin-bottom: 20px;
      text-align: center;
    }
    .equipment-section {
      padding: 15px;
    }

    .item-actions {
      flex-direction: column;
    }

    .equipped-item {
      flex-direction: column;
      text-align: center;
    }
  }

  /* Animation for equipped items */
  @keyframes equip-glow {
    0% {
      box-shadow: 0 0 5px rgba(233, 30, 99, 0.5);
    }
    50% {
      box-shadow: 0 0 20px rgba(233, 30, 99, 0.8);
    }
    100% {
      box-shadow: 0 0 5px rgba(233, 30, 99, 0.5);
    }
  }

  .equipped-item {
    animation: equip-glow 2s ease-in-out infinite;
  }

  /* Loading state for equipment actions */
  .equip-btn.loading,
  .use-btn.loading {
    opacity: 0.6;
    cursor: wait;
  }

  .equip-btn.loading::after,
  .use-btn.loading::after {
    content: '...';
    animation: loading-dots 1s infinite;
  }

  @keyframes loading-dots {
    0%,
    20% {
      opacity: 0;
    }
    50% {
      opacity: 1;
    }
    80%,
    100% {
      opacity: 0;
    }
  }

  .abilities-container {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .ability-category {
    background: #0a0a0a;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #4caf50;
  }

  .category-title {
    color: #4caf50;
    margin: 0 0 15px 0;
    font-size: 1.1em;
    font-weight: bold;
  }

  .abilities-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 15px;
  }

  .ability-card {
    background: #111;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 15px;
    transition: all 0.3s ease;
  }

  .ability-card:hover {
    border-color: #4caf50;
    box-shadow: 0 0 10px rgba(76, 175, 80, 0.2);
  }
  /* Add to PawnScreen.svelte styles */

  .ability-calculation {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .calculation-header {
    color: #888;
    font-size: 0.8em;
    margin-bottom: 6px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .calculation-step {
    margin: 3px 0;
    padding: 4px 8px;
    border-radius: 3px;
    font-size: 0.8em;
    font-family: monospace;
    line-height: 1.3;
  }

  .calculation-step.formula {
    background: rgba(76, 175, 80, 0.1);
    border: 1px solid rgba(76, 175, 80, 0.3);
    color: #a5d6a7;
  }

  .calculation-step.trait {
    background: rgba(156, 39, 176, 0.1);
    border: 1px solid rgba(156, 39, 176, 0.3);
    color: #e1bee7;
  }

  .calculation-step.equipment {
    background: rgba(255, 152, 0, 0.1);
    border: 1px solid rgba(255, 152, 0, 0.3);
    color: #ffcc80;
  }

  .calculation-step.base {
    background: rgba(33, 150, 243, 0.1);
    border: 1px solid rgba(33, 150, 243, 0.3);
    color: #bbdefb;
  }

  .source-label {
    font-style: italic;
  }

  .formula-text {
    font-weight: bold;
    color: #4caf50;
  }

  /* Update ability sources to be less prominent since we have detailed calculations */
  .ability-sources {
    display: none; /* Hide the old sources display */
  }
  /* Category-specific colors */
  .ability-card[data-category='core-stats'] {
    border-left: 3px solid #2196f3;
  }
  .ability-card[data-category='combat'] {
    border-left: 3px solid #f44336;
  }
  .ability-card[data-category='work-skills'] {
    border-left: 3px solid #ff9800;
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
    margin-bottom: 8px;
  }

  .ability-name {
    color: #fff;
    font-weight: bold;
    font-size: 1em;
  }

  .ability-value {
    color: #ccc;
    font-family: monospace;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 4px;
    background: #222;
  }

  .ability-value.positive {
    color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
  }

  .ability-value.negative {
    color: #f44336;
    background: rgba(244, 67, 54, 0.1);
  }

  .ability-description {
    color: #bbb;
    font-size: 0.85em;
    margin: 8px 0;
    line-height: 1.4;
    font-style: italic;
  }

  .ability-sources {
    margin-top: 10px;
  }

  .sources-header {
    color: #888;
    font-size: 0.8em;
    margin-bottom: 4px;
    font-weight: bold;
  }

  .ability-source {
    display: inline-block;
    background: #222;
    color: #ccc;
    padding: 2px 6px;
    border-radius: 3px;
    margin: 2px 4px 2px 0;
    font-size: 0.75em;
    border: 1px solid #333;
  }

  .ability-source.trait {
    background: rgba(156, 39, 176, 0.2);
    border-color: #9c27b0;
    color: #e1bee7;
  }

  .ability-source.equipment {
    background: rgba(255, 152, 0, 0.2);
    border-color: #ff9800;
    color: #ffcc80;
  }

  .ability-source.base {
    background: rgba(33, 150, 243, 0.2);
    border-color: #2196f3;
    color: #bbdefb;
  }

  .ability-source.calculated {
    background: rgba(76, 175, 80, 0.2);
    border-color: #4caf50;
    color: #c8e6c9;
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .abilities-grid {
      grid-template-columns: 1fr;
    }

    .ability-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
    }
  }
</style>
