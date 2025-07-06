<script lang="ts">
  import { currentItem, currentRace } from '$lib/stores/gameState';
  import { onDestroy } from 'svelte';
  import { getItemIcon, getItemColor } from '$lib/game/core/Items';

  let items: any[] = [];
  let race: any = null;

  // Track resource changes for animation
  let itemChanges: Record<string, number> = {};

  const unsubscribeItems = currentItem.subscribe((newItems) => {
    newItems = newItems || [];
    // Track changes for animation
    newItems.forEach((newItems) => {
      const oldItem = items.find((i) => i.id === newItems.id);
      if (oldItem && oldItem.amount !== newItems.amount) {
        const change = newItems.amount - oldItem.amount;
        if (change > 0) {
          itemChanges[newItems.id] = change;
          // Clear animation after 2 seconds
          setTimeout(() => {
            itemChanges[newItems.id] = 0;
          }, 2000);
        }
      }
    });

    items = newItems;
  });

  const unsubscribeRace = currentRace.subscribe((value) => {
    race = value;
  });

  onDestroy(() => {
    unsubscribeItems();
    unsubscribeRace();
  });
</script>

<div class="resource-sidebar">
  <!-- Compact Kingdom Overview (Single Row) -->
  {#if race}
    <div class="section kingdom-overview">
      <div
        class="sidebar-header"
        style="text-align: left; padding: 0px; justify-content: flex-start; display: flex;"
      >
        <h3 style="text-align: left; margin-left: 0;">🏰 Kingdom Status</h3>
      </div>
      <div class="kingdom-title" style="justify-content: left; margin-top: 10px;">
        <span class="crown">👑</span>
        <span class="race-name">{race.name}</span>
        <span class="stat-item" style="margin-left: 12px;">
          <span class="stat-icon">👥</span>
          <span class="stat-value">{race.population}</span>
        </span>
      </div>
      <!-- Ultra-Compact Resources INSIDE Kingdom Status Card -->
      <div class="resources-section" style="text-align: left; margin-top: 8px;">
        <h4 style="margin-left: auto; margin-right: auto; display: inline-block;">📦 Resources</h4>
        <div class="resource-grid">
          {#each items.filter((item) => item.amount > 0 && item.type === 'material') as item}
            <div class="resource-mini" style="--resource-color: {getItemColor(item.id)}">
              <div class="resource-content">
                <span class="resource-icon">{getItemIcon(item.id)}</span>
                <div class="resource-info">
                  <span class="resource-label">{item.name}</span>
                  <div class="resource-amount-container">
                    <span class="resource-amount">{Math.floor(item.amount)}</span>
                    {#if itemChanges[item.id] > 0}
                      <span class="resource-change">+{Math.floor(itemChanges[item.id])}</span>
                    {/if}
                  </div>
                </div>
              </div>
              <div class="resource-bar">
                <div
                  class="resource-fill"
                  style="width: {Math.min(100, (item.amount / 500) * 100)}%"
                ></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .resource-sidebar {
    height: 100%;
    width: 100%;
    background: #000000; /* AMOLED black */
    padding: 0;
    margin: 0;
    font-family: 'Courier New', monospace;
    color: #e0e0e0;
    overflow-y: auto;
    border: 0;
  }

  .section {
    padding: 8px 12px;
    border-bottom: 1px solid #000000;
    background: transparent; /* No card background for sections */
  }

  .kingdom-overview {
    background: transparent; /* No card background for overview */
  }

  .resource-mini {
    background: #181c1b; /* Contrasting dark card */
    margin: 2px;
    border-radius: 5px;
    padding: 6px;
    border-left: 2px solid var(--resource-color);
    box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.18);
    transition:
      box-shadow 0.2s,
      transform 0.2s;
    min-height: 38px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .resource-mini:hover {
    box-shadow: 0 4px 16px 0 rgba(76, 175, 80, 0.08);
    transform: scale(1.04);
  }

  .sidebar-header,
  .screen-header {
    background: #000000;
    border-bottom: 2px solid #4caf50;
    padding: 4px 8px;
    margin: 0;
  }

  /* For both .sidebar-header h3 and .screen-header h3 */
  .sidebar-header h3,
  .screen-header h3 {
    font-size: 1.2em;
    margin: 0;
    font-weight: bold;
    color: #4caf50;
    text-align: center;
    text-shadow: 0 0 8px rgba(76, 175, 80, 0.3);
    line-height: 1.2;
  }

  .kingdom-title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    justify-content: center;
  }

  .crown {
    font-size: 1.1em;
  }

  .race-name {
    color: #4caf50;
    font-weight: bold;
    font-size: 0.95em;
    text-shadow: 0 0 5px rgba(76, 175, 80, 0.2);
  }

  .stats-row {
    display: flex;
    justify-content: space-around;
    gap: 10px;
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(76, 175, 80, 0.1);
    padding: 4px 8px;
    border-radius: 3px;
    border: 1px solid rgba(76, 175, 80, 0.2);
  }

  .stat-icon {
    font-size: 0.9em;
  }

  .stat-value {
    color: #4caf50;
    font-weight: bold;
    font-size: 0.85em;
  }

  .resources-section h4 {
    color: #4caf50;
    margin: 0 0 6px 0;
    font-size: 0.85em;
  }

  .resource-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }

  .resource-content {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .resource-icon {
    font-size: 0.8em;
    flex-shrink: 0;
  }

  .resource-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .resource-amount {
    color: var(--resource-color);
    font-weight: bold;
    font-size: 0.7em;
    line-height: 1;
  }

  .resource-label {
    color: #e0e0e0;
    font-size: 0.6em;
    line-height: 1;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  .resource-bar {
    height: 1px;
    background: #555;
    border-radius: 1px;
    overflow: hidden;
    margin-top: 2px;
  }

  .resource-fill {
    height: 100%;
    background: var(--resource-color);
    transition: width 0.3s ease;
    border-radius: 1px;
  }

  /* Custom scrollbar */
  .resource-sidebar::-webkit-scrollbar {
    width: 3px;
  }

  .resource-sidebar::-webkit-scrollbar-track {
    background: #000000;
  }

  .resource-sidebar::-webkit-scrollbar-thumb {
    background: #4caf50;
    border-radius: 2px;
  }

  .resource-amount-container {
    display: flex;
    align-items: center;
    gap: 4px;
    position: relative;
  }

  .resource-change {
    color: #4caf50;
    font-size: 0.6em;
    font-weight: bold;
    animation: fadeInOut 2s ease-in-out;
    position: absolute;
    right: -28px;
    top: -11px;
    background: none;
    padding: 0 2px;
    border: none;
  }

  @keyframes fadeInOut {
    0% {
      opacity: 0;
      transform: translateY(-5px);
    }
    50% {
      opacity: 1;
      transform: translateY(0);
    }
    100% {
      opacity: 0;
      transform: translateY(-5px);
    }
  }
  /* Responsive adjustments */
  @media (max-width: 280px) {
    .resource-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .stats-row {
      flex-direction: column;
      gap: 4px;
    }
  }
</style>
