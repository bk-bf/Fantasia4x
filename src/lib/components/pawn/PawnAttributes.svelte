<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';
  import { chrome } from '$lib/pixelArt/chrome';
  import { attributeCategories, type AttrCell } from '$lib/components/util/attributeView';
  import AttrTip from './AttrTip.svelte';

  let { pawn }: { pawn: Pawn } = $props();

  const cats = $derived(attributeCategories(pawn, $gameState));
  let tip = $state<{ key: string; x: number; y: number } | null>(null);
  const shown = $derived<AttrCell | undefined>(
    tip ? cats.flatMap((c) => c.cells).find((c) => c.key === tip?.key) : undefined
  );
</script>

<div class="attrs">
  {#each cats as g (g.label)}
    <div class="dcat">
      <h5>{g.label}</h5>
      <div class="dcells">
        {#each g.cells as c (c.key)}
          <div
            class="dcell"
            role="note"
            onmouseenter={(e) => (tip = { key: c.key, x: e.clientX, y: e.clientY })}
            onmousemove={(e) => tip && (tip = { ...tip, x: e.clientX, y: e.clientY })}
            onmouseleave={() => (tip = null)}
            {@attach chrome('well')}
          >
            <em>{c.label}</em>
            <b class={c.trend}>{c.value}</b>
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

{#if tip && shown}
  <AttrTip {pawn} cell={shown} x={tip.x} y={tip.y} />
{/if}

<style>
  .attrs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font: 16px/18px var(--font-pixel);
    color: var(--text);
  }
  .dcat {
    display: grid;
    grid-template-columns: 76px 1fr;
    align-items: start;
    gap: 6px;
  }
  h5 {
    margin: 4px 0 0;
    font: inherit;
    color: var(--accent-hi);
    text-transform: uppercase;
    letter-spacing: 1.6px;
  }
  .dcells {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 2px;
  }
  .dcell {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 1px 7px 2px;
    white-space: nowrap;
    cursor: help;
  }
  .dcell:hover {
    z-index: 2;
  }
  em {
    font-style: normal;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  b {
    flex-shrink: 0;
    font-weight: normal;
  }
  b.up {
    color: var(--pos);
  }
  b.down {
    color: var(--neg);
  }
  b.up::after {
    content: ' ▲';
    font-size: 10px;
  }
  b.down::after {
    content: ' ▼';
    font-size: 10px;
  }
</style>
