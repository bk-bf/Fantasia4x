<script lang="ts">
  import { currentStockpile, currentRace, gameState } from '$lib/stores/gameState';
  import { onDestroy } from 'svelte';

  let stockpile: { id: string; name: string; amount: number; color?: string; emoji?: string }[] = [];
  let race: any = null;
  let turnValue = 0;
  let itemChanges: Record<string, number> = {};

  const unsubStockpile = currentStockpile.subscribe((newStockpile) => {
    newStockpile.forEach((ni) => {
      const old = stockpile.find((i) => i.id === ni.id);
      if (old && old.amount !== ni.amount) {
        const delta = ni.amount - old.amount;
        if (delta !== 0) {
          itemChanges[ni.id] = delta;
          setTimeout(() => {
            itemChanges[ni.id] = 0;
          }, 2500);
        }
      }
    });
    stockpile = newStockpile;
  });

  const unsubRace = currentRace.subscribe((v) => (race = v));
  const unsubState = gameState.subscribe((s) => (turnValue = s.turn));

  onDestroy(() => {
    unsubStockpile();
    unsubRace();
    unsubState();
  });
</script>

<aside class="sidebar">
  {#if race}
    <!-- Kingdom section -->
    <div class="section-hdr">| KINGDOM</div>
    <div class="rows">
      <div class="row">
        <span class="lbl">SETTLEMENT</span>
        <span class="val hi">{race.name}</span>
      </div>
      <div class="row">
        <span class="lbl">POPULATION</span>
        <span class="val">{race.population}</span>
      </div>
      <div class="row">
        <span class="lbl">TURN</span>
        <span class="val">{turnValue}</span>
      </div>
    </div>

    <!-- Resources section -->
    <div class="section-hdr top-sep">| RESOURCES</div>
    <div class="res-list">
      {#if stockpile.length === 0}
        <div class="empty">no resources gathered</div>
      {:else}
        {#each stockpile as item}
          <div class="res-row">
            <span class="res-name">{item.name}</span>
            <span class="dots"></span>
            <span class="res-amt" style="color:{item.color || 'var(--text)'}">
              {Math.floor(item.amount)}
            </span>
            {#if itemChanges[item.id]}
              <span
                class="delta"
                class:pos={itemChanges[item.id] > 0}
                class:neg={itemChanges[item.id] < 0}
              >
                {itemChanges[item.id] > 0 ? '+' : ''}{Math.floor(itemChanges[item.id])}
              </span>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {:else}
    <div class="empty">loading...</div>
  {/if}
</aside>

<style>
  .sidebar {
    height: 100%;
    width: 100%;
    background: var(--bg-panel);
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: var(--text);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .section-hdr {
    padding: 4px 8px 3px;
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    flex-shrink: 0;
  }

  .top-sep {
    margin-top: 4px;
    border-top: 1px solid var(--border);
  }

  .rows {
    padding: 2px 0;
  }

  .row {
    display: flex;
    align-items: baseline;
    padding: 2px 8px;
    gap: 4px;
  }
  .row:hover {
    background: var(--bg-hover);
  }

  .lbl {
    color: var(--text-dim);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .val {
    margin-left: auto;
    color: var(--text);
    text-align: right;
    white-space: nowrap;
  }
  .val.hi {
    color: var(--accent-hi);
  }

  /* Resources */
  .res-list {
    padding: 2px 0;
    flex: 1;
  }

  .res-row {
    display: flex;
    align-items: baseline;
    padding: 1px 8px;
    gap: 3px;
  }
  .res-row:hover {
    background: var(--bg-hover);
  }

  .res-name {
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
    font-size: 11px;
  }

  .dots {
    flex: 1;
    border-bottom: 1px dotted var(--text-muted);
    margin: 0 3px 2px;
    min-width: 4px;
  }

  .res-amt {
    font-weight: bold;
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 10px;
  }

  .delta {
    font-size: 9px;
    flex-shrink: 0;
    animation: fadeout 2.5s ease-out forwards;
  }
  .delta.pos {
    color: var(--pos);
  }
  .delta.neg {
    color: var(--neg);
  }

  @keyframes fadeout {
    0% {
      opacity: 1;
    }
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  .empty {
    padding: 8px;
    color: var(--text-muted);
    font-size: 9px;
    font-style: italic;
  }
</style>
