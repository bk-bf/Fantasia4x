<script lang="ts">
  import type { EquipmentSlot } from '$lib/game/core/types';
  import { chrome } from '$lib/pixelArt/chrome';
  import { qualityColor } from '$lib/game/core/rules/gear/itemQuality';
  import SpriteIcon from '$lib/components/UI/widget/SpriteIcon.svelte';
  import PixelGlyph from '$lib/components/UI/widget/PixelGlyph.svelte';
  import SlotActions from './SlotActions.svelte';
  import type { GearLayer, Innate } from '../gearLayers';

  let {
    innate,
    trinkets,
    loading = false,
    isPinned,
    onPin,
    onDrop,
    onIcon
  }: {
    innate: Innate[];
    trinkets: GearLayer[];
    loading?: boolean;
    isPinned: (itemId: string) => boolean;
    onPin?: (itemId: string) => void;
    onDrop: (slot: EquipmentSlot) => void;
    onIcon: (layer: GearLayer | null, e?: MouseEvent) => void;
  } = $props();

  const asLayer = (n: Innate): GearLayer => ({
    slot: null,
    label: 'innate',
    ghost: '',
    blocked: false,
    innate: n
  });
</script>

<div class="foot">
  {#if innate.length}
    <em>Innate</em>
    {#each innate as n (n.name)}
      <span
        class="chip"
        role="note"
        title="{n.name}: {n.sub}"
        onmouseenter={(e) => onIcon(asLayer(n), e)}
        onmousemove={(e) => onIcon(asLayer(n), e)}
        onmouseleave={() => onIcon(null)}
        {@attach chrome('well')}
        ><PixelGlyph name={n.glyph} ramp="honey" /><span>{n.name}</span></span
      >
    {/each}
  {/if}
  <em class="tr-h">Trinkets</em>
  {#each trinkets as t (t.slot)}
    <span
      class="tr"
      class:empty={!t.def}
      role="note"
      title={t.def ? undefined : t.blocked ? `${t.label}: cannot be worn` : t.label}
      onmouseenter={(e) => onIcon(t, e)}
      onmousemove={(e) => onIcon(t, e)}
      onmouseleave={() => onIcon(null)}
      {@attach chrome('well')}
    >
      <SpriteIcon item={t.inst?.itemId ?? t.ghost} tint={qualityColor(t.inst?.quality)} px={20} />
      {#if t.slot && t.inst && t.def}
        <span class="acts">
          <SlotActions
            slot={t.slot}
            inst={t.inst}
            def={t.def}
            pinned={isPinned(t.inst.itemId)}
            {loading}
            {onPin}
            {onDrop}
          />
        </span>
      {/if}
    </span>
  {/each}
</div>

<style>
  .foot {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    white-space: nowrap;
  }
  em {
    margin-right: 3px;
    font-style: normal;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.4px;
  }
  .tr-h {
    margin-left: auto;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 7px 0 4px;
    cursor: help;
  }
  .tr {
    position: relative;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
  }
  .tr.empty :global(:is(.painted-icon, .sprite-icon)) {
    opacity: 0.25;
    filter: grayscale(1);
  }
  .acts {
    position: absolute;
    inset: 0;
    display: none;
    place-items: center;
  }
  .tr:hover .acts {
    display: grid;
  }
  .tr:hover:has(.acts) :global(:is(.painted-icon, .sprite-icon)) {
    visibility: hidden;
  }
</style>
