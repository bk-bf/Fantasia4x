<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { buildingService } from '$lib/game/services/BuildingService';
  import { uiState } from '$lib/stores/uiState';
  import { onMount } from 'svelte';
  // Update imports for new activity log system
  import { recentActivity, workActivity, eventActivity, criticalActivity } from '$lib/stores/Log';
  import EventModal from '$lib/components/UI/EventModal.svelte';

  let mapContainer: HTMLElement;
  let currentTurn = 0;
  let raceName = '';
  let buildingCounts: Record<string, number> = {};
  let showActivityLog = true; // Start expanded
  let logFilter: 'all' | 'work' | 'events' | 'critical' = 'all'; // Activity filter

  // Subscribe to game state
  const unsubscribe = gameState.subscribe((state) => {
    currentTurn = state.turn;
    raceName = state.race.name;
    buildingCounts = state.buildingCounts || {};
  });

  // Simple check: if any knowledge building exists, unlock research screen
  $: hasResearchCapability = buildingService.hasBuildings(buildingCounts, 'knowledge');

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

  // Placeholder ASCII map
  const placeholderMap = `                                        
......................                                  
......................                                  
.........♦♦♦..........                                  
.........♦♦♦..........                                  
.........♦♦♦..........                                  
..........🏰...........                                  
..........▲▲▲.........                                  
..........▲▲▲.........                                  
..........▲▲▲.........                                  
......................                                  
~~~~~~~~~~~~~~~~~~~~..                                  
~~~~~~~~~~~~~~~~~~~~..                                  
......................                                  
        
  `.trim();

  onMount(() => {
    return () => {
      unsubscribe();
    };
  });

  function handleMapClick(event: MouseEvent) {
    console.log('Map clicked at:', event.offsetX, event.offsetY);
  }

  function handleMapKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && mapContainer) {
      const rect = mapContainer.getBoundingClientRect();
      const simulatedEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      });
      mapContainer.dispatchEvent(simulatedEvent);
    }
  }

  function toggleActivityLog() {
    showActivityLog = !showActivityLog;
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
</script>

<div class="main-screen">
  <div class="screen-header" style="justify-content: center;">
    <div class="header-content">
      <h3>World of {raceName} - Turn {currentTurn}</h3>
    </div>
  </div>

  <div class="main-content">
    <!-- Left side: Map -->
    <div class="map-section">
      <div
        class="ascii-map"
        bind:this={mapContainer}
        on:click={handleMapClick}
        on:keydown={handleMapKeyDown}
        role="button"
        tabindex="0"
      >
        {placeholderMap}
      </div>

      <div class="map-controls">
        <div class="view-controls">
          <button class="control-btn" on:click={() => uiState.setScreen('race')}>👑 Race</button>
          <button class="control-btn" on:click={() => uiState.setScreen('pawns')}>👥 Pawns</button>
          <button class="control-btn" on:click={() => uiState.setScreen('work')}>👷 Work</button>
          <button class="control-btn" on:click={() => uiState.setScreen('building')}
            >🏗️ Build</button
          >
          <button class="control-btn" on:click={() => uiState.setScreen('crafting')}
            >⚒️ Crafting</button
          >
          <button class="control-btn" on:click={() => uiState.setScreen('exploration')}
            >🗺️ Explore</button
          >
          <button
            class="control-btn"
            class:disabled={!hasResearchCapability}
            on:click={() => hasResearchCapability && uiState.setScreen('research')}
            disabled={!hasResearchCapability}
            title={hasResearchCapability
              ? 'Access research projects'
              : 'Build a knowledge building to unlock research'}
          >
            📚 Research
          </button>
        </div>
      </div>
    </div>

    <!-- Right side: Activity Log -->
    <div class="activity-log-section" class:collapsed={!showActivityLog}>
      <div class="activity-log-header">
        <h4>📋 Settlement Chronicle</h4>
        <div class="header-controls">
          <select bind:value={logFilter} class="filter-select">
            <option value="all">All Activity</option>
            <option value="work">Work Only</option>
            <option value="events">Events Only</option>
            <option value="critical">Critical Only</option>
          </select>
          <button class="toggle-btn" on:click={toggleActivityLog}>
            {showActivityLog ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>
      </div>

      {#if showActivityLog}
        <div class="activity-log-content">
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
      {/if}
    </div>
  </div>
</div>

<style>
  .main-screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-family: 'Courier New', monospace;
    color: #e0e0e0;
    background-color: #000000;
  }

  .screen-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    background: linear-gradient(135deg, #000000, #1e1e1e);
    border-bottom: 2px solid #4caf50;
  }

  .screen-header h3 {
    font-size: 1.2em;
    margin: 0;
    font-weight: bold;
    color: #4caf50;
    text-align: center;
    text-shadow: 0 0 8px rgba(76, 175, 80, 0.3);
    line-height: 1.2;
  }

  .main-content {
    flex: 1;
    display: flex;
    height: calc(100vh - 80px);
  }

  .map-section {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .ascii-map {
    flex: 1;
    background-color: #000;
    padding: 20px;
    white-space: pre;
    font-size: 14px;
    line-height: 1.3;
    overflow: auto;
    cursor: crosshair;
    font-family: 'Courier New', monospace;
    color: #4caf50;
  }

  .ascii-map:hover {
    border-color: #66bb6a;
    box-shadow:
      0 0 30px rgba(76, 175, 80, 0.4),
      inset 0 0 20px rgba(0, 0, 0, 0.8);
  }

  .map-controls {
    display: flex;
    justify-content: space-between;
    padding: 15px 20px;
    background: #000000;
    border-top: 1px solid #444;
  }

  .view-controls {
    display: flex;
    gap: 10px;
  }

  .control-btn {
    padding: 8px 16px;
    background: #000000;
    border: 1px solid #555;
    color: #e0e0e0;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
    transition: all 0.2s ease;
  }

  .control-btn:hover:not(.disabled) {
    background: #444;
    border-color: #4caf50;
    color: #4caf50;
  }

  .control-btn.disabled {
    background: #222;
    border-color: #000000;
    color: #666;
    cursor: not-allowed;
  }

  /* Activity Log Styles */
  .activity-log-section {
    width: 450px;
    background: #000000;
    border-left: 2px solid #4caf50;
    transition: width 0.3s ease;
    display: flex;
    flex-direction: column;
  }

  .activity-log-section.collapsed {
    width: 60px;
  }

  .activity-log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px;
    background: #111;
    border-bottom: 1px solid #333;
  }

  .activity-log-header h4 {
    margin: 0;
    color: #4caf50;
    font-size: 1.1em;
  }

  .header-controls {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .filter-select {
    background: #222;
    border: 1px solid #555;
    color: #e0e0e0;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 0.8em;
  }

  .filter-select:focus {
    border-color: #4caf50;
    outline: none;
  }

  .toggle-btn {
    background: none;
    border: 1px solid #555;
    color: #4caf50;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1.2em;
  }

  .toggle-btn:hover {
    background: #222;
    border-color: #4caf50;
  }

  .activity-log-content {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
  }

  .no-activity {
    text-align: center;
    padding: 40px 20px;
    color: #666;
  }

  .no-activity .subtitle {
    font-size: 0.9em;
    margin-top: 10px;
    font-style: italic;
  }

  .activity-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .activity-entry {
    background: #111;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 8px;
    font-size: 0.85em;
    transition: all 0.2s ease;
  }

  .activity-entry:hover {
    border-color: #4caf50;
    background: #0a0a0a;
  }

  .activity-entry.critical {
    border-color: #d32f2f;
    background: rgba(211, 47, 47, 0.05);
  }

  .activity-entry.warning {
    border-color: #ff9800;
    background: rgba(255, 152, 0, 0.05);
  }

  .activity-entry.error {
    border-color: #f44336;
    background: rgba(244, 67, 54, 0.05);
  }

  .activity-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    font-size: 0.8em;
  }

  .severity-icon {
    font-size: 1.1em;
  }

  .activity-type {
    font-weight: bold;
    font-size: 0.7em;
    padding: 1px 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.1);
  }

  .activity-turn {
    color: #888;
    font-size: 0.8em;
  }

  .activity-time {
    color: #666;
    font-size: 0.7em;
    margin-left: auto;
  }

  .activity-details {
    line-height: 1.3;
  }

  .activity-actor {
    color: #81c784;
    font-size: 0.9em;
  }

  .activity-action {
    color: #e0e0e0;
    margin: 2px 0;
  }

  .activity-target {
    color: #ffb74d;
    font-style: italic;
  }

  .activity-result {
    color: #ccc;
    font-size: 0.85em;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .main-content {
      flex-direction: column;
    }

    .activity-log-section {
      width: 100%;
      max-height: 300px;
      border-left: none;
      border-top: 2px solid #4caf50;
    }

    .activity-log-section.collapsed {
      width: 100%;
      max-height: 50px;
    }
  }
</style>
