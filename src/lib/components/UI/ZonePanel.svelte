<!-- ZonePanel.svelte — Zone designation controls shown in the Building tab -->
<script lang="ts">
  import { uiState } from '$lib/stores/uiState';
  import { gameState } from '$lib/stores/gameState';

  /** Zone definitions shown to the player. */
  const ZONES = [
    {
      type: 'forage',
      label: 'FORAGE',
      icon: '🌿',
      desc: 'Pawns gather berries, twigs, bark and plant fiber',
      color: '#3aaa60'
    },
    {
      type: 'scavenge',
      label: 'SCAVENGE',
      icon: '🪨',
      desc: 'Pawns collect surface stone, flint and clay',
      color: '#a07840'
    },
    {
      type: 'stockpile',
      label: 'STOCKPILE',
      icon: '📦',
      desc: 'Haulers deposit carried resources here',
      color: '#e8a020'
    }
  ] as const;

  $: activeType = $uiState.designationType;
  $: designationActive = $uiState.designationActive;

  // Count tiles per zone type for display
  $: designationCounts = (() => {
    const counts: Record<string, number> = {};
    for (const type of Object.values($gameState.designations ?? {})) {
      counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  })();

  function toggle(type: string) {
    if (designationActive && activeType === type) {
      uiState.deactivateDesignation();
    } else {
      uiState.activateDesignation(type);
    }
  }

  function clearZone(type: string) {
    gameState.updateWithSave((state) => {
      const newDesignations = { ...(state.designations ?? {}) };
      for (const key of Object.keys(newDesignations)) {
        if (newDesignations[key] === type) delete newDesignations[key];
      }
      return { ...state, designations: newDesignations };
    });
  }
</script>

<div class="zone-panel">
  <div class="panel-hdr">| ZONES</div>
  <div class="hint">
    {#if designationActive}
      <span class="hint-active"
        >PAINTING [{activeType?.toUpperCase()}] — drag to fill · RMB to erase · click again to stop</span
      >
    {:else}
      click a zone type to start painting on the map
    {/if}
  </div>

  {#each ZONES as zone}
    {@const count = designationCounts[zone.type] ?? 0}
    {@const isActive = designationActive && activeType === zone.type}
    <div class="zone-row" class:active={isActive}>
      <button
        class="zone-btn"
        class:active={isActive}
        style="--zcolor: {zone.color}"
        on:click={() => toggle(zone.type)}
      >
        <span class="zone-icon">{zone.icon}</span>
        <span class="zone-label">{zone.label}</span>
        {#if count > 0}<span class="zone-count">{count}t</span>{/if}
      </button>
      <span class="zone-desc">{zone.desc}</span>
      {#if count > 0}
        <button
          class="clear-btn"
          on:click={() => clearZone(zone.type)}
          title="Clear all {zone.label} zones">✕</button
        >
      {/if}
    </div>
  {/each}
</div>

<style>
  .zone-panel {
    border-bottom: 1px solid #2a2010;
    padding-bottom: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .panel-hdr {
    font-family: var(--font-mono, monospace);
    color: var(--accent, #0f0);
    font-size: 0.75rem;
    margin-bottom: 0.35rem;
  }

  .hint {
    font-family: var(--font-mono, monospace);
    font-size: 0.65rem;
    color: #555;
    margin-bottom: 0.5rem;
  }

  .hint-active {
    color: #e8a020;
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0.5;
    }
  }

  .zone-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.3rem;
  }

  .zone-btn {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: #0d0d08;
    border: 1px solid #333;
    color: #888;
    font-family: var(--font-mono, monospace);
    font-size: 0.7rem;
    padding: 2px 7px;
    cursor: pointer;
    min-width: 110px;
    transition:
      border-color 0.15s,
      color 0.15s;
  }

  .zone-btn:hover {
    border-color: var(--zcolor);
    color: var(--zcolor);
  }

  .zone-btn.active {
    border-color: var(--zcolor);
    color: var(--zcolor);
    background: color-mix(in srgb, var(--zcolor) 12%, #000);
    box-shadow: 0 0 4px color-mix(in srgb, var(--zcolor) 40%, transparent);
  }

  .zone-icon {
    font-size: 0.85rem;
  }

  .zone-label {
    font-weight: bold;
    letter-spacing: 0.05em;
  }

  .zone-count {
    margin-left: auto;
    font-size: 0.65rem;
    color: inherit;
    opacity: 0.7;
  }

  .zone-desc {
    font-family: var(--font-mono, monospace);
    font-size: 0.65rem;
    color: #555;
    flex: 1;
  }

  .clear-btn {
    background: none;
    border: none;
    color: #555;
    cursor: pointer;
    font-size: 0.65rem;
    padding: 0 3px;
    line-height: 1;
  }

  .clear-btn:hover {
    color: #c04040;
  }
</style>
