<script lang="ts">
  import { gameState, currentRace } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { researchService } from '$lib/game/services/ResearchService';
  import { buildingService } from '$lib/game/services/BuildingService';
  import { itemService } from '$lib/game/services/ItemService';
  import { onDestroy } from 'svelte';
  import CurrentTask from '$lib/components/UI/CurrentTask.svelte';

  let race: any = null;
  let availableResearch: any[] = [];
  let completedResearch: string[] = [];
  let currentResearch: any = null;
  let discoveredLore: any[] = [];
  // Item fetching methods
  $: getItemAmount = (itemId: string): number => $gameState?.stockpile?.[itemId] ?? 0;

  $: getInventoryAmount = (itemId: string): number => $gameState?.stockpile?.[itemId] ?? 0;

  const unsubscribeRace = currentRace.subscribe((value) => {
    race = value;
  });

  const unsubscribeGame = gameState.subscribe((state) => {
    completedResearch = state.completedResearch || [];
    currentResearch = state.currentResearch || null;
    discoveredLore = state.discoveredLore || [];

    if (race) {
      // ✅ Use service method instead
      availableResearch = researchService.getAvailableResearch(state);
    }
  });

  onDestroy(() => {
    unsubscribeRace();
    unsubscribeGame();
  });

  function startResearch(research: any) {
    gameState.command({ type: 'startResearch', payload: { researchId: research.id } });
  }

  function getCategoryIcon(category: string): string {
    switch (category) {
      case 'knowledge':
        return '📚';
      case 'crafting':
        return '⚒️';
      case 'building':
        return '🏗️';
      case 'military':
        return '⚔️';
      case 'exploration':
        return '🗺️';
      case 'social':
        return '👥';
      default:
        return '🔬';
    }
  }

  function getTierColor(tier: number): string {
    switch (tier) {
      case 0:
        return '#4CAF50'; // Green - basic
      case 1:
        return '#2196F3'; // Blue - advanced
      case 2:
        return '#9C27B0'; // Purple - expert
      default:
        return '#607D8B'; // Grey - unknown
    }
  }

  function cancelCurrentResearch() {
    if (!currentResearch) return;
    gameState.command({ type: 'cancelResearch' });
  }

  function getBuildingName(buildingId: string): string {
    const building = buildingService.getBuildingById(buildingId);
    return building ? building.name : buildingId;
  }

  function canStartResearch(research: any): boolean {
    if (currentResearch) return false;

    // ✅ Use service method
    return researchService.canStartResearch(research.id, $gameState);
  }
</script>

<div class="research-screen">
  <div class="screen-hdr">| RESEARCH</div>

  <!-- Materials -->
  <div class="section-hdr sub">| MATERIALS</div>
  {#each ['bark_scrolls', 'hide_scrolls', 'parchment', 'scholars_ink', 'research_notes'] as materialId}
    {@const amount = getInventoryAmount(materialId)}
    {@const item = itemService.getItemById(materialId)}
    {#if item}
      <div class="row">
        <span class="lbl">{(item?.name || materialId).toUpperCase()}</span>
        <span class="val" style="color: {amount > 0 ? 'var(--pos)' : 'var(--text-muted)'}"
          >{amount}</span
        >
      </div>
    {/if}
  {/each}

  <!-- Current Research -->
  <div class="section-hdr sub">| ACTIVE RESEARCH</div>
  {#if currentResearch}
    <div class="row">
      <span class="lbl">PROJECT</span><span class="val">{currentResearch.name.toUpperCase()}</span>
    </div>
    <div class="row">
      <span class="lbl">CATEGORY</span><span class="val">{currentResearch.category}</span>
    </div>
    {@const prog = Math.round(
      ((currentResearch.currentProgress || 0) / currentResearch.researchTime) * 100
    )}
    <div class="need-row">
      <span class="lbl">PROGRESS</span>
      <div class="bar">
        <div class="fill" style="width: {prog}%; background: var(--accent-hi)"></div>
      </div>
      <span class="val">{prog}%</span>
      <span class="desc"
        >{currentResearch.researchTime - (currentResearch.currentProgress || 0)} turns left</span
      >
    </div>
    <div class="btn-row">
      <button class="act-btn" on:click={cancelCurrentResearch}>CANCEL</button>
    </div>
  {:else}
    <div class="row"><span class="muted">no active research</span></div>
  {/if}

  <!-- Discovered Lore -->
  {#if discoveredLore.length > 0}
    <div class="section-hdr sub">| LORE ({discoveredLore.length})</div>
    {#each discoveredLore as lore}
      <div class="lore-name">{lore.name.toUpperCase()}</div>
      <div class="desc-row">{lore.description}</div>
      {#if lore.researchUnlocks?.length > 0}
        <div class="row">
          <span class="lbl">UNLOCKS</span><span class="val">{lore.researchUnlocks.join(', ')}</span>
        </div>
      {/if}
    {/each}
  {/if}

  <!-- Available Research -->
  <div class="section-hdr">| AVAILABLE ({availableResearch.length})</div>
  {#each availableResearch as research}
    <div class="research-item">
      <div class="research-name">
        {research.name.toUpperCase()}
        <span class="tier" style="color: {getTierColor(research.tier)}">T{research.tier}</span>
        <span class="cat">{research.category}</span>
      </div>
      <div class="row">
        <span class="lbl">TIME</span><span class="val">{research.researchTime} turns</span>
      </div>
      <div class="desc-row">{research.description}</div>

      {#if research.scrollRequirement}
        {#each Object.entries(research.scrollRequirement) as [scrollId, amount]}
          {@const item = itemService.getItemById(scrollId)}
          {@const have = getInventoryAmount(scrollId)}
          <div class="row req" class:insufficient={have < (amount as number)}>
            <span class="lbl">NEED</span>
            <span class="val" class:neg={have < (amount as number)}>
              {item?.name || scrollId}: {amount} (have {have})
            </span>
          </div>
        {/each}
      {/if}

      {#if research.materialRequirement}
        {#each Object.entries(research.materialRequirement) as [materialId, amount]}
          {@const item = itemService.getItemById(materialId)}
          {@const have = getItemAmount(materialId)}
          <div class="row req" class:insufficient={have < (amount as number)}>
            <span class="lbl">NEED</span>
            <span class="val" class:neg={have < (amount as number)}>
              {item?.name || materialId}: {amount} (have {have})
            </span>
          </div>
        {/each}
      {/if}

      {#if research.buildingRequired}
        <div class="row">
          <span class="lbl">BUILDING</span><span class="val"
            >{getBuildingName(research.buildingRequired)}</span
          >
        </div>
      {/if}

      {#if research.prerequisites.length > 0}
        <div class="row">
          <span class="lbl">PREREQ</span><span class="val">{research.prerequisites.join(', ')}</span
          >
        </div>
      {/if}

      <!-- Unlocks -->
      {#if research.unlocks}
        {#if research.unlocks.buildings?.length > 0}
          <div class="row">
            <span class="lbl">UNLOCKS</span><span class="val pos"
              >{research.unlocks.buildings
                .map((id: string) => getBuildingName(id))
                .join(', ')}</span
            >
          </div>
        {/if}
        {#if research.unlocks.items?.length > 0}
          <div class="row">
            <span class="lbl">ITEMS</span><span class="val pos"
              >{research.unlocks.items.join(', ')}</span
            >
          </div>
        {/if}
        {#if research.unlocks.effects}
          {#each Object.entries(research.unlocks.effects) as [effect, value]}
            <div class="row">
              <span class="lbl">EFFECT</span><span class="val pos">{effect}: +{value}</span>
            </div>
          {/each}
        {/if}
      {/if}

      <div class="btn-row">
        <button
          class="act-btn"
          class:active={canStartResearch(research)}
          on:click={() => startResearch(research)}
          disabled={!canStartResearch(research)}
        >
          {#if currentResearch}BUSY
          {:else if researchService.canUnlockWithLore(research.id, $gameState)}UNLOCK (LORE)
          {:else if canStartResearch(research)}BEGIN
          {:else}UNAVAILABLE
          {/if}
        </button>
      </div>
    </div>
  {/each}

  {#if availableResearch.length === 0}
    <div class="row"><span class="muted">no research available</span></div>
  {/if}
</div>

<style>
  .research-screen {
    height: 100%;
    overflow-y: auto;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 11px;
    display: flex;
    flex-direction: column;
  }

  .screen-hdr {
    padding: 5px 10px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
  }

  .section-hdr {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    border-top: 1px solid var(--border);
    margin-top: 1px;
  }
  .section-hdr.sub {
    background: var(--bg);
    color: var(--text-dim);
  }

  .row {
    display: flex;
    padding: 2px 8px;
    align-items: baseline;
    gap: 6px;
  }
  .row:hover {
    background: var(--bg-hover);
  }
  .row.insufficient {
    background: rgba(200, 48, 24, 0.05);
  }

  .need-row {
    display: flex;
    align-items: center;
    padding: 3px 8px;
    gap: 8px;
  }

  .lbl {
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
    width: 70px;
    flex-shrink: 0;
  }

  .val {
    color: var(--text);
    font-size: 11px;
    margin-left: auto;
    text-align: right;
  }
  .val.pos {
    color: var(--pos);
  }
  .val.neg {
    color: var(--neg);
  }

  .desc {
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    flex: 1;
  }

  .bar {
    flex: 1;
    height: 4px;
    background: var(--bg-active);
  }
  .fill {
    height: 100%;
  }

  .muted {
    color: var(--text-muted);
    font-style: italic;
    font-size: 11px;
    padding: 4px 8px;
  }
  .pos {
    color: var(--pos);
  }
  .neg {
    color: var(--neg);
  }

  /* Lore */
  .lore-name {
    padding: 3px 8px;
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    margin-top: 2px;
  }

  .desc-row {
    padding: 2px 8px 3px 16px;
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    border-bottom: 1px solid var(--border);
  }

  /* Research items */
  .research-item {
    border-bottom: 1px solid var(--border);
    padding-bottom: 2px;
    margin-bottom: 1px;
  }

  .research-name {
    padding: 4px 8px;
    color: var(--text);
    font-size: 11px;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
    background: var(--bg-panel);
    display: flex;
    gap: 8px;
    align-items: baseline;
  }

  .tier {
    font-size: 10px;
    letter-spacing: 0;
  }

  .cat {
    color: var(--text-muted);
    font-size: 10px;
    margin-left: auto;
  }

  .btn-row {
    display: flex;
    gap: 4px;
    padding: 4px 8px;
  }

  .act-btn {
    padding: 3px 10px;
    background: var(--bg-hover);
    border: 1px solid var(--border-hi);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 11px;
    cursor: pointer;
    letter-spacing: 0.04em;
  }
  .act-btn.active {
    background: var(--tab-active);
    color: #fff;
    border-color: var(--tab-active);
  }
  .act-btn:hover:not(:disabled) {
    color: var(--accent-hi);
    background: var(--bg-active);
  }
  .act-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
