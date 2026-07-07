<!-- EquipmentDoll.svelte — paper-doll grid of equipment slots (RPG-style boxes) -->
<script lang="ts">
  import type { Pawn, EquipmentSlot, Item } from '$lib/game/core/types';
  import { gameCoordinator } from '$lib/game/systems/GameCoordinator';
  import ItemStatTooltip from '$lib/components/UI/ItemStatTooltip.svelte';
  import SpriteIcon from '$lib/components/UI/SpriteIcon.svelte';
  import { qualityPrefix, qualityColor } from '$lib/game/core/itemQuality';
  import { blockedSlots } from '$lib/game/core/PawnEquipment';
  import { naturalGearForTrait } from '$lib/components/util/naturalGear';

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

  // Order here drives nothing visually — grid-area placement (CSS) lays out the doll.
  const SLOTS: { slot: EquipmentSlot; label: string }[] = [
    { slot: 'headOuter', label: 'Helm' },
    { slot: 'headBase', label: 'Head' },
    { slot: 'gorget', label: 'Neck' },
    { slot: 'mainHand', label: 'Main Hand' },
    { slot: 'bodyOuter', label: 'Outer' },
    { slot: 'offHand', label: 'Off Hand' },
    { slot: 'bodyMid', label: 'Mid' },
    { slot: 'bodyBase', label: 'Base' },
    { slot: 'gloves', label: 'Hands' },
    { slot: 'belt', label: 'Belt' },
    { slot: 'boots', label: 'Feet' },
    { slot: 'back', label: 'Back' },
    { slot: 'amulet', label: 'Amulet' },
    { slot: 'ring', label: 'Ring' },
    { slot: 'ring2', label: 'Ring' }
  ];

  function inst(slot: EquipmentSlot) {
    return pawn.equipment?.[slot];
  }

  // ADR-023: slots a racial body trait forbids (claws fill the hands, horns the crown…) — greyed out.
  const blocked = $derived(blockedSlots(pawn));

  // ADR-023 / TRAIT-SYSTEM-V2 §3 natural gear: a trait's natural weapon/armor (resolved via its
  // `selfCondition` grants). A blocking trait LOCKS its item into its primary blocked slot (claws in
  // Main Hand, fur on Mid); a non-blocking one (fangs, scaled hide) surfaces as an innate BADGE that
  // layers with worn gear. `tip` feeds the same ItemStatTooltip real gear uses on hover — the weapon's
  // actual item def, or a synthesized armor def carrying the condition's defense + weight.
  type Nat = { name: string; sub: string; tip?: Item };
  const natural = $derived.by(() => {
    const occupants: Partial<Record<EquipmentSlot, Nat>> = {};
    const badges: Nat[] = [];
    for (const t of pawn.traits ?? []) {
      // Shared builder — the SAME tooltip-ready Item the trait card's gear pill uses (one source).
      const g = naturalGearForTrait(t);
      if (!g) continue;
      const entry: Nat = { name: g.name, sub: g.sub, tip: g.item };
      const primary = t.blocksSlots?.[0];
      if (primary) occupants[primary] = entry;
      else badges.push(entry);
    }
    return { occupants, badges };
  });

  // Hover popup — the same stat/ability breakdown shown on craftable cards (ItemStatTooltip),
  // portaled to the cursor while hovering a filled slot.
  let statTip: { item: Item; x: number; y: number } | null = $state(null);
  function showTip(def: Item, e: MouseEvent) {
    statTip = { item: def, x: e.clientX, y: e.clientY };
  }
  function moveTip(e: MouseEvent) {
    if (statTip) statTip = { ...statTip, x: e.clientX, y: e.clientY };
  }
  function hideTip() {
    statTip = null;
  }
</script>

<div class="doll">
  {#each SLOTS as { slot, label } (slot)}
    {@const it = inst(slot)}
    {@const def = it ? gameCoordinator.getItemById(it.itemId) : null}
    {@const maxDur = def?.maxDurability ?? 100}
    {@const qColor = it ? qualityColor(it.quality) : undefined}
    {@const isBlocked = blocked.has(slot)}
    {@const nat = !it ? natural.occupants[slot] : undefined}
    <div
      class="slot-box"
      class:filled={!!it}
      class:natural={!!nat}
      class:empty={!it && !isBlocked && !nat}
      class:blocked={isBlocked && !it && !nat}
      style="grid-area: {slot}"
      title={nat
        ? `${nat.name} — ${nat.sub} (innate; can't be unequipped)`
        : isBlocked && !it
          ? "Blocked by a racial trait — this body can't wear gear here."
          : undefined}
      onmouseenter={(e) => {
        const tip = def ?? nat?.tip;
        if (tip) showTip(tip, e);
      }}
      onmousemove={moveTip}
      onmouseleave={hideTip}
      role="presentation"
    >
      <span class="slot-lbl">{label}</span>
      {#if it && def}
        {#if onTogglePin}
          <button
            class="pin"
            class:active={isPinned(it.itemId)}
            title={isPinned(it.itemId)
              ? 'Pinned — kept, never deposited. Click to unpin.'
              : 'Pin — the pawn keeps this item (never deposited).'}
            onclick={() => onTogglePin?.(it.itemId)}>{isPinned(it.itemId) ? '★' : '☆'}</button
          >
        {/if}
        {#if def.charSpans}
          <div class="icon-wrap">
            <SpriteIcon charSpans={def.charSpans} tint={qColor ?? def.color ?? null} px={34} />
          </div>
        {/if}
        {@const prefix = qualityPrefix(it.quality)}
        <span class="it-name" title={prefix ? `${prefix} ${def.name}` : def.name}
          >{#if prefix && qColor}<span class="rarity" style="color:{qColor}">{prefix}</span
            >&nbsp;{/if}{def.name}</span
        >
        <div class="dur-bar" title="{it.durability}/{maxDur}">
          <div
            class="dur-fill"
            class:low={it.durability / maxDur < 0.3}
            style="width: {Math.max(0, Math.min(100, (it.durability / maxDur) * 100))}%"
          ></div>
        </div>
        <button
          class="unequip"
          title="Unequip {def.name}"
          disabled={loading}
          onclick={() => onUnequip(slot)}>✕</button
        >
      {:else if nat}
        <span class="nat-name">{nat.name}</span>
        <span class="nat-sub">{nat.sub}</span>
      {:else if isBlocked}
        <span class="empty-mk blocked-mk">⊘</span>
      {:else}
        <span class="empty-mk">—</span>
      {/if}
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
        onmouseenter={(e) => b.tip && showTip(b.tip, e)}
        onmousemove={moveTip}
        onmouseleave={hideTip}
        role="presentation">{b.name} · {b.sub}</span
      >
    {/each}
  </div>
{/if}

{#if statTip}
  <ItemStatTooltip item={statTip.item} x={statTip.x} y={statTip.y} />
{/if}

<style>
  .doll {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-areas:
      'headOuter headBase  gorget'
      'mainHand  bodyOuter offHand'
      'mainHand  bodyMid   offHand'
      'gloves    bodyBase  belt'
      'boots     back      amulet'
      'ring      ring2     .';
    gap: 4px;
    padding: 8px;
  }

  .slot-box {
    position: relative;
    border: 1px solid var(--border);
    background: var(--bg);
    min-height: 50px;
    padding: 3px 5px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }
  .slot-box.empty {
    border-style: dashed;
    opacity: 0.5;
  }
  .slot-box.filled {
    border-color: var(--accent);
    background: var(--bg-panel);
  }
  /* ADR-023: a racial trait forbids this slot — greyed and struck through, not equippable. */
  .slot-box.blocked {
    border-style: dashed;
    opacity: 0.35;
    background: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 4px,
      var(--bg-active) 4px,
      var(--bg-active) 5px
    );
  }
  .blocked-mk {
    color: var(--text-muted);
  }
  /* ADR-023: a natural weapon/armor locked into a body-blocked slot — occupied, but not removable. */
  .slot-box.natural {
    border-color: var(--pos, #68b030);
    border-style: solid;
    background: color-mix(in srgb, var(--pos, #68b030) 12%, var(--bg));
  }
  .nat-name {
    margin: auto 0 1px;
    font-size: 11px;
    color: var(--text);
    text-align: center;
    line-height: 1.15;
  }
  .nat-sub {
    font-size: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--pos, #68b030);
    text-align: center;
  }

  /* Innate weapons/armor that layer with worn gear (fangs, scaled hide) — badges under the doll. */
  .innate-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 4px 10px 8px;
  }
  .innate-hdr {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .innate-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--pos, #68b030) 14%, var(--bg-panel));
    border: 1px solid color-mix(in srgb, var(--pos, #68b030) 40%, transparent);
    color: var(--text);
    white-space: nowrap;
  }

  .slot-lbl {
    font-size: 10px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  /* Filled slots show the pin (top-left) + unequip (top-right) — clear the label past the pin. */
  .slot-box.filled .slot-lbl {
    padding: 0 12px;
  }

  /* The item tile fills the slot's body so the sprite — not dead space — is the focus. */
  .icon-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 2px 0;
  }

  .it-name {
    font-size: 12px;
    color: var(--text);
    line-height: 1.15;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dur-bar {
    height: 3px;
    background: var(--bg-active);
  }
  .dur-fill {
    height: 100%;
    background: var(--pos);
  }
  .dur-fill.low {
    background: var(--neg);
  }

  .empty-mk {
    color: var(--text-muted);
    font-size: 11px;
    margin: auto;
  }

  .pin {
    position: absolute;
    top: 2px;
    left: 3px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    line-height: 1;
    padding: 1px 2px;
  }
  .pin:hover {
    color: var(--text);
  }
  .pin.active {
    color: var(--accent-hi, #ffd24a);
  }

  .unequip {
    position: absolute;
    top: 2px;
    right: 3px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    line-height: 1;
    padding: 1px 2px;
  }
  .unequip:hover {
    color: var(--neg);
  }
  .unequip:disabled {
    opacity: 0.4;
  }
</style>
