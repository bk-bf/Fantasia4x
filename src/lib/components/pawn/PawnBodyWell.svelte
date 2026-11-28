<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { uiState } from '$lib/stores/uiState';
  import { buildHealthModel } from '$lib/components/UI/canvas/selectionCard';
  import HealthReadout from '$lib/components/UI/canvas/HealthReadout.svelte';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import Well from '$lib/components/UI/widget/Well.svelte';

  let { pawn }: { pawn: Pawn } = $props();

  const BODY_PILLS = new Set([
    'Blood',
    'Pain',
    'Cold',
    'Heat',
    'Cold tol',
    'Heat tol',
    'Load',
    'Hit',
    'Dodge',
    'Aim',
    'Reach'
  ]);
  const model = $derived(buildHealthModel(pawn));
  const health = $derived(
    model && { ...model, pills: (model.pills ?? []).filter((p) => BODY_PILLS.has(p.label)) }
  );
</script>

<Well title="Body">
  {#snippet tools()}
    <ChromeButton onclick={() => uiState.openWindow('health')}>Health</ChromeButton>
  {/snippet}
  <HealthReadout {health} />
</Well>
