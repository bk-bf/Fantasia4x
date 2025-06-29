<script lang="ts">
  import { currentResources, currentRace, currentKnowledge } from '$lib/stores/gameState';
  import { onDestroy } from 'svelte';

  let resources: any[] = [];
  let race: any = null;
  let knowledge = 0;

  // Track resource changes for animation
  let resourceChanges: Record<string, number> = {};

  const unsubscribeResources = currentResources.subscribe((newResources) => {
    // Track changes for animation
    newResources.forEach((newResource) => {
      const oldResource = resources.find((r) => r.id === newResource.id);
      if (oldResource && oldResource.amount !== newResource.amount) {
        const change = newResource.amount - oldResource.amount;
        if (change > 0) {
          resourceChanges[newResource.id] = change;
          // Clear animation after 2 seconds
          setTimeout(() => {
            resourceChanges[newResource.id] = 0;
          }, 2000);
        }
      }
    });

    resources = newResources;
  });

  const unsubscribeRace = currentRace.subscribe((value) => {
    race = value;
  });

  const unsubscribeKnowledge = currentKnowledge.subscribe((value) => {
    knowledge = value;
  });

  onDestroy(() => {
    unsubscribeResources();
    unsubscribeRace();
    unsubscribeKnowledge();
  });

  function getResourceIcon(resourceId: string): string {
    switch (resourceId) {
      case 'food':
        return '🌾';
      case 'wood':
        return '🪵';
      case 'stone':
        return '🪨';
      default:
        return '📦';
    }
  }

  function getResourceColor(resourceId: string): string {
    switch (resourceId) {
      case 'food':
        return '#FFA726';
      case 'wood':
        return '#8BC34A';
      case 'stone':
        return '#9E9E9E';
      default:
        return '#4CAF50';
    }
  }
</script>

<div class="resource-sidebar">
  <div class="sidebar-header">
    <h3>🏰 Kingdom Status</h3>
  </div>

  <!-- Race Information -->
  {#if race}
    <div class="section race-info">
      <h4>👑 The {race.name}</h4>
      <div class="stat-row">
        <span class="stat-icon">👥</span>
        <span class="stat-label">Population</span>
        <span class="stat-value">{race.population}</span>
      </div>
    </div>
  {/if}

  <!-- Knowledge Display -->
  <div class="section knowledge-section">
    <div class="stat-row">
      <span class="stat-icon">🧠</span>
      <span class="stat-label">Knowledge</span>
      <span class="stat-value knowledge-value">{Math.floor(knowledge)}</span>
    </div>
  </div>

  <!-- Resources Section -->
  <div class="section resources-section">
    <h4>📦 Resources</h4>

    <div class="resource-list">
      {#each resources as resource}
        <div class="resource-item" style="--resource-color: {getResourceColor(resource.id)}">
          <div class="resource-header">
            <span class="resource-icon">{getResourceIcon(resource.id)}</span>
            <span class="resource-name">{resource.name}</span>

            <div class="resource-amount-container">
              <span class="resource-amount">{Math.floor(resource.amount)}</span>

              {#if resourceChanges[resource.id] > 0}
                <span class="resource-change">+{Math.floor(resourceChanges[resource.id])}</span>
              {/if}
            </div>
          </div>

          <div class="resource-bar">
            <div
              class="resource-fill"
              style="width: {Math.min(100, (resource.amount / 500) * 100)}%"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .resource-sidebar {
    height: 100%;
    width: 100%;
    background: linear-gradient(180deg, #2a2a2a 0%, #1e1e1e 100%);
    padding: 0;
    margin: 0;
    font-family: 'Courier New', monospace;
    color: #e0e0e0;
    overflow-y: auto;
    border: 0;
  }

  .sidebar-header {
    background: #333;
    padding: 15px 20px;
    border-bottom: 2px solid #4caf50;
    margin: 0;
  }

  .sidebar-header h3 {
    color: #4caf50;
    margin: 0;
    font-size: 1.2em;
    text-align: center;
    text-shadow: 0 0 10px rgba(76, 175, 80, 0.3);
  }

  .section {
    padding: 15px 20px;
    border-bottom: 1px solid #333;
  }

  .race-info h4 {
    color: #4caf50;
    margin: 0 0 10px 0;
    font-size: 1em;
  }

  .stat-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
  }

  .stat-icon {
    font-size: 1.1em;
    width: 20px;
  }

  .stat-label {
    flex: 1;
    color: #e0e0e0;
    font-size: 0.9em;
  }

  .stat-value {
    color: #4caf50;
    font-weight: bold;
  }

  .knowledge-value {
    color: #9c27b0;
  }

  .resources-section h4 {
    color: #4caf50;
    margin: 0 0 15px 0;
    font-size: 1em;
  }

  .resource-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .resource-item {
    background: #333;
    border-radius: 6px;
    padding: 12px;
    border-left: 4px solid var(--resource-color);
    transition: all 0.3s ease;
  }

  .resource-item:hover {
    background: #3a3a3a;
    transform: translateX(2px);
  }

  .resource-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .resource-icon {
    font-size: 1.1em;
    width: 20px;
  }

  .resource-name {
    color: #e0e0e0;
    font-weight: bold;
    flex: 1;
    font-size: 0.9em;
  }

  .resource-amount-container {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 55px; /* Increased to reserve space for resource-change */
    position: relative;
  }

  .resource-change {
    display: inline-block;
    min-width: 20px; /* Reserve space even when hidden */
    text-align: right;
    visibility: hidden;
    color: #4caf50;
    font-size: 0.8em;
    animation: fadeInOut 2s ease-in-out;
  }

  .resource-change:has(+ .resource-change),
  .resource-change:not(:empty) {
    visibility: visible;
  }

  .resource-amount {
    color: var(--resource-color);
    font-weight: bold;
    font-size: 1em;
  }

  .resource-bar {
    height: 3px;
    background: #555;
    border-radius: 2px;
    overflow: hidden;
  }

  .resource-fill {
    height: 100%;
    background: var(--resource-color);
    transition: width 0.5s ease;
    border-radius: 2px;
  }

  .production-info h4 {
    color: #4caf50;
    margin: 0 0 10px 0;
    font-size: 1em;
  }

  .production-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .production-item {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #888;
    font-size: 0.85em;
    padding: 4px 8px;
    background: #2a2a2a;
    border-radius: 4px;
  }

  @keyframes fadeInOut {
    0% {
      opacity: 0;
      transform: translateY(-10px);
    }
    50% {
      opacity: 1;
      transform: translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateY(-10px);
    }
  }

  /* Custom scrollbar */
  .resource-sidebar::-webkit-scrollbar {
    width: 6px;
  }

  .resource-sidebar::-webkit-scrollbar-track {
    background: #1a1a1a;
  }

  .resource-sidebar::-webkit-scrollbar-thumb {
    background: #4caf50;
    border-radius: 3px;
  }
</style>
