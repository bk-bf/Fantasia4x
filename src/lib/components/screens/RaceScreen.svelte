<script lang="ts">
  import { currentRace } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { getTraitIcon } from '$lib/game/core/Race';
  import { onMount } from 'svelte';
  import { onDestroy } from 'svelte';

  let race: any = null;
  let raceScreenElement: HTMLElement;

  const unsubscribe = currentRace.subscribe((value) => {
    race = value;
  });

  onMount(() => {
    if (raceScreenElement) {
      raceScreenElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  function scrollToSection(sectionId: string) {
    console.log('Scrolling to:', sectionId);
    const element = document.getElementById(sectionId);
    if (element && raceScreenElement) {
      const elementTop = element.offsetTop;
      raceScreenElement.scrollTo({
        top: elementTop - 20,
        behavior: 'smooth'
      });
    }
  }

  onDestroy(() => {
    unsubscribe();
  });

  function getStatRangeColor(range: [number, number]): string {
    const avgStat = (range[0] + range[1]) / 2;
    if (avgStat >= 15) return '#4CAF50'; // Green for high stats
    if (avgStat >= 12) return '#FFA726'; // Orange for medium stats
    return '#9E9E9E'; // Gray for low stats
  }

  function getStatRangeDescription(statName: string, range: [number, number]): string {
    const avgStat = (range[0] + range[1]) / 2;
    const descriptions: Record<string, Record<string, string>> = {
      strength: {
        high: 'Mighty warriors capable of incredible feats of strength',
        medium: 'Strong and capable fighters with above-average power',
        low: 'Of average physical strength, relying on skill over brute force'
      },
      dexterity: {
        high: 'Lightning-quick reflexes and supernatural agility',
        medium: 'Nimble and graceful with excellent coordination',
        low: 'Steady hands but not particularly agile'
      },
      intelligence: {
        high: 'Brilliant minds that grasp complex concepts instantly',
        medium: 'Quick learners with sharp analytical skills',
        low: 'Practical wisdom over book learning'
      },
      wisdom: {
        high: 'Ancient wisdom flows through their consciousness',
        medium: 'Perceptive and intuitive with good judgment',
        low: 'Learning through experience rather than foresight'
      },
      charisma: {
        high: 'Natural leaders who inspire devotion in others',
        medium: 'Charming speakers with persuasive personalities',
        low: 'Prefer actions over words, quiet but reliable'
      },
      constitution: {
        high: 'Iron constitutions that can endure any hardship',
        medium: 'Hardy and resilient with good endurance',
        low: 'Delicate but compensate with other strengths'
      }
    };

    const level = avgStat >= 15 ? 'high' : avgStat >= 12 ? 'medium' : 'low';
    return descriptions[statName]?.[level] || 'Unknown trait';
  }

  function getSizeDescription(size: string): string {
    const descriptions: Record<string, string> = {
      tiny: 'Diminutive beings who make up for their small stature with cleverness',
      small: 'Compact and agile, perfectly suited for swift movement',
      medium: 'Of average humanoid proportions, well-balanced in all aspects',
      large: 'Imposing figures whose presence commands respect',
      huge: 'Massive beings whose very footsteps shake the earth'
    };
    return descriptions[size] || 'Unknown size';
  }

  function getPhysicalDescription(race: any): string {
    if (!race?.physicalTraits) return '';

    const { heightRange, weightRange, size } = race.physicalTraits;
    const avgHeight = Math.round((heightRange[0] + heightRange[1]) / 2);
    const avgWeight = Math.round((weightRange[0] + weightRange[1]) / 2);

    return `Standing ${avgHeight}cm tall and weighing around ${avgWeight}kg, ${getSizeDescription(size).toLowerCase()}. Their forms vary from ${heightRange[0]}cm to ${heightRange[1]}cm in height, with builds ranging from ${weightRange[0]}kg to ${weightRange[1]}kg.`;
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

  function getImplicationDescription(category: string, implication: string | null): string {
    const descriptions: Record<string, string> = {
      knowledge: `📚 Their pursuit of wisdom`,
      food: `🍖 Their sustenance traditions`,
      combat: `⚔️ Their warfare customs`,
      diplomacy: `🤝 Their social interactions`
    };

    if (implication) {
      return `${descriptions[category]}: ${implication}`;
    } else {
      return descriptions[category] || category;
    }
  }
</script>

<div class="race-screen" bind:this={raceScreenElement}>
  <div class="race-header">
    <button class="back-btn" on:click={() => uiState.setScreen('main')}>← Back to Map</button>
    <h2>👑 The {race?.name || 'Unknown'} People</h2>
    <p class="race-subtitle">Your chosen civilization</p>

    <!-- Quick navigation -->
    <div class="quick-nav">
      <button class="nav-btn" on:click={() => scrollToSection('overview')}>Overview</button>
      <button class="nav-btn" on:click={() => scrollToSection('physical')}>Physical</button>
      <button class="nav-btn" on:click={() => scrollToSection('stats')}>Stats</button>
      <button class="nav-btn" on:click={() => scrollToSection('traits')}>Traits</button>
      <button class="nav-btn" on:click={() => scrollToSection('implications')}>Culture</button>
    </div>
  </div>

  {#if race}
    <div class="race-content">
      <!-- Race Overview -->
      <div class="race-overview" id="overview">
        <div class="race-info-card">
          <h3>🏛️ Civilization Overview</h3>
          <div class="overview-stats">
            <div class="overview-item">
              <span class="overview-label">Population:</span>
              <span class="overview-value">{race.population}</span>
            </div>
            <div class="overview-item">
              <span class="overview-label">Size Category:</span>
              <span class="overview-value">{race.physicalTraits?.size || 'Unknown'}</span>
            </div>
            <div class="overview-item">
              <span class="overview-label">Racial Traits:</span>
              <span class="overview-value">{race.racialTraits?.length || 0}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Physical Description -->
      <div class="race-overview" id="physical">
        <h3>🏃 Physical Characteristics</h3>
        <div class="physical-description">
          <p>{getPhysicalDescription(race)}</p>
        </div>
      </div>

      <!-- Stat Ranges -->
      <div class="stats-section" id="stats">
        <h3>📊 Racial Stat Ranges</h3>
        <div class="stats-grid">
          {#each Object.entries(race.statRanges || {}) as [statName, statRangeRaw]}
            {#if Array.isArray(statRangeRaw) && statRangeRaw.length === 2}
              {@const statRange = statRangeRaw as [number, number]}
              <div class="stat-card">
                <div class="stat-header">
                  <span class="stat-name"
                    >{statName.charAt(0).toUpperCase() + statName.slice(1)}</span
                  >
                  <span class="stat-value" style="color: {getStatRangeColor(statRange)}"
                    >{statRange[0]}-{statRange[1]}</span
                  >
                </div>
                <div class="stat-bar">
                  <div
                    class="stat-fill"
                    style="width: {(statRange[1] / 20) *
                      100}%; background-color: {getStatRangeColor(statRange)}"
                  ></div>
                </div>
                <p class="stat-description">{getStatRangeDescription(statName, statRange)}</p>
              </div>
            {/if}
          {/each}
        </div>
      </div>

      <!-- Racial Traits -->
      <div class="traits-section" id="traits">
        <h3>✨ Racial Traits ({race.racialTraits?.length || 0})</h3>
        {#if race.racialTraits && race.racialTraits.length > 0}
          <div class="traits-grid">
            {#each race.racialTraits as trait}
              <div class="trait-card">
                <div class="trait-card-header">
                  <span class="trait-icon">{trait.icon || getTraitIcon(trait.name)}</span>
                  <div class="trait-title">
                    <h4>{trait.name}</h4>
                    <div class="trait-meta">
                      <span class="trait-category">Racial Trait</span>
                    </div>
                  </div>
                </div>

                <p class="trait-description">{trait.description}</p>

                <!-- Trait Effects -->
                <div class="trait-effects">
                  <h5>Effects:</h5>
                  <div class="effects-list">
                    {#each Object.entries(trait.effects || {}) as [effectName, effectValue]}
                      <div class="effect-item">
                        {#if effectName.includes('Bonus')}
                          +{effectValue} {effectName.replace('Bonus', '').toLowerCase()}
                        {:else if effectName.includes('Penalty')}
                          {effectValue} {effectName.replace('Penalty', '').toLowerCase()}
                        {:else if effectName.includes('Rate')}
                          {formatEffectValue(effectName, effectValue)}
                          {effectName.replace('Rate', '').toLowerCase()} rate
                        {:else if effectName.includes('Resistance')}
                          {formatEffectValue(effectName, effectValue)}
                          {effectName.replace('Resistance', '').toLowerCase()} resistance
                        {:else if effectName.includes('Efficiency')}
                          {formatEffectValue(effectName, effectValue)} efficiency
                        {:else if effectName === 'workEfficiency'}
                          {#each Object.entries(effectValue as Record<string, number>) as [workType, multiplier]}
                            +{Math.round(((multiplier as number) - 1) * 100)}% {workType} efficiency
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
            <p>
              This race has no special traits yet. Traits may develop over time based on their
              experiences.
            </p>
          </div>
        {/if}
      </div>

      <!-- Cultural Implications -->
      {#if race.implications}
        <div class="implications-section" id="implications">
          <h3>🎭 Cultural Implications</h3>
          <div class="implications-grid">
            {#each Object.entries(race.implications) as [category, implication]}
              <div class="implication-card">
                <h4>{category.charAt(0).toUpperCase() + category.slice(1)}</h4>
                <p>{getImplicationDescription(category, null)}</p>
                <small>{implication}</small>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="loading">
      <p>Loading race information...</p>
    </div>
  {/if}
</div>

<style>
  .race-screen {
    padding: 20px;
    background: #000000;
    color: #e0e0e0;
    font-family: 'Courier New', monospace;
    flex: 1;
    overflow-y: auto;
    box-sizing: border-box;
    padding-bottom: 40px;
  }

  .race-header {
    text-align: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #4caf50;
    position: relative;
  }

  .race-header h2 {
    color: #4caf50;
    margin: 0 0 10px 0;
    font-size: 2em;
    text-shadow: 0 0 10px rgba(76, 175, 80, 0.3);
  }

  .race-subtitle {
    color: #888;
    margin: 0;
    font-style: italic;
  }

  .quick-nav {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-top: 15px;
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

  .race-content {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .race-overview {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #4caf50;
  }

  .race-info-card h3 {
    color: #4caf50;
    margin: 0 0 15px 0;
  }

  .overview-stats {
    display: flex;
    gap: 20px;
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
    font-size: 1.2em;
  }

  .physical-description {
    color: #e0e0e0;
    font-size: 1.1em;
    line-height: 1.6;
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
  .traits-section h3 {
    color: #4caf50;
    margin: 0 0 20px 0;
  }
  .traits-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(375.5px, 0px));
    gap: 20px;
    justify-items: start; /* Align cards to the left */
  }

  .trait-card {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #555;
    transition: all 0.3s ease;
    max-width: 375.5px; /* Set a fixed max width */
    /* Remove any margin: 0 auto; if present */
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
    color: #e0e0e0;
  }

  .implications-section h3 {
    color: #4caf50;
    margin: 0 0 20px 0;
  }

  .implications-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
  }

  .implication-card {
    background: #0c0910;
    border-radius: 8px;
    padding: 15px;
    border-left: 4px solid #9c27b0;
  }

  .implication-card h4 {
    color: #9c27b0;
    margin: 0 0 8px 0;
    font-size: 1em;
  }

  .implication-card p {
    color: #e0e0e0;
    margin: 0;
    font-weight: bold;
  }

  .implication-card small {
    color: #888;
    font-style: italic;
    font-size: 0.8em;
    display: block;
    margin-top: 5px;
  }

  .loading {
    text-align: center;
    padding: 50px;
    color: #888;
  }

  /* Scrollbar styling */
  .race-screen::-webkit-scrollbar {
    width: 8px;
  }

  .race-screen::-webkit-scrollbar-track {
    background: #000000;
  }

  .race-screen::-webkit-scrollbar-thumb {
    background: #4caf50;
    border-radius: 4px;
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .race-screen {
      padding: 10px;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .traits-grid {
      grid-template-columns: 1fr;
    }

    .quick-nav {
      flex-wrap: wrap;
      justify-content: center;
    }
  }
</style>
