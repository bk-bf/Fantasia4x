<!--
  PauseMenu — the in-game Escape overlay. Opened by ESC on the main map (+page.svelte gates it behind
  the existing blueprint/designation/panel cancels), closed by Resume or ESC again. The game is
  paused while it's up (+page restores the prior pause state on resume).

  Entries: Resume · Save Game (eager flush, with a transient confirmation) · Load Game (opens the
  3-slot picker in load mode) · Settings (inline toggles, mirroring the title menu) · Exit to Main
  Menu (save → reload to the title) · Quit to Desktop (save → close the window; desktop shell only).
-->
<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { gameState } from '$lib/stores/gameState';
  import SettingsModal from './SettingsModal.svelte';
  import SaveSlotMenu from './SaveSlotMenu.svelte';

  let { onResume }: { onResume: () => void } = $props();

  let showSettings = $state(false);
  let showLoad = $state(false);
  let saved = $state(false);
  let busy = $state(false);
  const isDesktop = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent ?? '');

  async function saveGame() {
    if (busy) return;
    await gameState.saveGame();
    saved = true;
    setTimeout(() => (saved = false), 1600);
  }

  async function exitToMenu() {
    if (busy) return;
    busy = true;
    await gameState.saveGame();
    // Reload boots cleanly back to the title (menu shows under a clean/--play launch); New/Load both
    // re-run the boot freshly. The eager save above guarantees nothing is lost.
    location.reload();
  }

  async function quitDesktop() {
    if (busy) return;
    busy = true;
    await gameState.saveGame();
    window.close();
  }
</script>

<div class="pause-overlay" transition:fade={{ duration: 120 }}>
  <div class="pause-panel" transition:scale={{ duration: 140, start: 0.96 }}>
    <h2 class="title">PAUSED</h2>

    <nav class="menu">
      <button class="menu-btn" onclick={onResume}>Resume</button>
      <button class="menu-btn" onclick={saveGame} disabled={busy}>
        {saved ? 'Saved ✓' : 'Save Game'}
      </button>
      <button class="menu-btn" onclick={() => (showLoad = true)} disabled={busy}>Load Game</button>
      <button class="menu-btn" onclick={() => (showSettings = true)}>Settings</button>
      <button class="menu-btn" onclick={exitToMenu} disabled={busy}>Exit to Main Menu</button>
      {#if isDesktop}
        <button class="menu-btn danger" onclick={quitDesktop} disabled={busy}
          >Quit to Desktop</button
        >
      {/if}
    </nav>
  </div>
</div>

{#if showLoad}
  <SaveSlotMenu intent="load" onClose={() => (showLoad = false)} />
{/if}

{#if showSettings}
  <SettingsModal onClose={() => (showSettings = false)} />
{/if}

<style>
  .pause-overlay {
    position: fixed;
    inset: 0;
    z-index: 900;
    background: rgba(6, 4, 2, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
  }

  .pause-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: min(300px, 80vw);
    padding: 22px 20px;
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    box-shadow: 0 0 28px rgba(0, 0, 0, 0.6);
  }

  .title {
    color: var(--accent-hi);
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.4em;
    text-indent: 0.4em;
    margin: 0 0 12px;
  }

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
    font-size: 12px;
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
