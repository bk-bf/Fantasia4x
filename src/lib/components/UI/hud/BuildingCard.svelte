<script lang="ts">
  import type { DroppedItem, PlacedBuilding } from '$lib/game/core/types';
  import type { EntityButton } from './SelectedEntityCard.svelte';
  import type { RampName } from '$lib/pixelArt/palette';
  import { gameState } from '$lib/stores/gameState';
  import { buildingService } from '$lib/game/services/BuildingService';
  import { itemService } from '$lib/game/services/ItemService';
  import { refuelNotes } from '../canvas/refuelNotes';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import HudCard from './HudCard.svelte';
  import MeterRow from '../widget/MeterRow.svelte';
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

<HudCard title={def?.name ?? ''} verbs={verbs.length > 0 ? buildingVerbs : undefined}>
  {#snippet well()}<SpriteIcon building={building.type} px={40} />{/snippet}
  {#snippet lines()}
    <p>{line}</p>
    <div class="meters">
      {#each meters as m (m.label)}
        <MeterRow label={m.label} value={m.frac} ramp={m.ramp}>{Math.round(m.frac * 100)}%</MeterRow
        >
      {/each}
    </div>
    {#if stacks > 0}<p>Holds {stored.length} of {stacks} stacks</p>{/if}
    {#if warn}<p class="hot">{warn}</p>{/if}
  {/snippet}
</HudCard>

{#snippet buildingVerbs()}
  {#each verbs as v (v.label)}
    <ChromeButton on={!!v.active} onclick={v.onClick}>{v.label}</ChromeButton>
  {/each}
{/snippet}

<style>
  .meters :global(.meter-row em) {
    width: 70px;
  }
  .meters :global(.meter-row > span) {
    width: 40px;
  }
</style>
