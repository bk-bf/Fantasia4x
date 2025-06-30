<script lang="ts">
  import { browser } from '$app/environment';
  import { gameState, currentTurn } from '$lib/stores/gameState';
  import { onMount, onDestroy } from 'svelte';

  let isPaused = false;
  let gameSpeed = 1;
  let currentTurnValue = 0;

  // Subscribe to game state
  const unsubscribePaused = gameState.isPaused.subscribe((value) => {
    isPaused = value;
  });

  const unsubscribeSpeed = gameState.gameSpeed.subscribe((value) => {
    gameSpeed = value;
  });

  const unsubscribeTurn = currentTurn.subscribe((value) => {
    currentTurnValue = value;
  });

  // Keyboard controls - only run in browser
  function handleKeydown(event: KeyboardEvent) {
    if (event.code === 'Space') {
      event.preventDefault();
      gameState.togglePause();
    }
  }

  onMount(() => {
    // Only run client-side code in onMount
    if (browser) {
      // Start the auto-turn system when component mounts
      gameState.startAutoTurns();

      // Add keyboard listener
      window.addEventListener('keydown', handleKeydown);
    }
  });

  onDestroy(() => {
    // Clean up - check browser first
    if (browser) {
      gameState.stopAutoTurns();
      window.removeEventListener('keydown', handleKeydown);
    }

    // These are safe to call on server
    unsubscribePaused();
    unsubscribeSpeed();
    unsubscribeTurn();
  });

  function handleSpeedChange(newSpeed: number) {
    gameState.setGameSpeed(newSpeed);
  }

  // Add these functions to GameControls
  function saveGame() {
    // Trigger a manual save
    gameState.update((state) => state);
  }

  function loadGame() {
    if (confirm('Load saved game? Current progress will be lost.')) {
      location.reload();
    }
  }
  function wipeSave() {
    if (confirm('This will delete your save data and restart the game. Are you sure?')) {
      localStorage.removeItem('fantasia4x-save');
      location.reload();
    }
  }
</script>

<div class="game-controls">
  <div class="turn-info">
    <span class="turn-label">Day:</span>
    <span class="turn-number">{currentTurnValue}</span>
    <div class="turn-status" style="min-width: 210px; display: flex; align-items: center;">
      {#if !isPaused}
        <span class="status-indicator running">●</span>
        <span class="status-text">Resources harvesting...</span>
      {:else}
        <span class="status-indicator paused">●</span>
        <span class="status-text">Production paused</span>
      {/if}
    </div>
    <div class="control-buttons">
      <button
        class="pause-btn"
        class:paused={isPaused}
        on:click={gameState.togglePause}
        title="Press SPACE to toggle"
        style="min-width: 80px;"
      >
        <span style="display: inline-block; width: 2.5em; text-align: center;">
          {isPaused ? '▶️' : '⏸️'}
        </span>
        <span style="display: inline-block; width: 5em; text-align: left;">
          {isPaused ? 'Resume' : 'Pause'}
        </span>
      </button>

      <div class="speed-controls">
        <span class="speed-label">Speed:</span>
        {#each [1, 2, 4] as speed}
          <button
            class="speed-btn"
            class:active={gameSpeed === speed}
            on:click={() => handleSpeedChange(speed)}
            title="{speed} speed"
          >
            {speed}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="game-info">
    <div class="save-controls">
      <button class="control-btn" on:click={saveGame}>💾 Save</button>
      <button class="control-btn" on:click={loadGame}>📁 Load</button>
      <button class="control-btn danger-btn" on:click={wipeSave}>🗑️ Wipe Save</button>
    </div>
  </div>
</div>

<!-- Keep the same styles as before -->
<style>
  .danger-btn {
    background: #d32f2f !important;
    border-color: #f44336 !important;
    color: white !important;
  }

  .danger-btn:hover {
    background: #f44336 !important;
  }

  .game-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 15px 20px;
    background: linear-gradient(135deg, #2a2a2a, #1e1e1e);
    border-bottom: 2px solid #4caf50;
    font-family: 'Courier New', monospace;
    color: #e0e0e0;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  }

  .turn-info {
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .turn-label {
    color: #888;
    font-size: 0.9em;
  }

  .turn-number {
    font-weight: bold;
    color: #4caf50;
    font-size: 1.4em;
    text-shadow: 0 0 10px rgba(76, 175, 80, 0.3);
  }

  .turn-status {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-indicator {
    font-size: 0.8em;
  }

  .status-indicator.running {
    color: #4caf50;
    animation: pulse 2s infinite;
  }

  .status-indicator.paused {
    color: #f44336;
  }

  .status-text {
    font-size: 0.85em;
    color: #888;
  }

  .control-buttons {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .pause-btn {
    padding: 10px 20px;
    background: #444;
    border: 2px solid #4caf50;
    color: #e0e0e0;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.3s ease;
    font-weight: bold;
    font-size: 1em;
  }

  .pause-btn:hover {
    background: #555;
    border-color: #4caf50;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  }

  .pause-btn.paused {
    background: #4caf50;
    border-color: #4caf50;
    color: white;
  }

  .pause-btn.paused:hover {
    background: #4caf50;
  }

  .speed-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .speed-label {
    color: #888;
    font-size: 0.9em;
  }

  .speed-btn {
    padding: 6px 12px;
    background: #333;
    border: 1px solid #555;
    color: #e0e0e0;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    min-width: 35px;
    transition: all 0.2s ease;
  }

  .speed-btn:hover {
    background: #444;
    border-color: #4caf50;
  }

  .speed-btn.active {
    background: #4caf50;
    border-color: #66bb6a;
    color: white;
    font-weight: bold;
  }

  .game-info {
    display: flex;
    align-items: center;
  }

  .next-turn-timer {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #333;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid #555;
  }

  .timer-label {
    color: #888;
    font-size: 0.85em;
  }

  .timer-value {
    color: #4caf50;
    font-weight: bold;
  }

  @keyframes pulse {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
    100% {
      opacity: 1;
    }
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .game-controls {
      flex-direction: column;
      gap: 15px;
      padding: 15px;
    }

    .control-buttons {
      flex-direction: column;
      gap: 10px;
    }
  }
</style>
