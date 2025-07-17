<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { getNeedColor, getNeedDescription } from '$lib/utils/pawnUtils';
  import { gameEngine } from '$lib/game/systems/GameEngineImpl';

  export let pawn: Pawn;

  // LIVE DATA from GameEngine (updated every turn)
  $: needs = gameEngine.getPawnNeeds(pawn.id);
  $: activities = gameEngine.getPawnActivities(pawn.id);
  $: needStatus = gameEngine.getPawnNeedStatus(pawn.id);

  // Helper function to check if pawn is doing a specific activity
  function isDoingActivity(activityName: string): boolean {
    return activities.some((activity) =>
      activity.toLowerCase().includes(activityName.toLowerCase())
    );
  }
</script>

<div class="needs-section" id="needs">
  <h3>🏥 Current Needs & State</h3>
  <div class="needs-grid">
    <!-- HUNGER CARD -->
    <div class="need-card">
      <div class="need-header">
        <span class="need-name">🍖 Hunger</span>
        <span class="need-value" style="color: {getNeedColor(needs.hunger)}">
          {Math.round(needs.hunger)}%
        </span>
      </div>
      <div class="need-bar">
        <div
          class="need-fill"
          style="width: {needs.hunger}%; background-color: {getNeedColor(needs.hunger)}"
        ></div>
      </div>
      <p class="need-description">
        {getNeedDescription('hunger', needs.hunger)}
      </p>
    </div>

    <!-- REST CARD (renamed from Fatigue, using fatigue data) -->
    <div class="need-card">
      <div class="need-header">
        <span class="need-name">😴 Rest</span>
        <span class="need-value" style="color: {getNeedColor(needs.fatigue)}">
          {Math.round(needs.fatigue)}%
        </span>
      </div>
      <div class="need-bar">
        <div
          class="need-fill"
          style="width: {needs.fatigue}%; background-color: {getNeedColor(needs.fatigue)}"
        ></div>
      </div>
      <p class="need-description">
        {getNeedDescription('fatigue', needs.fatigue)}
      </p>
    </div>

    <!-- REMOVED: Sleep card - no longer needed -->
  </div>

  <!-- ACTIVITIES SECTION -->
  <div class="activities-section">
    <h4>Current Activities</h4>
    <div class="activities-list">
      <!-- UPDATED: Use live activities data -->
      {#each activities as activity}
        <div class="activity-item active">
          <span class="activity-icon">
            {#if activity.includes('Working')}🔨
            {:else if activity.includes('Sleeping') || activity.includes('Resting')}😴
            {:else if activity.includes('Eating')}🍽️
            {:else if activity.includes('Critical')}🚨
            {:else}⚡
            {/if}
          </span>
          <span class="activity-name">{activity}</span>
          <span class="activity-status">Active</span>
        </div>
      {/each}

      <!-- Show idle state if no activities -->
      {#if activities.length === 0}
        <div class="activity-item">
          <span class="activity-icon">😴</span>
          <span class="activity-name">Idle</span>
          <span class="activity-status">Inactive</span>
        </div>
      {/if}

      <!-- UPDATED: Show need status warnings -->
      {#if needStatus.critical.length > 0}
        <div class="activity-item critical">
          <span class="activity-icon">🚨</span>
          <span class="activity-name">Critical Needs</span>
          <span class="activity-status">{needStatus.critical.join(', ')}</span>
        </div>
      {/if}

      {#if needStatus.warning.length > 0}
        <div class="activity-item warning">
          <span class="activity-icon">⚠️</span>
          <span class="activity-name">Warning Needs</span>
          <span class="activity-status">{needStatus.warning.join(', ')}</span>
        </div>
      {/if}
    </div>

    <!-- ACTIVITY CONTROLS -->
    <div class="activity-controls">
      <h5>Force Activity</h5>
      <div class="control-buttons">
        <button
          class="control-btn"
          on:click={() => gameEngine.forcePawnActivity(pawn.id, 'sleeping')}
          disabled={isDoingActivity('sleeping') || isDoingActivity('resting')}
        >
          😴 Force Rest
        </button>
        <button
          class="control-btn"
          on:click={() => gameEngine.forcePawnActivity(pawn.id, 'eating')}
          disabled={isDoingActivity('eating')}
        >
          🍽️ Force Eat
        </button>
        <button
          class="control-btn"
          on:click={() => gameEngine.forcePawnActivity(pawn.id, 'working')}
          disabled={isDoingActivity('working')}
        >
          🔨 Force Work
        </button>
        <button
          class="control-btn"
          on:click={() => gameEngine.forcePawnActivity(pawn.id, 'idle')}
          disabled={activities.length === 0}
        >
          ⏸️ Set Idle
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .needs-section {
    margin-bottom: 30px;
    padding: 25px;
    background: #0c0c0c;
    border-radius: 8px;
    border: 1px solid #333;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  }

  .needs-section h3 {
    font-size: 1.4em;
    color: #ff5722;
    margin: 0 0 25px 0;
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    text-shadow: 0 0 10px rgba(255, 87, 34, 0.3);
  }

  .needs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .need-card {
    padding: 20px;
    background: #000000;
    border: 1px solid #333;
    border-radius: 8px;
    transition: all 0.3s ease;
  }

  .need-card:hover {
    transform: translateY(-2px);
    border-color: #ff5722;
    box-shadow: 0 0 15px rgba(255, 87, 34, 0.2);
  }

  .need-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
  }

  .need-name {
    font-size: 1.1em;
    font-weight: 600;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .need-value {
    font-size: 1.2em;
    font-weight: bold;
    text-shadow: 0 0 5px currentColor;
  }

  .need-bar {
    width: 100%;
    height: 12px;
    background: #1a1a1a;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 15px;
    border: 1px solid #333;
  }

  .need-fill {
    height: 100%;
    transition: all 0.3s ease;
    border-radius: 6px;
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
  }

  .need-description {
    color: #cccccc;
    font-size: 0.95em;
    margin: 0;
    font-style: italic;
  }

  .activities-section h4 {
    font-size: 1.2em;
    color: #ff5722;
    margin: 0 0 15px 0;
    font-weight: 600;
  }

  .activities-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 20px;
  }

  .activity-item {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 15px 20px;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    transition: all 0.3s ease;
  }

  .activity-item:hover {
    background: #222222;
    border-color: #555;
  }

  .activity-item.active {
    background: #0d4f3c;
    border-color: #4caf50;
    box-shadow: 0 0 10px rgba(76, 175, 80, 0.2);
  }

  .activity-item.critical {
    background: #4f0d0d;
    border-color: #f44336;
    box-shadow: 0 0 10px rgba(244, 67, 54, 0.2);
  }

  .activity-item.warning {
    background: #4f3c0d;
    border-color: #ff9800;
    box-shadow: 0 0 10px rgba(255, 152, 0, 0.2);
  }

  .activity-icon {
    font-size: 1.3em;
    width: 30px;
    text-align: center;
  }

  .activity-name {
    flex: 1;
    font-weight: 600;
    color: #ffffff;
  }

  .activity-status {
    font-size: 0.9em;
    padding: 4px 12px;
    border-radius: 12px;
    font-weight: 500;
  }

  .activity-item:not(.active) .activity-status {
    background: #333;
    color: #999;
  }

  .activity-item.active .activity-status {
    background: #4caf50;
    color: #ffffff;
    text-shadow: 0 0 5px rgba(76, 175, 80, 0.5);
  }

  .activity-item.critical .activity-status {
    background: #f44336;
    color: #ffffff;
  }

  .activity-item.warning .activity-status {
    background: #ff9800;
    color: #ffffff;
  }

  /* Activity Control Styles */
  .activity-controls {
    border-top: 1px solid #333;
    padding-top: 20px;
  }

  .activity-controls h5 {
    color: #ff5722;
    margin: 0 0 15px 0;
    font-size: 1.1em;
    font-weight: 600;
  }

  .control-buttons {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
  }

  .control-btn {
    padding: 8px 12px;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 6px;
    color: #ffffff;
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .control-btn:hover:not(:disabled) {
    background: #333;
    border-color: #ff5722;
  }

  .control-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
