<script lang="ts">
  import { qualityColor, qualityPrefix } from '$lib/game/core/rules/gear/itemQuality';
  import SpriteIcon from '$lib/components/UI/widget/SpriteIcon.svelte';
  import PixelGlyph from '$lib/components/UI/widget/PixelGlyph.svelte';
  import { isFilled, type GearCard } from '../gearLayers';

  let { card }: { card: GearCard } = $props();

  const worn = $derived(card.layers.filter((l) => l.slot && isFilled(l)).length);
  const slots = $derived(card.layers.filter((l) => l.slot).length);
  const pct = (cur: number, max = 100) => `${Math.round((cur / max) * 100)}%`;
</script>

<h5>{card.label} · {worn} of {slots} {slots === 1 ? 'layer' : 'layers'}</h5>
{#each card.layers as l (l.label)}
  <div class="row" class:empty={!isFilled(l)} class:innate={!!l.innate}>
    {#if l.innate}
      <PixelGlyph name={l.innate.glyph} ramp="honey" />
    {:else}
      <SpriteIcon item={l.inst?.itemId ?? l.ghost} tint={qualityColor(l.inst?.quality)} px={16} />
    {/if}
    <em>{l.label}</em>
    {#if l.innate}
      <b>{l.innate.name}</b><span>always</span>
    {:else if l.inst && l.def}
      {@const prefix = qualityPrefix(l.inst.quality)}
      <b
        >{#if prefix}<i style:color={qualityColor(l.inst.quality)}>{prefix}</i>
        {/if}{l.def.name}</b
      >
      <span class:low={l.inst.durability / (l.def.maxDurability ?? 100) < 0.5}
        >{pct(l.inst.durability, l.def.maxDurability)}</span
      >
    {:else}
      <b>{l.blocked ? 'cannot be worn' : 'nothing'}</b><span></span>
    {/if}
  </div>
{/each}

<style>
  .row {
    display: grid;
    grid-template-columns: 16px 64px 1fr auto;
    gap: 6px;
    align-items: center;
    height: 19px;
    white-space: nowrap;
  }
  em {
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.2px;
  }
  b {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text);
  }
  i {
    font-style: normal;
  }
  span {
    color: var(--text-dim);
  }
  .low {
    color: var(--ember);
  }
  .empty b,
  .empty :global(:is(.painted-icon, .sprite-icon)) {
    color: var(--text-muted);
    opacity: 0.5;
  }
  .innate {
    margin-top: 2px;
    padding-top: 2px;
    border-top: 1px dotted var(--text-muted);
  }
</style>
