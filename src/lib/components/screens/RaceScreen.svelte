<!-- src/lib/components/screens/RaceScreen.svelte -->
<script lang="ts">
  import { currentRace } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
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
    console.log('Scrolling to:', sectionId); // Debug log
    const element = document.getElementById(sectionId);
    if (element && raceScreenElement) {
      const elementTop = element.offsetTop;
      raceScreenElement.scrollTo({
        top: elementTop - 20, // 20px offset from top
        behavior: 'smooth'
      });
    } else {
      console.log('Element not found:', sectionId);
    }
  }

  onDestroy(() => {
    unsubscribe();
  });

  function getStatColor(value: number): string {
    if (value >= 16) return '#4CAF50'; // Green for high stats
    if (value >= 13) return '#FFA726'; // Orange for medium stats
    return '#9E9E9E'; // Gray for low stats
  }

  type StatKey = 'strength' | 'dexterity' | 'intelligence' | 'wisdom' | 'charisma' | 'constitution';

  function getStatDescription(stat: StatKey, value: number): string {
    const descriptions: Record<StatKey, string> = {
      strength:
        value >= 16 ? 'Mighty warriors' : value >= 13 ? 'Strong fighters' : 'Average strength',
      dexterity:
        value >= 16 ? 'Lightning quick' : value >= 13 ? 'Agile and nimble' : 'Average agility',
      intelligence:
        value >= 16 ? 'Brilliant minds' : value >= 13 ? 'Quick learners' : 'Average intellect',
      wisdom:
        value >= 16 ? 'Ancient wisdom' : value >= 13 ? 'Wise and perceptive' : 'Average wisdom',
      charisma:
        value >= 16 ? 'Natural leaders' : value >= 13 ? 'Charming speakers' : 'Average presence',
      constitution:
        value >= 16
          ? 'Iron constitution'
          : value >= 13
            ? 'Hardy and resilient'
            : 'Average endurance'
    };
    return descriptions[stat] || 'Unknown trait';
  }
</script>

<div class="race-screen" bind:this={raceScreenElement}>
  <div class="race-header">
    <button class="back-btn" on:click={() => uiState.setScreen('main')}>← Back to Map</button>
    <h2>👑 The {race?.name || 'Unknown'} People</h2>
    <p class="race-subtitle">Your civilization</p>

    <!-- Quick navigation -->
    <div class="quick-nav">
      <button class="nav-btn" on:click={() => scrollToSection('overview')}>Overview</button>
      <button class="nav-btn" on:click={() => scrollToSection('stats')}>Stats</button>
      <button class="nav-btn" on:click={() => scrollToSection('traits')}>Traits</button>
      <button class="nav-btn" on:click={() => scrollToSection('implications')}>Impact</button>
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
              <span class="overview-label">Stat Range:</span>
              <span class="overview-value">{race.statVariation}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Base Stats -->
      <div class="stats-section" id="stats">
        <h3>📊 Racial Base Stats</h3>
        <div class="stats-grid">
          {#each Object.entries(race.baseStats) as [statName, statValue]}
            <div class="stat-card">
              <div class="stat-header">
                <span class="stat-name">{statName.charAt(0).toUpperCase() + statName.slice(1)}</span
                >
                <span class="stat-value" style="color: {getStatColor(Number(statValue))}"
                  >{statValue}</span
                >
              </div>
              <div class="stat-bar">
                <div
                  class="stat-fill"
                  style="width: {(Number(statValue) / 20) * 100}%; background-color: {getStatColor(
                    Number(statValue)
                  )}"
                ></div>
              </div>
              <p class="stat-description">
                {getStatDescription(statName as StatKey, Number(statValue))}
              </p>
            </div>
          {/each}
        </div>
      </div>

      <!-- Racial Traits -->
      <div class="traits-section" id="traits">
        <h3>✨ Racial Traits</h3>
        {#if race.traits && race.traits.length > 0}
          <div class="traits-grid">
            {#each race.traits as trait}
              <div class="trait-card">
                <div class="trait-header">
                  <span class="trait-icon">⭐</span>
                  <span class="trait-name">{trait.name}</span>
                </div>
                <div class="trait-effects">
                  {#each Object.entries(trait.effects) as [effectName, effectValue]}
                    <div class="trait-effect">
                      {effectName}:
                      {#if typeof effectValue === 'number'}
                        {effectValue > 1
                          ? `+${Math.round((effectValue - 1) * 100)}%`
                          : effectValue < 1
                            ? `-${Math.round((1 - effectValue) * 100)}%`
                            : `${effectValue}`}
                      {:else}
                        {String(effectValue)}
                      {/if}
                    </div>
                  {/each}
                </div>
                <div class="trait-description">{trait.description}</div>
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

      <!-- Stat Implications -->
      {#if race.implications}
        <div class="implications-section" id="implications">
          <h3>🎯 What This Means</h3>
          <div class="implications-grid">
            <div class="implication-card">
              <h4>🧠 Knowledge Generation</h4>
              <p>
                +{Math.floor((race.baseStats.intelligence + race.baseStats.wisdom) / 10)} per day
              </p>
              <small>{race.implications.knowledge}</small>
            </div>
            <div class="implication-card">
              <h4>🌾 Food Production</h4>
              <p>{race.population * 3} per day (3 per citizen)</p>
              <small>{race.implications.food}</small>
            </div>
            <div class="implication-card">
              <h4>💪 Combat Potential</h4>
              <p>
                {race.baseStats.strength >= 15
                  ? 'High'
                  : race.baseStats.strength >= 12
                    ? 'Medium'
                    : 'Low'} physical prowess
              </p>
              <small>{race.implications.combat}</small>
            </div>
            <div class="implication-card">
              <h4>🤝 Diplomacy</h4>
              <p>
                {race.baseStats.charisma >= 15
                  ? 'Excellent'
                  : race.baseStats.charisma >= 12
                    ? 'Good'
                    : 'Average'} at negotiations
              </p>
              <small>{race.implications.diplomacy}</small>
            </div>
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
  .traits-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 15px;
  }

  .trait-card {
    background: #2a2a2a;
    border: 1px solid #4caf50;
    border-radius: 8px;
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .trait-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .trait-name {
    color: #4caf50;
    font-weight: bold;
    font-size: 1.1em;
  }

  .trait-effects {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .trait-effect {
    color: #ffa726;
    font-weight: bold;
    font-size: 0.9em;
    padding: 2px 6px;
    background: #333;
    border-radius: 4px;
    font-family: monospace;
  }

  .trait-description {
    color: #888;
    font-size: 0.85em;
    font-style: italic;
    margin-top: 4px;
  }

  .race-screen {
    padding: 20px;
    background: #1a1a1a;
    color: #e0e0e0;
    font-family: 'Courier New', monospace;
    flex: 1; /* Change from height: 100% */
    overflow-y: auto;
    box-sizing: border-box;
    padding-bottom: 40px;
  }

  .race-header {
    text-align: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #4caf50;
    position: relative; /* Add this */
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

  .race-content {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .race-overview {
    background: #2a2a2a;
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
    background: #2a2a2a;
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
  .quick-nav {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-top: 15px;
  }

  .nav-btn {
    padding: 6px 12px;
    background: #333;
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

  .back-btn {
    position: absolute;
    top: 0;
    right: 0; /* Position on the right side */
    padding: 8px 16px;
    background: #333;
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
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .trait-card {
    background: #2a2a2a;
    border: 1px solid #4caf50;
    border-radius: 20px;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .trait-icon {
    color: #4caf50;
  }

  .trait-name {
    color: #e0e0e0;
    font-weight: bold;
  }

  .no-traits {
    background: #2a2a2a;
    border-radius: 8px;
    padding: 20px;
    text-align: center;
    color: #888;
    font-style: italic;
  }
  .implication-card small {
    color: #888;
    font-style: italic;
    font-size: 0.8em;
    display: block;
    margin-top: 5px;
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
    background: #2a2a2a;
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
    background: #1a1a1a;
  }

  .race-screen::-webkit-scrollbar-thumb {
    background: #4caf50;
    border-radius: 4px;
  }
</style>
