<!--
  SaveListMenu — the Load Game popup: a scrollable list of every save (autosave + manual snapshots),
  newest first. Opened from the title screen (MainMenu) and the in-game ESC menu (PauseMenu). A row loads
  on click; its ✕ deletes it (two-step confirm). New Game is a separate action (it doesn't pick from here),
  so this popup is load/manage only. Reuses the modal scaffolding from SettingsModal (overlay + scrim +
  <button> backdrop + Escape/✕ close).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { gameState } from '$lib/stores/gameState';
  import { listSaves, deleteSaveById, type SaveEntry } from '$lib/stores/saveManager';
  import SaveListRow from './SaveListRow.svelte';

  let { onClose }: { onClose: () => void } = $props();

  let saves = $state<SaveEntry[]>([]);
  let loaded = $state(false);
  async function refresh() {
    saves = await listSaves();
    loaded = true;
  }
  onMount(refresh);

  // startGame flips appPhase → 'game', which unmounts the menu (and this popup with it).
  function load(id: string) {
    gameState.startGame('load', id);
  }
  async function del(id: string) {
    await deleteSaveById(id);
    await refresh();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="overlay" transition:fade={{ duration: 120 }}>
  <button class="backdrop" aria-label="Close save list" onclick={onClose}></button>
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-label="Saves"
    tabindex="-1"
    transition:scale={{ duration: 140, start: 0.96 }}
  >
    <div class="hdr">
      <h2 class="title">Load Game</h2>
      <button class="close" aria-label="Close" onclick={onClose}>✕</button>
    </div>

    <div class="list">
      {#if !loaded}
        <div class="empty">Loading…</div>
      {:else if saves.length === 0}
        <div class="empty">No saves yet — start a New Game, or Save Game from the pause menu.</div>
      {:else}
        {#each saves as save (save.id)}
          <SaveListRow {save} onLoad={() => load(save.id)} onDelete={() => del(save.id)} />
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 1100;
    background: rgba(6, 4, 2, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
  }
  .backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: transparent;
    cursor: default;
    padding: 0;
  }
  .panel {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: min(560px, 92vw);
    max-height: 80vh;
    padding: 16px 18px 18px;
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    box-shadow: 0 0 28px rgba(0, 0, 0, 0.6);
  }
  .hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .title {
    color: var(--accent-hi);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    margin: 0;
  }
  .close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 15px;
    cursor: pointer;
    padding: 2px 4px;
    line-height: 1;
  }
  .close:hover {
    color: var(--accent-hi);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    scrollbar-width: thin;
    padding-right: 4px; /* breathing room so the scrollbar doesn't sit on the rows */
  }
  .empty {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
    text-align: center;
    padding: 28px 12px;
  }
</style>
