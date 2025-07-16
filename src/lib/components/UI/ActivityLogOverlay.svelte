<script lang="ts">
  // Fix imports - use the correct functions from Log.ts
  import {
    recentActivity,
    workActivity,
    eventActivity,
    criticalActivity,
    logActivity, // Use the actual function from Log.ts
    logSystem, // Convenience function
    logWork, // Convenience function
    logBuilding // Convenience function
  } from '$lib/stores/Log';
  import { gameState } from '$lib/stores/gameState';
  import { fade, fly } from 'svelte/transition';
  import { onMount } from 'svelte';

  export let isOpen = false;

  let logFilter: 'all' | 'work' | 'events' | 'critical' = 'all';

  // Get appropriate activity log based on filter
  $: currentActivityLog = (() => {
    switch (logFilter) {
      case 'work':
        return $workActivity;
      case 'events':
        return $eventActivity;
      case 'critical':
        return $criticalActivity;
      default:
        return $recentActivity;
    }
  })();

  function toggleLog() {
    isOpen = !isOpen;
  }

  function formatActivityTime(timestamp: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(timestamp);
  }

  function getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'info':
        return '📝';
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      case 'critical':
        return '💀';
      default:
        return '📄';
    }
  }

  function getSeverityColor(severity: string): string {
    switch (severity) {
      case 'info':
        return '#4caf50';
      case 'success':
        return '#8bc34a';
      case 'warning':
        return '#ff9800';
      case 'error':
        return '#f44336';
      case 'critical':
        return '#d32f2f';
      default:
        return '#666';
    }
  }

  function getTypeColor(type: string): string {
    switch (type) {
      case 'work':
        return '#2196f3';
      case 'building':
        return '#ff9800';
      case 'crafting':
        return '#9c27b0';
      case 'event':
        return '#f44336';
      case 'pawn_action':
        return '#4caf50';
      case 'research':
        return '#673ab7';
      case 'exploration':
        return '#795548';
      case 'system':
        return '#607d8b';
      default:
        return '#666';
    }
  }

  function getPawnName(pawnId: string): string {
    if (pawnId === 'system') return 'System';
    const state = $gameState;
    const pawn = state.pawns.find((p) => p.id === pawnId);
    return pawn ? pawn.name : `Pawn ${pawnId.slice(0, 4)}`;
  }

  // Close on Escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      isOpen = false;
    }
  }

  // Add some test logs if none exist
  onMount(() => {
    if ($recentActivity.length === 0) {
      console.log('🧪 Adding test activity logs...');

      // Use logSystem for system events
      logSystem(
        'Settlement founded',
        'Your civilization begins its journey at the starting location',
        1,
        'info'
      );

      // Use logWork for work activities
      logWork('pawn_1', 'Started foraging', 'berry bushes', 'Collected 3 wild berries', 1);

      // Use logBuilding for building activities
      logBuilding(
        'Constructed shelter',
        'basic hut',
        'Housing capacity increased by 2',
        2,
        'pawn_2'
      );

      // Use logActivity for custom events
      logActivity({
        turn: 2,
        type: 'event',
        actor: 'system',
        action: 'Wild animal spotted',
        target: 'near settlement',
        result: 'Increased caution recommended',
        severity: 'warning'
      });

      // Use logActivity for crafting
      logActivity({
        turn: 3,
        type: 'crafting',
        actor: 'pawn_1',
        action: 'Crafted stone tools',
        target: '2x stone axes',
        result: 'Work efficiency improved',
        severity: 'success'
      });

      console.log('🧪 Test activity logs added successfully');
    }
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Toggle Button - Always visible -->
<button
  class="log-toggle-btn"
  on:click={toggleLog}
  class:active={isOpen}
  title="Toggle Activity Log"
>
  📋
</button>

{#if isOpen}
  <div
    class="log-overlay-backdrop"
    transition:fade={{ duration: 200 }}
    on:click={toggleLog}
    role="button"
    tabindex="0"
    on:keydown={(e) => e.key === 'Enter' && toggleLog()}
  >
    <div
      class="log-overlay-panel"
      transition:fly={{ x: 300, duration: 300 }}
      on:click|stopPropagation
      role="dialog"
      aria-label="Activity Log"
    >
      <!-- Header -->
      <div class="log-header">
        <h3>📋 Settlement Chronicle</h3>
        <div class="header-controls">
          <select bind:value={logFilter} class="filter-select">
            <option value="all">All Activity</option>
            <option value="work">Work Only</option>
            <option value="events">Events Only</option>
            <option value="critical">Critical Only</option>
          </select>
          <button class="close-btn" on:click={toggleLog}>✕</button>
        </div>
      </div>

      <!-- Content -->
      <div class="log-content">
        {#if currentActivityLog.length === 0}
          <div class="no-activity">
            <p>📭 No activity recorded yet</p>
            <p class="subtitle">Settlement activity will appear here...</p>
          </div>
        {:else}
          <div class="activity-list">
            {#each currentActivityLog as entry}
              <div
                class="activity-entry"
                class:critical={entry.severity === 'critical'}
                class:warning={entry.severity === 'warning'}
                class:error={entry.severity === 'error'}
              >
                <div class="activity-header">
                  <span class="severity-icon" style="color: {getSeverityColor(entry.severity)}">
                    {getSeverityIcon(entry.severity)}
                  </span>
                  <span class="activity-type" style="color: {getTypeColor(entry.type)}">
                    {entry.type.toUpperCase()}
                  </span>
                  <span class="activity-turn">T{entry.turn}</span>
                  <span class="activity-time">{formatActivityTime(entry.timestamp)}</span>
                </div>

                <div class="activity-details">
                  <div class="activity-actor">
                    <strong>{getPawnName(entry.actor || 'system')}</strong>
                  </div>
                  <div class="activity-action">
                    {entry.action}
                    {#if entry.target}
                      <span class="activity-target">→ {entry.target}</span>
                    {/if}
                  </div>
                  <div class="activity-result">{entry.result}</div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Toggle Button - Fixed to bottom-right corner */
  .log-toggle-btn {
    position: fixed;
    bottom: 20px; /* Changed from top: 50% to bottom */
    right: 20px;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.8);
    border: 2px solid #4caf50;
    color: #4caf50;
    font-size: 0.9em; /* Smaller font */
    padding: 10px 15px; /* Normal horizontal padding */
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s ease;
    backdrop-filter: blur(5px);
    font-family: 'Courier New', monospace;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    /* Removed vertical writing mode */
  }

  .log-toggle-btn:hover,
  .log-toggle-btn.active {
    background: rgba(76, 175, 80, 0.3);
    box-shadow: 0 0 20px rgba(76, 175, 80, 0.4);
    transform: scale(1.05);
    bottom: 18px; /* Slight lift on hover */
  }

  /* Overlay Backdrop - More transparent */
  .log-overlay-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999;
    display: flex;
    justify-content: flex-end;
    align-items: stretch;
  }

  /* Log Panel - More transparent */
  .log-overlay-panel {
    width: 33.333vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.85);
    border-left: 3px solid #4caf50;
    display: flex;
    flex-direction: column;
    font-family: 'Courier New', monospace;
    color: #e0e0e0;
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
  }

  /* Header - More transparent */
  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    background: rgba(17, 17, 17, 0.7);
    border-bottom: 2px solid #4caf50;
    backdrop-filter: blur(10px);
  }

  .log-header h3 {
    margin: 0;
    color: #4caf50;
    font-size: 1.2em;
    text-shadow: 0 0 8px rgba(76, 175, 80, 0.3);
  }

  .header-controls {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .filter-select {
    background: rgba(34, 34, 34, 0.8);
    border: 1px solid #555;
    color: #e0e0e0;
    padding: 6px 12px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
    backdrop-filter: blur(5px);
  }

  .filter-select:focus {
    border-color: #4caf50;
    outline: none;
    box-shadow: 0 0 5px rgba(76, 175, 80, 0.3);
  }

  .close-btn {
    background: rgba(244, 67, 54, 0.1);
    border: 1px solid #f44336;
    color: #f44336;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1em;
    transition: all 0.2s ease;
    backdrop-filter: blur(5px);
  }

  .close-btn:hover {
    background: rgba(244, 67, 54, 0.3);
    box-shadow: 0 0 10px rgba(244, 67, 54, 0.3);
  }

  /* Content */
  .log-content {
    flex: 1;
    overflow-y: auto;
    padding: 15px;
    background: rgba(0, 0, 0, 0.1);
  }

  .no-activity {
    text-align: center;
    padding: 60px 20px;
    color: #666;
  }

  .no-activity .subtitle {
    font-size: 0.9em;
    margin-top: 15px;
    font-style: italic;
  }

  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .activity-entry {
    background: rgba(17, 17, 17, 0.6);
    border: 1px solid rgba(51, 51, 51, 0.8);
    border-radius: 6px;
    padding: 12px;
    font-size: 0.9em;
    transition: all 0.2s ease;
    backdrop-filter: blur(8px);
  }

  .activity-entry:hover {
    border-color: rgba(76, 175, 80, 0.8);
    background: rgba(17, 17, 17, 0.8);
    box-shadow: 0 0 10px rgba(76, 175, 80, 0.2);
  }

  .activity-entry.critical {
    border-color: rgba(211, 47, 47, 0.8);
    background: rgba(211, 47, 47, 0.15);
  }

  .activity-entry.warning {
    border-color: rgba(255, 152, 0, 0.8);
    background: rgba(255, 152, 0, 0.1);
  }

  .activity-entry.error {
    border-color: rgba(244, 67, 54, 0.8);
    background: rgba(244, 67, 54, 0.1);
  }

  .activity-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 0.85em;
  }

  .severity-icon {
    font-size: 1.2em;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8));
  }

  .activity-type {
    font-weight: bold;
    font-size: 0.75em;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(3px);
  }

  .activity-turn {
    color: #888;
    font-size: 0.85em;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
  }

  .activity-time {
    color: #666;
    font-size: 0.75em;
    margin-left: auto;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
  }

  .activity-details {
    line-height: 1.4;
  }

  .activity-actor {
    color: #81c784;
    font-size: 0.95em;
    margin-bottom: 3px;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
  }

  .activity-action {
    color: #e0e0e0;
    margin: 3px 0;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
  }

  .activity-target {
    color: #ffb74d;
    font-style: italic;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
  }

  .activity-result {
    color: #ccc;
    font-size: 0.9em;
    margin-top: 3px;
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .log-overlay-panel {
      width: 50vw;
    }

    .log-toggle-btn {
      font-size: 0.8em;
      padding: 8px 12px;
      bottom: 15px;
      right: 15px;
    }
  }

  @media (max-width: 480px) {
    .log-overlay-panel {
      width: 80vw;
    }

    .log-toggle-btn {
      right: 10px;
      bottom: 10px;
      padding: 6px 10px;
      font-size: 0.7em;
    }
  }
</style>
