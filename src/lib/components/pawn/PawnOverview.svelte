<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import {
    getMoodColor,
    getMoodDescription,
    getHealthColor,
    getHealthDescription
  } from '$lib/utils/pawnUtils';

  export let pawn: Pawn;
</script>

<!-- Pawn Overview -->
<div class="pawn-overview" id="overview">
  <div class="pawn-info-card">
    <h3>👤 {pawn.name}</h3>
    <div class="overview-stats">
      <div class="overview-item">
        <span class="overview-label">Height:</span>
        <span class="overview-value">{pawn.physicalTraits.height}cm</span>
      </div>
      <div class="overview-item">
        <span class="overview-label">Weight:</span>
        <span class="overview-value">{pawn.physicalTraits.weight}kg</span>
      </div>
      <div class="overview-item">
        <span class="overview-label">Size:</span>
        <span class="overview-value">{pawn.physicalTraits.size}</span>
      </div>
      <div class="overview-item">
        <span class="overview-label">Current Work:</span>
        <span class="overview-value">{pawn.currentWork || 'None'}</span>
      </div>
    </div>

    <!-- Status Overview -->
    <div class="status-overview">
      <div class="status-item">
        <span class="status-label">Mood:</span>
        <span class="status-value" style="color: {getMoodColor(pawn.state.mood)}">
          {pawn.state.mood}% - {getMoodDescription(pawn.state.mood)}
        </span>
      </div>
      <div class="status-item">
        <span class="status-label">Health:</span>
        <span class="status-value" style="color: {getHealthColor(pawn.state.health)}">
          {pawn.state.health}% - {getHealthDescription(pawn.state.health)}
        </span>
      </div>
    </div>
  </div>
</div>

<style>
  .pawn-overview {
    margin-bottom: 2rem;
  }

  .pawn-info-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 1.5rem;
  }

  .pawn-info-card h3 {
    margin: 0 0 1rem 0;
    color: #fff;
    font-size: 1.5rem;
  }

  .overview-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .overview-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
  }

  .overview-label {
    color: #ccc;
    font-weight: 500;
  }

  .overview-value {
    color: #fff;
    font-weight: 600;
  }

  .status-overview {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
  }

  .status-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
  }

  .status-label {
    color: #ccc;
    font-weight: 500;
  }

  .status-value {
    font-weight: 600;
  }
</style>
