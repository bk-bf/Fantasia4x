<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
  import buildingsData from '$lib/game/database/world/buildings.json';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import DebugField from './DebugField.svelte';

  type NamedDef = { id: string; name?: string };
  type BrushKind = 'regrow' | 'building' | 'resource' | 'kill' | 'resurrect';
  const BUILDINGS = buildingsData as unknown as NamedDef[];
  const RESOURCES = resourceObjectService.getAll();

  let buildingId = $state(BUILDINGS[0]?.id ?? '');
  let resourceId = $state(RESOURCES[0]?.id ?? '');

  const brush = $derived($uiState.debugBrush);
  const cmd = (type: string, payload: Record<string, unknown> = {}) =>
    gameState.command({ type, payload, save: true });

  function armBrush(kind: BrushKind, id: string | null = null) {
    if (brush?.kind === kind) uiState.deactivateDebugBrush();
    else uiState.activateDebugBrush(kind, id);
  }
</script>

<div class="minis">
  <ChromeButton onclick={() => cmd('devTriggerKingdomArrival', { kind: 'caravan' })}
    >Caravan</ChromeButton
  >
  <ChromeButton onclick={() => cmd('devTriggerKingdomArrival', { kind: 'visitor' })}
    >Visitors</ChromeButton
  >
  <ChromeButton onclick={() => cmd('devTriggerMigrantWave')}>Migrants</ChromeButton>
</div>
<h5>Brush</h5>
<div class="minis">
  <ChromeButton
    on={brush?.kind === 'kill'}
    title="Click a creature or pawn"
    onclick={() => armBrush('kill')}>Kill</ChromeButton
  >
  <ChromeButton
    on={brush?.kind === 'resurrect'}
    title="Click a corpse"
    onclick={() => armBrush('resurrect')}>Revive</ChromeButton
  >
  <ChromeButton
    on={brush?.kind === 'regrow'}
    title="Click a tile"
    onclick={() => armBrush('regrow')}>Regrow</ChromeButton
  >
</div>
<div class="minis">
  <DebugField>
    <select bind:value={buildingId} aria-label="Building">
      {#each BUILDINGS as b (b.id)}<option value={b.id}>{b.name ?? b.id}</option>{/each}
    </select>
  </DebugField>
  <ChromeButton on={brush?.kind === 'building'} onclick={() => armBrush('building', buildingId)}
    >Building</ChromeButton
  >
</div>
<div class="minis">
  <DebugField>
    <select bind:value={resourceId} aria-label="Resource">
      {#each RESOURCES as r (r.id)}<option value={r.id}>{r.displayName ?? r.id}</option>{/each}
    </select>
  </DebugField>
  <ChromeButton on={brush?.kind === 'resource'} onclick={() => armBrush('resource', resourceId)}
    >Resource</ChromeButton
  >
</div>
<div class="minis">
  <ChromeButton disabled={!brush} onclick={() => uiState.deactivateDebugBrush()}>Stop</ChromeButton>
</div>
