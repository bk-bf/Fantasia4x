<script lang="ts">
  import type { Pawn } from '$lib/game/core/types';
  import { uiState } from '$lib/stores/uiState';
  import { buildHealthModel } from '$lib/components/UI/canvas/selectionCard';
  import HealthReadout from '$lib/components/UI/canvas/HealthReadout.svelte';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import Well from '$lib/components/UI/widget/Well.svelte';

  let { pawn }: { pawn: Pawn } = $props();

  const health = $derived(buildHealthModel(pawn));
</script>

<Well title="Body">
  {#snippet tools()}
    <ChromeButton onclick={() => uiState.openWindow('health')}>Health</ChromeButton>
  {/snippet}
  <HealthReadout {health} />
</Well>
