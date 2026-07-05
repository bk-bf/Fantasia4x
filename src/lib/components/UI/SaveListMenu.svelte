<!--
  SaveListMenu — the save picker: a scrollable list of every save (autosave + manual snapshots), newest
  first. Two modes:
    • 'load' (Load Game, from MainMenu/PauseMenu) — a row loads on click; its ✕ deletes it.
    • 'save' (pause-menu "Save Game") — a "+ New Save" action writes a fresh snapshot; clicking a row
      OVERWRITES that save with the current game (confirmed). Either way the popup closes and reports back.
  New Game is a separate action (it doesn't pick from here). Reuses the modal scaffolding from SettingsModal
  (overlay + scrim + <button> backdrop + Escape/✕ close).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { gameState } from '$lib/stores/gameState';
  import { listSaves, deleteSaveById, type SaveEntry } from '$lib/stores/saveManager';
  import SaveListRow from './SaveListRow.svelte';

  let {
    onClose,
    mode = 'load',
    onSaved
  }: { onClose: () => void; mode?: 'load' | 'save'; onSaved?: () => void } = $props();

  let saves = $state<SaveEntry[]>([]);
  let loaded = $state(false);
  let busy = $state(false);
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

  // ── save mode ──
  async function newSave() {
    if (busy) return;
    busy = true;
    await gameState.saveGame();
    onSaved?.();
    onClose();
  }
  async function overwrite(id: string) {
    if (busy) return;
    busy = true;
    await gameState.overwriteSave(id);
    onSaved?.();
    onClose();
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
      <h2 class="title">{mode === 'save' ? 'Save Game' : 'Load Game'}</h2>
      <button class="close" aria-label="Close" onclick={onClose}>✕</button>
    </div>

    {#if mode === 'save'}
      <button class="new-save" onclick={newSave} disabled={busy}>+ New Save</button>
    {/if}

    <div class="list">
      {#if !loaded}
        <div class="empty">Loading…</div>
      {:else if saves.length === 0}
        <div class="empty">
          {mode === 'save'
            ? 'No saves yet — use New Save above to make your first snapshot.'
            : 'No saves yet — start a New Game, or Save Game from the pause menu.'}
        </div>
      {:else}
        {#if mode === 'save'}
          <div class="hint">…or overwrite an existing save:</div>
        {/if}
        {#each saves as save (save.id)}
          <SaveListRow
            {save}
            {mode}
            onActivate={() => (mode === 'save' ? overwrite(save.id) : load(save.id))}
            onDelete={() => del(save.id)}
          />
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
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    margin: 0;
  }
  .close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 16px;
    cursor: pointer;
    padding: 2px 4px;
    line-height: 1;
  }
  .close:hover {
    color: var(--accent-hi);
  }
  /* Primary "new save" action — reads as the recommended path; sits above the overwrite list. */
  .new-save {
    width: 100%;
    margin-bottom: 12px;
    padding: 10px 0;
    background: var(--bg);
    border: 1px solid var(--accent-hi);
    color: var(--accent-hi);
    font-family: var(--font-mono);
    font-size: 13px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s;
  }
  .new-save:hover:not(:disabled) {
    background: var(--bg-hover);
  }
  .new-save:disabled {
    color: var(--text-muted);
    border-color: var(--border);
    cursor: default;
  }
  .hint {
    color: var(--text-muted);
    font-size: 11px;
    letter-spacing: 0.04em;
    margin-bottom: 2px;
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
    font-size: 13px;
    line-height: 1.5;
    text-align: center;
    padding: 28px 12px;
  }
</style>
