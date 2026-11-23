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
    onCard: (e: MouseEvent | null) => void;
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
  onmouseenter={onCard}
  onmousemove={onCard}
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
        px={48}
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
  {#if card.layers.length > 1}
    <span class="pips">
      {#each card.layers as l, i (l.label)}
        <button
          class="pip"
          class:on={isFilled(l)}
          class:top={i === shown}
          title={l.label}
          aria-label={l.label}
          onclick={() => onShow(i)}
        ></button>
      {/each}
    </span>
  {/if}
</div>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    min-width: 0;
    padding: 4px 3px 9px;
  }
  .card.hover {
    outline: 1px solid var(--accent-hi);
    outline-offset: 1px;
  }
  .sq {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .sq :global(.glyph) {
    width: 26px;
    height: 26px;
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
    margin: 1px 0;
  }
  .pips {
    position: absolute;
    right: 4px;
    bottom: 3px;
    display: flex;
    gap: 2px;
  }
  .pip {
    width: 7px;
    height: 5px;
    padding: 0;
    border: 1px solid var(--text-muted);
    background: none;
    cursor: pointer;
  }
  .pip.on {
    border-color: var(--text-dim);
    background: var(--text-dim);
  }
  .pip.top {
    outline: 1px solid var(--accent-hi);
    outline-offset: 1px;
  }
</style>
