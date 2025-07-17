<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { getStatColor, getStatDescription } from '$lib/utils/pawnUtils';

  export let pawn: Pawn;
</script>

<div class="stats-section" id="stats">
  <h3>📊 Individual Stats</h3>
  <div class="stats-grid">
    {#each Object.entries(pawn.stats) as [statName, statValue]}
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-name">{statName.charAt(0).toUpperCase() + statName.slice(1)}</span>
          <span class="stat-value" style="color: {getStatColor(statValue)}">{statValue}</span>
        </div>
        <div class="stat-bar">
          <div
            class="stat-fill"
            style="width: {(statValue / 20) * 100}%; background-color: {getStatColor(statValue)}"
          ></div>
        </div>
        <p class="stat-description">{getStatDescription(statName, statValue)}</p>
      </div>
    {/each}
  </div>
</div>

<style>
  .stats-section {
    background: #0c0c0c;
    border-radius: 8px;
    padding: 25px;
    margin-bottom: 30px;
    border-left: 4px solid #2196f3;
  }

  .stats-section h3 {
    color: #2196f3;
    margin: 0 0 25px 0;
    font-size: 1.4em;
    text-shadow: 0 0 10px rgba(33, 150, 243, 0.3);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 15px;
  }

  .stat-card {
    background: #000000;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 20px;
    transition: all 0.3s ease;
  }

  .stat-card:hover {
    border-color: #2196f3;
    box-shadow: 0 0 15px rgba(33, 150, 243, 0.2);
  }

  .stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .stat-name {
    color: #2196f3;
    font-weight: bold;
    font-size: 1.1em;
  }

  .stat-value {
    font-family: monospace;
    font-weight: bold;
    font-size: 1.2em;
  }

  .stat-bar {
    height: 8px;
    background: #333;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 10px;
  }

  .stat-fill {
    height: 100%;
    transition: width 0.5s ease;
    border-radius: 4px;
  }

  .stat-description {
    color: #ccc;
    font-size: 0.9em;
    margin: 0;
    line-height: 1.4;
  }

  /* Mobile responsiveness */
  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
