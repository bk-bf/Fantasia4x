<script lang="ts">
  import { get } from 'svelte/store';
  import { currentEvent, commitMigrants, acknowledgeKingdomArrival } from '$lib/stores/eventStore';
  import { gameState } from '$lib/stores/gameState';
  import MigrantWaveModal from './MigrantWaveModal.svelte';
  import KingdomArrivalModal from './KingdomArrivalModal.svelte';

  let pausedByEvent = false;
  let prevId: string | null = null;

  $effect(() => {
    const id = $currentEvent?.id ?? null;
    if (id && id !== prevId) {
      if (!get(gameState.isPaused)) {
        gameState.pauseGame();
        pausedByEvent = true;
      }
    } else if (!id && prevId && pausedByEvent) {
      gameState.unpauseGame();
      pausedByEvent = false;
    }
    prevId = id;
  });
</script>

{#if $currentEvent?.kind === 'migrant-wave'}
  <MigrantWaveModal event={$currentEvent} onResolve={commitMigrants} />
{:else if $currentEvent?.kind === 'kingdom-arrival'}
  <KingdomArrivalModal event={$currentEvent} onResolve={acknowledgeKingdomArrival} />
{/if}
