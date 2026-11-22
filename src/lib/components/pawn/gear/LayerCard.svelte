<script lang="ts">
  import type { EquipmentSlot } from '$lib/game/core/types';
  import { chrome } from '$lib/pixelArt/chrome';
  import { qualityColor } from '$lib/game/core/rules/gear/itemQuality';
  import SpriteIcon from '$lib/components/UI/widget/SpriteIcon.svelte';
  import PixelGlyph from '$lib/components/UI/widget/PixelGlyph.svelte';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';
  import SlotActions from './SlotActions.svelte';
  import { isFilled, type GearCard, type GearLayer } from '../gearLayers';

  let {
    card,
    shown,
    hovered,
    loading = false,
    isPinned,
    onShow,
    onPin,
    onDrop,
    onCard,
    onIcon
  }: {
    card: GearCard;
    shown: number;
    hovered: boolean;
    loading?: boolean;
    isPinned: (itemId: string) => boolean;
    onShow: (i: number) => void;
    onPin?: (itemId: string) => void;
    onDrop: (slot: EquipmentSlot) => void;
    onCard: (el: HTMLElement | null) => void;
    onIcon: (layer: GearLayer | null, e?: MouseEvent) => void;
  } = $props();

  const layer = $derived(card.layers[shown] ?? card.layers[0]);
  const dur = $derived(
    layer.inst && layer.def ? layer.inst.durability / (layer.def.maxDurability ?? 100) : 0
  );
  const name = $derived(
    layer.def?.name ?? layer.innate?.name ?? (layer.blocked ? 'cannot be worn' : '—')
  );
</script>

<div
  class="card"
  class:empty={!isFilled(layer)}
  class:hover={hovered}
  role="group"
  aria-label={card.label}
  onmouseenter={(e) => onCard(e.currentTarget)}
  onmouseleave={() => onCard(null)}
  {@attach chrome('cell')}
>
  <span
    class="sq"
    role="presentation"
    onmouseenter={(e) => onIcon(layer, e)}
    onmousemove={(e) => onIcon(layer, e)}
    onmouseleave={() => onIcon(null)}
    {@attach chrome('well')}
  >
    {#if layer.innate}
      <PixelGlyph name={layer.innate.glyph} ramp="honey" />
    {:else}
      <SpriteIcon
        item={layer.inst?.itemId ?? layer.ghost}
        tint={qualityColor(layer.inst?.quality)}
        px={32}
      />
    {/if}
  </span>
  {#if layer.slot && layer.inst && layer.def}
    <span class="acts">
      <SlotActions
        slot={layer.slot}
        inst={layer.inst}
        def={layer.def}
        pinned={isPinned(layer.inst.itemId)}
        {loading}
        {onPin}
        {onDrop}
      />
    </span>
  {/if}
  <em>{card.label}</em>
  <b title={name}>{name}</b>
  {#if layer.def}
    <span class="bar"><SkinBar value={dur} ramp={dur < 0.5 ? 'ember' : 'leaf'} thin /></span>
  {:else}
    <i class="bar"></i>
  {/if}
  <span class="pips">
    {#if card.layers.length > 1}
      {#each card.layers as l, i (l.label)}
        <button
          class="pip"
          class:on={isFilled(l)}
          class:top={i === shown}
          title={l.label}
          onclick={() => onShow(i)}
          {@attach chrome(isFilled(l) ? 'cellOn' : 'well')}
        >
          {#if l.innate}<PixelGlyph name={l.innate.glyph} ramp="honey" />{:else if l.def}<SpriteIcon
              item={l.def.id}
              px={11}
            />{/if}
        </button>
      {/each}
    {/if}
  </span>
</div>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    min-width: 0;
    padding: 4px 3px 3px;
  }
  .card.hover {
    outline: 1px solid var(--ember);
    outline-offset: 1px;
  }
  .sq {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .empty .sq :global(:is(.painted-icon, .sprite-icon)) {
    opacity: 0.25;
    filter: grayscale(1);
  }
  .acts {
    position: absolute;
    top: 2px;
    right: 3px;
  }
  em {
    font-style: normal;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.2px;
    line-height: 15px;
  }
  b {
    max-width: 100%;
    font-weight: normal;
    line-height: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty b {
    color: var(--text-muted);
  }
  .bar {
    display: flex;
    width: 80%;
    height: 5px;
    margin: 2px 0;
  }
  .pips {
    display: flex;
    gap: 2px;
    height: 16px;
  }
  .pip {
    position: relative;
    display: grid;
    place-items: center;
    width: 15px;
    height: 15px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .pip:not(.on) {
    opacity: 0.55;
  }
  .pip.top {
    outline: 1px solid var(--ember);
    outline-offset: 1px;
  }
  .pip :global(.glyph) {
    width: 11px;
    height: 11px;
  }
</style>
