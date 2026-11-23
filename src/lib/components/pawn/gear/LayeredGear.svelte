<script lang="ts">
  import type { EquipmentSlot, ItemInstance, Pawn } from '$lib/game/core/types';
  import { gameCoordinator } from '$lib/game/systems/GameCoordinator';
  import { blockedSlots } from '$lib/game/core/rules/gear/equipment';
  import { gameState } from '$lib/stores/gameState';
  import HoverTip from '$lib/components/UI/tooltip/HoverTip.svelte';
  import ItemStatTooltip from '$lib/components/UI/tooltip/ItemStatTooltip.svelte';
  import LayerCard from './LayerCard.svelte';
  import LayerTip from './LayerTip.svelte';
  import GearFoot from './GearFoot.svelte';
  import {
    TRINKET_SLOTS,
    gearCards,
    innateGear,
    outermost,
    slotLayer,
    type GearLayer
  } from '../gearLayers';

  let {
    pawn,
    onUnequip,
    onTogglePin,
    loading = false
  }: {
    pawn: Pawn;
    onUnequip: (slot: EquipmentSlot) => void;
    onTogglePin?: (itemId: string) => void;
    loading?: boolean;
  } = $props();

  const innate = $derived(innateGear(pawn));
  const cards = $derived(gearCards(pawn, innate.occupants));
  const trinkets = $derived.by(() => {
    const blocked = blockedSlots(pawn);
    return TRINKET_SLOTS.map((slot) => slotLayer(pawn, slot, blocked));
  });
  const isPinned = (itemId: string) => (pawn.pinnedItems ?? []).includes(itemId);

  let picked: Record<string, number> = $state({});
  const shownOf = (i: number) => picked[`${pawn.id}:${i}`] ?? outermost(cards[i]);

  let hover: { i: number; x: number; y: number } | null = $state(null);
  let stat: { layer: GearLayer; x: number; y: number } | null = $state(null);

  function onCard(i: number, e: MouseEvent | null) {
    hover = e ? { i, x: e.clientX, y: e.clientY } : null;
  }

  function icon(layer: GearLayer | null, e?: MouseEvent) {
    stat =
      layer && e && (layer.def || layer.innate?.tip) ? { layer, x: e.clientX, y: e.clientY } : null;
  }

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  function coating(inst: ItemInstance | undefined) {
    if (!inst?.coating || inst.coating.expiresAtTurn <= $gameState.turn) return null;
    const def = gameCoordinator.getItemById(inst.coating.itemId);
    const cond = def?.coatingEffect?.condition;
    return { name: def?.name ?? 'Coating', effect: cond ? `${cap(cond)} on hit` : 'on-hit effect' };
  }
</script>

<div class="slots">
  {#each cards as card, i (card.label)}
    <LayerCard
      {card}
      shown={shownOf(i)}
      hovered={hover?.i === i}
      {loading}
      {isPinned}
      onShow={(n) => (picked[`${pawn.id}:${i}`] = n)}
      onPin={onTogglePin}
      onDrop={onUnequip}
      onCard={(e) => onCard(i, e)}
      onIcon={icon}
    />
  {/each}
</div>
<GearFoot
  innate={innate.loose}
  {trinkets}
  {loading}
  {isPinned}
  onPin={onTogglePin}
  onDrop={onUnequip}
  onIcon={icon}
/>

{#if stat}
  {@const tip = stat.layer.def ?? stat.layer.innate?.tip}
  {#if tip}
    <ItemStatTooltip
      item={tip}
      natural={stat.layer.def ? undefined : stat.layer.innate?.meta}
      coating={stat.layer.def ? coating(stat.layer.inst) : null}
      x={stat.x}
      y={stat.y}
    />
  {/if}
{:else if hover}
  <HoverTip x={hover.x} y={hover.y}><LayerTip card={cards[hover.i]} /></HoverTip>
{/if}

<style>
  .slots {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
  }
</style>
