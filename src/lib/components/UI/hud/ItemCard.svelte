<script lang="ts">
  import type { DroppedItem } from '$lib/game/core/types';
  import type { RampName } from '$lib/pixelArt/palette';
  import { gameState } from '$lib/stores/gameState';
  import { itemService } from '$lib/game/services/ItemService';
  import { dryingIndicator } from '../canvas/selectionCard';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import MeterRow from '../widget/MeterRow.svelte';
  import SpriteIcon from '../widget/SpriteIcon.svelte';
  import HudCard from './HudCard.svelte';

  let { drop, selected = false }: { drop: DroppedItem; selected?: boolean } = $props();

  type Meter = { label: string; frac: number; ramp: RampName; title?: string };

  const def = $derived(itemService.getItemById(drop.resourceId));
  const name = $derived(def?.dynamicName && drop.name ? drop.name : (def?.name ?? ''));
  const hauler = $derived.by(() => {
    const job = ($gameState.jobs ?? []).find(
      (j) => j.type === 'haul' && j.droppedItemId === drop.id && j.claimedBy
    );
    return job ? ($gameState.pawns ?? []).find((p) => p.id === job.claimedBy) : undefined;
  });
  const where = $derived(
    drop.stored
      ? 'in store'
      : drop.forbidden
        ? 'left where it lies'
        : drop.urgent
          ? 'to be hauled first'
          : 'lying on the ground'
  );
  const errand = $derived(
    hauler
      ? `${hauler.name.split(' ')[0]} will haul it`
      : !drop.stored && !drop.forbidden
        ? 'waiting for a hauler'
        : null
  );
  const meters = $derived.by((): Meter[] => {
    const out: Meter[] = [];
    if (def?.decaySeconds && def.decaySeconds > 0)
      out.push({
        label: 'Fresh',
        frac: Math.max(0, 1 - (drop.decayAcc ?? 0) / def.decaySeconds),
        ramp: 'leaf'
      });
    const max = def?.maxDurability ?? 100;
    out.push({
      label: 'Wear',
      frac: Math.min(max, drop.durability ?? max) / max,
      ramp: 'honey'
    });
    const dry = itemService.dryingStatus(drop, $gameState);
    if (dry)
      out.push({
        label: 'Dry',
        frac: Math.min(1, dry.progress / dry.target),
        ramp: 'water',
        title: dryingIndicator(dry).title
      });
    return out;
  });
</script>

<HudCard title="{name} ×{drop.quantity}" verbs={selected && !drop.stored ? itemVerbs : undefined}>
  {#snippet well()}<SpriteIcon item={drop.resourceId} px={40} />{/snippet}
  {#snippet lines()}
    <p>{where}</p>
    {#if errand}<p class="hot">{errand}</p>{/if}
  {/snippet}
  <div class="c-bars">
    {#each meters as m (m.label)}
      <MeterRow label={m.label} value={m.frac} ramp={m.ramp} title={m.title}
        >{Math.round(m.frac * 100)}%</MeterRow
      >
    {/each}
  </div>
</HudCard>

{#snippet itemVerbs()}
  {#if !drop.forbidden}
    <ChromeButton
      title="Haul it before other work"
      on={!!drop.urgent}
      onclick={() =>
        gameState.command({
          type: 'setDropUrgent',
          payload: { dropId: drop.id, urgent: !drop.urgent },
          save: true
        })}>Haul</ChromeButton
    >
  {/if}
  <ChromeButton
    on={!!drop.forbidden}
    onclick={() =>
      gameState.command({
        type: 'setDropForbidden',
        payload: { dropId: drop.id, forbidden: !drop.forbidden },
        save: true
      })}>Forbid</ChromeButton
  >
{/snippet}
