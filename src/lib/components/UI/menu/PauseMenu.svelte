<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { currentWindow } from '$lib/components/UI/window/windowContext';
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
  <button class="menu-btn" onclick={onResume}>Resume</button>
  <button class="menu-btn" onclick={() => (showSave = true)} disabled={busy}>
    {saved ? 'Saved ✓' : 'Save Game'}
  </button>
  <button class="menu-btn" onclick={() => (showLoad = true)} disabled={busy}>Load Game</button>
  <button class="menu-btn" onclick={() => (showSettings = true)}>Settings</button>
  <button class="menu-btn" onclick={exitToMenu} disabled={busy}>Exit to Main Menu</button>
  {#if isDesktop}
    <button class="menu-btn danger" onclick={quitDesktop} disabled={busy}>Quit to Desktop</button>
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
    gap: 8px;
    width: 100%;
  }

  .menu-btn {
    width: 100%;
    padding: 9px 0;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 13px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s,
      border-color 0.12s;
  }
  .menu-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--accent-hi);
    border-color: var(--border-hi);
  }
  .menu-btn:active:not(:disabled) {
    background: var(--bg-active);
  }
  .menu-btn:disabled {
    color: var(--text-muted);
    cursor: default;
  }
  .menu-btn.danger:hover:not(:disabled) {
    color: var(--neg);
    border-color: var(--neg);
  }
</style>
