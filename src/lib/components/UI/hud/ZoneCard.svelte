<script lang="ts">
  import type { ZoneInstance } from '$lib/game/core/types';
  import { gameState } from '$lib/stores/gameState';
  import { PRIORITY_OPTIONS } from '../canvas/storePriority';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import PixelGlyph from '../widget/PixelGlyph.svelte';
  import SegmentedRow from '../widget/SegmentedRow.svelte';
  import HudCard from './HudCard.svelte';

  let {
    zone,
    tiles,
    filled,
    filterOpen,
    painting,
    erasing,
    onfilter,
    onpaint,
    ondelete
  }: {
    zone: ZoneInstance;
    tiles: number;
    filled: number;
    filterOpen: boolean;
    painting: boolean;
    erasing: boolean;
    onfilter: () => void;
    onpaint: (erase: boolean) => void;
    ondelete: () => void;
  } = $props();

  const kinds = $derived(
    zone.filter.allowedCategories.length === 0
      ? 'every kind allowed'
      : `${zone.filter.allowedCategories.length} kinds allowed`
  );
  const send = (type: string, payload: Record<string, unknown>) =>
    gameState.command({ type, payload: { instanceId: zone.id, ...payload }, save: true });
</script>

<HudCard title={zone.label} verbs={zoneVerbs}>
  {#snippet well()}<span class="big"><PixelGlyph name="crate" ramp="honey" /></span>{/snippet}
  {#snippet lines()}
    <p>{tiles} tiles · {kinds}</p>
    <p class="hot">{filled} of {tiles} tiles filled</p>
  {/snippet}
  <div class="fill">
    <SegmentedRow
      label="Fill first"
      options={PRIORITY_OPTIONS}
      value={zone.priority ?? 'normal'}
      onSelect={(priority) => send('setInstancePriority', { priority })}
    />
  </div>
</HudCard>

{#snippet zoneVerbs()}
  <ChromeButton on={filterOpen} onclick={onfilter}>Filter</ChromeButton>
  <ChromeButton on={painting} onclick={() => onpaint(false)}>Paint</ChromeButton>
  <ChromeButton on={erasing} onclick={() => onpaint(true)}>Erase</ChromeButton>
  <ChromeButton
    on={!zone.colorHidden}
    onclick={() =>
      gameState.command({
        type: 'setZoneColorHidden',
        payload: { instanceId: zone.id, hidden: !zone.colorHidden },
        save: true
      })}>Colour</ChromeButton
  >
  <ChromeButton onclick={ondelete}>Delete</ChromeButton>
{/snippet}

<style>
  .big :global(.glyph) {
    width: 33px;
    height: 33px;
  }
  .big :global(.glyph img) {
    width: 100%;
    height: 100%;
  }
  .fill {
    margin-top: 6px;
  }
</style>
