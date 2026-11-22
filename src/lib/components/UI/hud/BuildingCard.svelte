<script lang="ts">
  import type { DroppedItem, PlacedBuilding } from '$lib/game/core/types';
  import type { EntityButton } from './SelectedEntityCard.svelte';
  import { chrome } from '$lib/pixelArt/chrome';
  import type { RampName } from '$lib/pixelArt/palette';
  import { gameState } from '$lib/stores/gameState';
  import { buildingService } from '$lib/game/services/BuildingService';
  import { itemService } from '$lib/game/services/ItemService';
  import { refuelNotes } from '../canvas/refuelNotes';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import MeterRow from '../widget/MeterRow.svelte';
  import PanelTitle from '../widget/PanelTitle.svelte';
  import SpriteIcon from '../widget/SpriteIcon.svelte';

  let {
    building,
    verbs,
    stored = []
  }: { building: PlacedBuilding; verbs: EntityButton[]; stored?: DroppedItem[] } = $props();

  type Meter = { label: string; frac: number; ramp: RampName };

  const def = $derived(buildingService.getBuildingById(building.type));
  const standing = $derived(building.status === 'complete' && !building.deconstructQueued);
  const burning = $derived(
    (building.fuelItemIds ?? []).flatMap((id) => itemService.getItemById(id)?.name ?? [])
  );
  const line = $derived(
    building.status !== 'complete'
      ? building.paused
        ? 'Building paused'
        : 'Being built'
      : building.deconstructQueued
        ? 'Coming down'
        : def?.maxFuel !== undefined
          ? building.lit
            ? [burning[0], 'burning'].filter(Boolean).join(' · ')
            : 'Unlit'
          : (def?.description ?? '')
  );
  const meters = $derived.by((): Meter[] => {
    const out: Meter[] = [];
    if (building.status !== 'complete') {
      const req = building.workRequired ?? def?.workAmount ?? 1;
      out.push({ label: 'Work', frac: (building.workDone ?? 0) / Math.max(req, 1), ramp: 'ember' });
    } else if (building.deconstructQueued) {
      const req = building.deconstructWorkRequired ?? 1;
      out.push({
        label: 'Work',
        frac: (building.deconstructWorkDone ?? 0) / Math.max(req, 1),
        ramp: 'ember'
      });
    }
    if (standing && def?.maxFuel !== undefined)
      out.push({
        label: 'Fuel',
        frac: (building.fuel ?? 0) / Math.max(def.maxFuel, 1),
        ramp: 'ember'
      });
    if (standing && buildingService.deterioratingRate(building.type) > 0)
      out.push({ label: 'Condition', frac: (building.condition ?? 100) / 100, ramp: 'leaf' });
    return out;
  });
  const warn = $derived(refuelNotes(building, $gameState)?.warn ?? null);
  const stacks = $derived(standing ? (def?.effects?.storageStacks ?? 0) : 0);
</script>

<section class="card" {@attach chrome('card')}>
  <div class="c-top">
    <span class="well" {@attach chrome('well')}>
      <SpriteIcon building={building.type} px={40} />
    </span>
    <div class="c-id">
      <PanelTitle>{def?.name ?? ''}</PanelTitle>
      <p>{line}</p>
      {#each meters as m (m.label)}
        <MeterRow label={m.label} value={m.frac} ramp={m.ramp}>{Math.round(m.frac * 100)}%</MeterRow
        >
      {/each}
      {#if stacks > 0}<p>Holds {stored.length} of {stacks} stacks</p>{/if}
      {#if warn}<p class="warn">{warn}</p>{/if}
    </div>
  </div>
  {#if verbs.length > 0}
    <div class="c-verbs">
      {#each verbs as v (v.label)}
        <ChromeButton on={!!v.active} onclick={v.onClick}>{v.label}</ChromeButton>
      {/each}
    </div>
  {/if}
</section>

<style>
  .card {
    width: 344px;
    box-sizing: border-box;
    padding: 11px 13px;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
  }
  .c-top {
    display: flex;
    gap: 10px;
  }
  .well {
    flex: none;
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
  }
  .c-id {
    flex: 1;
    min-width: 0;
  }
  .c-id :global(h3) {
    color: var(--text);
  }
  .c-id :global(.meter-row em) {
    width: 70px;
  }
  .c-id :global(.meter-row > span) {
    width: 40px;
  }
  p {
    margin: 0;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  p.warn {
    color: var(--accent-hi);
  }
  .c-verbs {
    display: flex;
    gap: 4px;
    margin-top: 7px;
  }
  .c-verbs :global(.cbtn) {
    flex: 1;
    padding: 0 4px;
  }
</style>
