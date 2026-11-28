<script lang="ts">
  import { onMount } from 'svelte';
  import { gameState, currentTurn } from '$lib/stores/gameState';
  import { dayIndexForTurn } from '$lib/game/services/EnvironmentService';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import KvRow from '$lib/components/UI/widget/KvRow.svelte';
  import ModalWindow from '$lib/components/UI/window/ModalWindow.svelte';

  const dead = $derived($gameState.deadPawns ?? []);
  const days = $derived(Math.max(1, dayIndexForTurn($currentTurn ?? 0)));
  const home = $derived($gameState.culture?.name);
  let busy = $state(false);

  onMount(() => {
    gameState.pauseGame();
  });

  function restart() {
    gameState.resetGame();
  }
  async function toMenu() {
    if (busy) return;
    busy = true;
    await gameState.goToMainMenu();
  }
</script>

<ModalWindow id="gameover" title="The colony is lost" width={380} onclose={toMenu}>
  <p class="lore">
    The last fire{home ? ` at ${home}` : ''} has gone out. Nobody is left to bank it.
  </p>
  <div class="facts">
    <KvRow label="Souls lost">{dead.length}</KvRow>
    <KvRow label="Days endured">{days}</KvRow>
    {#if dead.length > 0}
      <KvRow label="Last to fall">{dead[dead.length - 1].name}</KvRow>
    {/if}
  </div>
  <div class="foot">
    <ChromeButton onclick={toMenu} disabled={busy}>Main menu</ChromeButton>
    <ChromeButton kind="verb" onclick={restart} disabled={busy}>Begin again</ChromeButton>
  </div>
</ModalWindow>

<style>
  .lore {
    margin: 0;
    color: var(--text-dim);
    line-height: 17px;
  }
  .facts {
    margin: 6px 0 4px;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    margin-top: 10px;
  }
</style>
