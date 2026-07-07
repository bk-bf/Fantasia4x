<!-- StatTooltip.svelte — the shared stat breakdown panel (formula with this pawn's numbers, value vs the
     average, description, and trait contributions). Extracted from PawnAttributes so the attributes tab
     AND the trait card's stat/resistance pill render the IDENTICAL panel. Presentation only: the caller
     supplies the positioned box (the attributes cell's own .tip, or the trait card's HoverTip). -->
<script lang="ts">
  import type { StatView } from '$lib/components/util/statView';
  let { view }: { view: StatView } = $props();
</script>

<div class="stat-tip">
  <div class="tip-formula">{view.formula}</div>
  {#if view.vars.length}
    <div class="tip-where">
      {#each view.vars as vv, i}{i > 0 ? ',  ' : ''}<span class="tv-name">{vv.name}</span> =
        <span class="tv-val">{vv.value}</span>{/each}
    </div>
  {/if}
  <div class="tip-result">
    = <span class="tv-val">{view.value}{view.unit}</span>
    <span class="tip-cmp" style="color: {view.trend.color}">{view.trend.glyph}</span>
    <span class="tip-avg">vs avg {view.base}{view.unit}</span>
  </div>
  <div class="tip-desc">{view.description}</div>
  {#if view.traitMods.length}
    <div class="tip-traits">
      <span class="tip-thdr">TRAITS</span>
      {#each view.traitMods as m}
        <div class="tip-tmod">
          <span class="tm-name" class:neg={!m.pos}>{m.name}</span>
          <span class="tm-val">{m.text}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .stat-tip {
    color: var(--text);
    font-size: 11px;
    line-height: 1.5;
  }
  .tip-formula {
    color: var(--accent-hi);
  }
  .tip-where {
    margin-top: 3px;
    color: var(--text-dim);
  }
  .tv-name {
    color: var(--text);
  }
  .tv-val {
    color: #4caf50;
  }
  .tip-result {
    margin-top: 2px;
    color: var(--text-dim);
  }
  .tip-cmp {
    font-weight: bold;
  }
  .tip-avg {
    color: var(--text-dim);
  }
  .tip-desc {
    margin-top: 5px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
    color: var(--text-dim);
    font-style: italic;
  }
  .tip-traits {
    margin-top: 5px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
  }
  .tip-thdr {
    color: var(--text-dim);
    font-size: 9px;
    letter-spacing: 0.08em;
  }
  .tip-tmod {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .tm-name {
    color: var(--pos, #6bc);
  }
  .tm-name.neg {
    color: var(--neg, #e08);
  }
  .tm-val {
    color: var(--text);
  }
</style>
