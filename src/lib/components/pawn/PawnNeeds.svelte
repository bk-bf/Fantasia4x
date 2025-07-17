<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { getNeedColor, getNeedDescription } from '$lib/utils/pawnUtils';

  export let pawn: Pawn;
</script>

<div class="needs-section" id="needs">
  <h3>🏥 Current Needs & State</h3>
  <div class="needs-grid">
    <div class="need-card">
      <div class="need-header">
        <span class="need-name">🍖 Hunger</span>
        <span class="need-value" style="color: {getNeedColor(pawn.needs.hunger)}">
          {Math.round(pawn.needs.hunger)}%
        </span>
      </div>
      <div class="need-bar">
        <div
          class="need-fill"
          style="width: {pawn.needs.hunger}%; background-color: {getNeedColor(pawn.needs.hunger)}"
        ></div>
      </div>
      <p class="need-description">
        {getNeedDescription('hunger', pawn.needs.hunger)}
      </p>
    </div>

    <div class="need-card">
      <div class="need-header">
        <span class="need-name">😴 Fatigue</span>
        <span class="need-value" style="color: {getNeedColor(pawn.needs.fatigue)}">
          {Math.round(pawn.needs.fatigue)}%
        </span>
      </div>
      <div class="need-bar">
        <div
          class="need-fill"
          style="width: {pawn.needs.fatigue}%; background-color: {getNeedColor(pawn.needs.fatigue)}"
        ></div>
      </div>
      <p class="need-description">
        {getNeedDescription('fatigue', pawn.needs.fatigue)}
      </p>
    </div>

    <div class="need-card">
      <div class="need-header">
        <span class="need-name">🌙 Sleep</span>
        <span class="need-value" style="color: {getNeedColor(pawn.needs.sleep)}">
          {Math.round(pawn.needs.sleep)}%
        </span>
      </div>
      <div class="need-bar">
        <div
          class="need-fill"
          style="width: {pawn.needs.sleep}%; background-color: {getNeedColor(pawn.needs.sleep)}"
        ></div>
      </div>
      <p class="need-description">{getNeedDescription('sleep', pawn.needs.sleep)}</p>
    </div>
  </div>

  <!-- Current Activities -->
  <div class="activities-section">
    <h4>Current Activities</h4>
    <div class="activities-list">
      <div class="activity-item" class:active={pawn.state.isWorking}>
        <span class="activity-icon">🔨</span>
        <span class="activity-name">Working</span>
        <span class="activity-status">
          {pawn.state.isWorking ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div class="activity-item" class:active={pawn.state.isSleeping}>
        <span class="activity-icon">😴</span>
        <span class="activity-name">Sleeping</span>
        <span class="activity-status">
          {pawn.state.isSleeping ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div class="activity-item" class:active={pawn.state.isEating}>
        <span class="activity-icon">🍽️</span>
        <span class="activity-name">Eating</span>
        <span class="activity-status">
          {pawn.state.isEating ? 'Active' : 'Inactive'}
        </span>
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
</style>
