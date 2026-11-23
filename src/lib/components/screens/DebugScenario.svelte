<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { SCENARIO_PRESETS } from '$lib/game/headless/scenarios/presets';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import DebugField from './DebugField.svelte';

  let presetId = $state(SCENARIO_PRESETS[0]?.id ?? '');
  let toolTier = $state(3);

  const preset = $derived(SCENARIO_PRESETS.find((p) => p.id === presetId));
  const cmd = (type: string, payload: Record<string, unknown> = {}) =>
    gameState.command({ type, payload, save: true });
</script>

<h5>Scenario</h5>
<div class="minis">
  <DebugField>
    <select bind:value={presetId} aria-label="Scenario">
      {#each SCENARIO_PRESETS as p (p.id)}<option value={p.id}>{p.label}</option>{/each}
    </select>
  </DebugField>
  <ChromeButton onclick={() => gameState.loadScenarioPreset(presetId)}>Load</ChromeButton>
</div>
{#if preset}<p>{preset.description}</p>{/if}
<h5>Research</h5>
<div class="minis">
  <ChromeButton onclick={() => cmd('devUnlockResearch', { all: true })}>Unlock all</ChromeButton>
  <DebugField>
    <span class="lab">Tool tier</span>
    <input type="number" min="0" max="6" bind:value={toolTier} aria-label="Tool tier" />
  </DebugField>
  <ChromeButton onclick={() => cmd('devSetToolTier', { tier: toolTier })}>Set</ChromeButton>
</div>

<style>
  p {
    margin: 2px 0;
    line-height: 16px;
    color: var(--text-muted);
  }
  .lab {
    flex: 1;
    color: var(--text);
  }
</style>
