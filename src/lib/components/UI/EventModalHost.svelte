<script lang="ts">
  // Top-level host for pending world events. Reads the sim's current event and dispatches to the
  // right modal by `kind` — the reusable seam future events (raids, disasters…) plug into. Hard-pauses
  // the game while a decision is pending, and restores play once it resolves (unless the player had
  // already paused). Mount once, near the other global overlays in +page.svelte.
  import { get } from 'svelte/store';
  import { currentEvent, commitMigrants } from '$lib/stores/eventStore';
  import { gameState } from '$lib/stores/gameState';
  import MigrantWaveModal from './MigrantWaveModal.svelte';

  let pausedByEvent = false;
  let prevId: string | null = null;

  $effect(() => {
    const id = $currentEvent?.id ?? null;
    if (id && id !== prevId) {
      // A decision opened — pause unless the player already had the game paused.
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
{/if}
