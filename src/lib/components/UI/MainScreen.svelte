<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { onMount } from 'svelte';

  let mapContainer: HTMLElement;
  let currentTurn = 0;
  let raceName = '';
  let buildingCounts: Record<string, number> = {};

  // Subscribe to game state
  const unsubscribe = gameState.subscribe((state) => {
    currentTurn = state.turn;
    raceName = state.race.name;
    buildingCounts = state.buildingCounts || {};
  });

  // Check if research screen should be available
  $: hasLibrary = (buildingCounts['sages_library'] || 0) > 0;

  // Placeholder ASCII map - will be replaced with actual world generation
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
</script>

<div class="main-screen">
  <div class="screen-header">
    <div class="header-spacer"></div>
    <div class="header-content">
      <h2>World of {raceName}</h2>
    </div>
  </div>

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
      <button class="control-btn" on:click={() => uiState.setScreen('building')}>🏗️ Build</button>
      <button
        class="control-btn"
        class:disabled={!hasLibrary}
        on:click={() => hasLibrary && uiState.setScreen('research')}
        disabled={!hasLibrary}
        title={hasLibrary
          ? 'Access research projects'
          : "Build a Sage's Library to unlock research"}
      >
        📚 Research
      </button>
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
    background-color: #1a1a1a;
  }

  .screen-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    background: linear-gradient(135deg, #2a2a2a, #1e1e1e);
    border-bottom: 2px solid #4caf50;
  }

  .header-spacer {
    flex: 1;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .header-content h2 {
    margin: 0;
    color: #4caf50;
    font-size: 1.4em;
    text-shadow: 0 0 10px rgba(76, 175, 80, 0.3);
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

  .ascii-map:focus {
    outline: none;
    border-color: #81c784;
  }

  .map-controls {
    display: flex;
    justify-content: space-between;
    padding: 15px 20px;
    background: #2a2a2a;
    border-top: 1px solid #444;
  }

  .view-controls {
    display: flex;
    gap: 10px;
  }

  .control-btn {
    padding: 8px 16px;
    background: #333;
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

  .control-btn:active:not(.disabled) {
    background: #555;
    transform: translateY(1px);
  }

  .control-btn.disabled {
    background: #222;
    border-color: #333;
    color: #666;
    cursor: not-allowed;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .ascii-map {
      font-size: 10px;
      padding: 15px;
    }

    .map-controls {
      flex-direction: column;
      gap: 10px;
    }

    .view-controls {
      justify-content: center;
    }

    .header-content {
      flex-direction: column;
      gap: 10px;
    }
  }
</style>
