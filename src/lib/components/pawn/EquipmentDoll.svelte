<script lang="ts">
  import type { Pawn, EquipmentSlot, Item } from '$lib/game/core/types';
  import { gameCoordinator } from '$lib/game/systems/GameCoordinator';
  import ItemStatTooltip from '$lib/components/UI/tooltip/ItemStatTooltip.svelte';
  import SpriteIcon from '$lib/components/UI/widget/SpriteIcon.svelte';
  import { qualityPrefix, qualityColor } from '$lib/game/core/rules/gear/itemQuality';
  import { blockedSlots } from '$lib/game/core/rules/gear/equipment';
  import { naturalGearForTrait, type NaturalGearMeta } from '$lib/components/util/naturalGear';
  import { gameState } from '$lib/stores/gameState';
  import { chrome } from '$lib/pixelArt/chrome';
  import SkinBar from '$lib/components/UI/widget/SkinBar.svelte';

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

  const isPinned = (itemId: string) => (pawn.pinnedItems ?? []).includes(itemId);

  const SLOT_LABEL: Record<EquipmentSlot, string> = {
    head: 'Head',
    mainHand: 'Main Hand',
    bodyOuter: 'Outer',
    offHand: 'Off Hand',
    bodyMid: 'Mid',
    bodyBase: 'Skin',
    bracers: 'Arms',
    greaves: 'Legs',
    gloves: 'Hands',
    belt: 'Belt',
    boots: 'Feet',
    socks: 'Wraps',
    back: 'Cloak',
    back2: 'Pack',
    amulet: 'Amulet',
    ring: 'Ring',
    ring2: 'Ring'
  };
  const SLOTS: EquipmentSlot[] = Object.keys(SLOT_LABEL) as EquipmentSlot[];
  const GHOST: Record<EquipmentSlot, string> = {
    head: 'cured_hide_hood',
    mainHand: 'stone_axe',
    bodyOuter: 'wicker_vest',
    offHand: 'wattle_buckler',
    bodyMid: 'cured_hide_vest',
    bodyBase: 'linen_gambeson',
    bracers: 'orc_plate_vambraces',
    greaves: 'great_bone_greaves',
    gloves: 'stitched_gauntlets',
    belt: 'leather_belt',
    boots: 'hide_boots',
    socks: 'sackcloth_footwraps',
    back: 'wool_cloak',
    back2: 'woven_basket',
    amulet: 'tooth_necklace',
    ring: 'iron_signet_ring',
    ring2: 'iron_signet_ring'
  };

  function inst(slot: EquipmentSlot) {
    return pawn.equipment?.[slot];
  }

  const blocked = $derived(blockedSlots(pawn));

  type Nat = { name: string; sub: string; tip?: Item; meta?: NaturalGearMeta };
  const natural = $derived.by(() => {
    const occupants: Partial<Record<EquipmentSlot, Nat>> = {};
    const badges: Nat[] = [];
    for (const t of pawn.traits ?? []) {
      const g = naturalGearForTrait(t);
      if (!g) continue;
      const entry: Nat = { name: g.name, sub: g.sub, tip: g.item, meta: g.natural };
      const primary = t.blocksSlots?.[0];
      if (primary) occupants[primary] = entry;
      else badges.push(entry);
    }
    return { occupants, badges };
  });

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  function activeCoating(it: { coating?: { itemId: string; expiresAtTurn: number } } | undefined) {
    if (!it?.coating || it.coating.expiresAtTurn <= $gameState.turn) return null;
    const cDef = gameCoordinator.getItemById(it.coating.itemId);
    const cond = cDef?.coatingEffect?.condition;
    return {
      name: cDef?.name ?? 'Coating',
      effect: cond ? `${cap(cond)} on hit` : 'on-hit effect'
    };
  }

  let statTip: {
    item: Item;
    natural?: NaturalGearMeta;
    coating?: { name: string; effect: string } | null;
    x: number;
    y: number;
  } | null = $state(null);
  function showTip(
    def: Item,
    e: MouseEvent,
    natural?: NaturalGearMeta,
    coating?: { name: string; effect: string } | null
  ) {
    statTip = { item: def, natural, coating, x: e.clientX, y: e.clientY };
  }
  function moveTip(e: MouseEvent) {
    if (statTip) statTip = { ...statTip, x: e.clientX, y: e.clientY };
  }
  function hideTip() {
    statTip = null;
  }
</script>

<div class="slots">
  {#each SLOTS as slot (slot)}
    {@const it = inst(slot)}
    {@const def = it ? gameCoordinator.getItemById(it.itemId) : null}
    {@const maxDur = def?.maxDurability ?? 100}
    {@const qColor = it ? qualityColor(it.quality) : undefined}
    {@const isBlocked = blocked.has(slot)}
    {@const nat = !it ? natural.occupants[slot] : undefined}
    {@const prefix = it ? qualityPrefix(it.quality) : ''}
    <div
      class="slot"
      class:empty={!it && !nat}
      class:blocked={isBlocked && !it && !nat}
      title={nat
        ? `${nat.name} — ${nat.sub} (innate; can't be unequipped)`
        : isBlocked && !it
          ? "Blocked by a cultural trait — this body can't wear gear here."
          : undefined}
      onmouseenter={(e) => {
        const tip = def ?? nat?.tip;
        if (tip) showTip(tip, e, def ? undefined : nat?.meta, def ? activeCoating(it) : null);
      }}
      onmousemove={moveTip}
      onmouseleave={hideTip}
      role="presentation"
    >
      <span class="sq" {@attach chrome('well')}>
        <SpriteIcon item={it?.itemId ?? GHOST[slot]} tint={qColor} px={44} />
      </span>
      <div class="txt">
        <em
          >{SLOT_LABEL[slot]}{#if it && def}<span class="acts">
              {#if onTogglePin}
                <button
                  class:on={isPinned(it.itemId)}
                  title={isPinned(it.itemId)
                    ? 'Pinned — kept, never deposited. Click to unpin.'
                    : 'Pin — the pawn keeps this item (never deposited).'}
                  onclick={() => onTogglePin?.(it.itemId)}>{isPinned(it.itemId) ? '★' : '☆'}</button
                >
              {/if}
              <button title="Unequip {def.name}" disabled={loading} onclick={() => onUnequip(slot)}
                >✕</button
              >
            </span>{/if}</em
        >
        {#if it && def}
          <b title={prefix ? `${prefix} ${def.name}` : def.name}>{def.name}</b>
          {#if prefix && qColor}<span style:color={qColor}>{prefix}</span>{/if}
          <SkinBar
            value={it.durability / maxDur}
            ramp={it.durability / maxDur < 0.5 ? 'ember' : 'leaf'}
            thin
            title="{it.durability}/{maxDur}"
          />
        {:else if nat}
          <b>{nat.name}</b><span>{nat.sub}</span>
        {:else if isBlocked}
          <span>⊘</span>
        {/if}
      </div>
    </div>
  {/each}
</div>

{#if natural.badges.length > 0}
  <div class="innate-strip">
    <span class="innate-hdr">Innate</span>
    {#each natural.badges as b}
      <span
        class="innate-badge"
        title="{b.name} — {b.sub} (innate)"
        onmouseenter={(e) => b.tip && showTip(b.tip, e, b.meta)}
        onmousemove={moveTip}
        onmouseleave={hideTip}
        role="presentation">{b.name} · {b.sub}</span
      >
    {/each}
  </div>
{/if}

{#if statTip}
  <ItemStatTooltip
    item={statTip.item}
    natural={statTip.natural}
    coating={statTip.coating}
    x={statTip.x}
    y={statTip.y}
  />
{/if}

<style>
  .slots {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px 10px;
  }
  .slot {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }
  .sq {
    width: 54px;
    height: 54px;
    flex: none;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .empty .sq :global(:is(canvas, img)) {
    opacity: 0.25;
    filter: grayscale(1);
  }
  .blocked .sq {
    opacity: 0.4;
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  em {
    display: flex;
    font-style: normal;
    white-space: nowrap;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.4px;
  }
  b {
    font-weight: normal;
    line-height: 16px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .txt > span {
    color: var(--text-dim);
  }
  .txt :global(.skin-bar) {
    width: 100%;
    flex: none;
    margin-top: 3px;
  }
  .acts {
    margin-left: auto;
    display: flex;
    gap: 2px;
  }
  .acts button {
    padding: 0 1px;
    letter-spacing: 0;
    border: 0;
    background: none;
    font: inherit;
    color: var(--text-muted);
    cursor: pointer;
  }
  .acts button:hover,
  .acts button.on {
    color: var(--accent-hi);
  }
  .acts button:disabled {
    opacity: 0.4;
  }
  .innate-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 3px 8px;
    margin-top: 6px;
  }
  .innate-hdr {
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1.4px;
  }
  .innate-badge {
    padding: 0 5px;
    color: var(--pos);
    box-shadow: inset 0 0 0 1px var(--pos);
  }
</style>
