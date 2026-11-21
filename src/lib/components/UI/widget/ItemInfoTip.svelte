<script lang="ts">
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import type { ItemInfoView } from '$lib/components/util/itemInfo';

  let {
    info: h,
    x,
    y,
    pinned
  }: { info: ItemInfoView; x: number; y: number; pinned: boolean } = $props();
</script>

<HoverTip {x} {y} {pinned}>
  <div class="tip-name" style="color: {h.color}">{h.name.toUpperCase()}</div>
  {#if h.description}
    <div class="tip-desc">{h.description}</div>
  {/if}
  {#if h.freshness || h.condition != null}
    <div class="tip-row tip-life">
      {#if h.freshness}<span>fresh ~{h.freshness}</span>{/if}
      {#if h.condition != null}<span>cond {h.condition}</span>{/if}
    </div>
  {/if}
  {#if h.farming}
    <div class="tip-hdr">FARMING · {h.farming.crop}</div>
    {#each h.farming.rows as r (r.label)}
      <div class="tip-row tip-farm">
        <span class="tip-dim">{r.label}</span><span>{r.val}</span>
      </div>
    {/each}
  {/if}
  {#if h.craftedInto.length > 0}
    <div class="tip-hdr">CRAFTS INTO</div>
    <div class="tip-row">{h.craftedInto.join(' · ')}</div>
  {/if}
  {#if h.buildsInto.length > 0}
    <div class="tip-hdr">BUILDS</div>
    <div class="tip-row">{h.buildsInto.join(' · ')}</div>
  {/if}
  {#if h.craftedInto.length === 0 && h.buildsInto.length === 0}
    <div class="tip-row tip-dim">— not used in any recipe</div>
  {/if}
</HoverTip>

<style>
  .tip-name {
    font-weight: bold;
    letter-spacing: 0.04em;
  }
  .tip-desc {
    color: var(--text-muted);
    font-style: italic;
    margin: 3px 0;
  }
  .tip-hdr {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.08em;
    margin-top: 4px;
  }
  .tip-row {
    color: var(--text);
    font-size: 11px;
  }
  .tip-life {
    color: var(--text-muted);
    display: flex;
    gap: 10px;
    margin-top: 2px;
  }
  .tip-dim {
    color: var(--text-dim);
    font-style: italic;
  }
  .tip-farm {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .tip-farm .tip-dim {
    font-style: normal;
  }
</style>
