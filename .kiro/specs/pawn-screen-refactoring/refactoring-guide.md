# PawnScreen Refactoring Guide - Steps 3-7

This guide continues the refactoring process from Step 3, breaking down the massive PawnScreen.svelte into manageable components.

## Prerequisites

✅ **Step 1 Complete**: Utility functions extracted to `/src/lib/utils/pawnUtils.ts`  
✅ **Step 2 Complete**: PawnSelector component created and integrated  

## Step 3: Extract PawnOverview Component

### Create the Component

````svelte
<!-- filepath: /Users/kirillboychenko/Documents/Coding_Projects/commercial_projects/video_games/Fantasia4x/src/lib/components/pawn/PawnOverview.svelte -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { getMoodColor, getMoodDescription, getHealthColor, getHealthDescription } from '$lib/utils/pawnUtils';
  
  export let pawn: Pawn;
</script>

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
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #4caf50;
  }

  .pawn-info-card h3 {
    color: #4caf50;
    margin: 0 0 15px 0;
    font-size: 1.5em;
  }

  .overview-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 15px;
    margin-bottom: 20px;
  }

  .overview-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .overview-label {
    color: #888;
    font-size: 0.9em;
  }

  .overview-value {
    color: #4caf50;
    font-weight: bold;
    font-size: 1.1em;
    text-transform: capitalize;
  }

  .status-overview {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 15px;
  }

  .status-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .status-label {
    color: #888;
    font-size: 0.9em;
  }

  .status-value {
    font-weight: bold;
    font-size: 1.1em;
  }

  @media (max-width: 768px) {
    .overview-stats,
    .status-overview {
      grid-template-columns: 1fr;
    }
  }
</style># PawnScreen Refactoring Guide - Steps 3-7

This guide continues the refactoring process from Step 3, breaking down the massive PawnScreen.svelte into manageable components.

## Prerequisites

✅ **Step 1 Complete**: Utility functions extracted to `/src/lib/utils/pawnUtils.ts`  
✅ **Step 2 Complete**: PawnSelector component created and integrated  

## Step 3: Extract PawnOverview Component

### Create the Component

````svelte
<!-- filepath: /Users/kirillboychenko/Documents/Coding_Projects/commercial_projects/video_games/Fantasia4x/src/lib/components/pawn/PawnOverview.svelte -->
<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { getMoodColor, getMoodDescription, getHealthColor, getHealthDescription } from '$lib/utils/pawnUtils';
  
  export let pawn: Pawn;
</script>

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
    background: #0c0c0c;
    border-radius: 8px;
    padding: 20px;
    border-left: 4px solid #4caf50;
  }

  .pawn-info-card h3 {
    color: #4caf50;
    margin: 0 0 15px 0;
    font-size: 1.5em;
  }

  .overview-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 15px;
    margin-bottom: 20px;
  }

  .overview-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .overview-label {
    color: #888;
    font-size: 0.9em;
  }

  .overview-value {
    color: #4caf50;
    font-weight: bold;
    font-size: 1.1em;
    text-transform: capitalize;
  }

  .status-overview {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 15px;
  }

  .status-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .status-label {
    color: #888;
    font-size: 0.9em;
  }

  .status-value {
    font-weight: bold;
    font-size: 1.1em;
  }

  @media (max-width: 768px) {
    .overview-stats,
    .status-overview {
      grid-template-columns: 1fr;
    }
  }
</style>