<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { currentWindow } from '$lib/components/UI/window/windowContext';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import SettingsModal from '../modal/SettingsModal.svelte';
  import SaveListMenu from './SaveListMenu.svelte';

  const win = currentWindow();
  const onResume = () => win?.close();

  let showSettings = $state(false);
  let showLoad = $state(false);
  let showSave = $state(false);
  let saved = $state(false);
  let busy = $state(false);
  const isDesktop = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent ?? '');

  function onSaved() {
    saved = true;
    setTimeout(() => (saved = false), 1600);
  }

  async function exitToMenu() {
    if (busy) return;
    busy = true;
    await gameState.goToMainMenu();
  }

  async function quitDesktop() {
    if (busy) return;
    busy = true;
    await gameState.flushSave();
    window.close();
  }
</script>

<nav class="menu">
  <ChromeButton onclick={onResume}>Resume</ChromeButton>
  <ChromeButton onclick={() => (showSave = true)} disabled={busy}>
    {saved ? 'Saved' : 'Save game'}
  </ChromeButton>
  <ChromeButton onclick={() => (showLoad = true)} disabled={busy}>Load game</ChromeButton>
  <ChromeButton onclick={() => (showSettings = true)}>Settings</ChromeButton>
  <ChromeButton onclick={exitToMenu} disabled={busy}>Exit to main menu</ChromeButton>
  {#if isDesktop}
    <ChromeButton class="neg" onclick={quitDesktop} disabled={busy}>Quit to desktop</ChromeButton>
  {/if}
</nav>

{#if showSave}
  <SaveListMenu mode="save" {onSaved} onClose={() => (showSave = false)} />
{/if}

{#if showLoad}
  <SaveListMenu onClose={() => (showLoad = false)} />
{/if}

{#if showSettings}
  <SettingsModal onClose={() => (showSettings = false)} />
{/if}

<style>
  .menu {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 2px 10px 4px;
  }
  .menu :global(.cbtn) {
    height: 26px;
  }
  .menu :global(.cbtn.neg:enabled) {
    color: var(--neg);
  }
</style>
