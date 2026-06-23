<!--
  SaveSlotMenu — the save-slot picker popup (three square slots). Opened by BOTH New Game and Load Game;
  `intent` sets the header AND whether empty slots are actionable. A filled slot loads on click and its ✕
  deletes it (confirmed). An empty slot starts a new colony there ONLY under the `new` intent; under `load`
  it's an inert placeholder (Load can only load an existing save — new-from-scratch lives on the main
  menu's New Game). Reuses the modal scaffolding from SettingsModal (overlay + scrim + backdrop + Escape/✕).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import { readSlotMetas, deleteSlot, SLOTS, type SlotMeta } from '$lib/stores/saveManager';
  import SaveSlotTile from './SaveSlotTile.svelte';

  let { onClose, intent }: { onClose: () => void; intent: 'new' | 'load' } = $props();

  let metas = $state<(SlotMeta | null)[]>(new Array(SLOTS).fill(null));
  async function refresh() {
    metas = await readSlotMetas();
  }
  onMount(refresh);

  // startGame flips appPhase → 'game', which unmounts the menu (and this popup with it).
  function load(i: number) {
    gameState.startGame('load', i);
  }
  function newGame(i: number) {
    gameState.startGame('new', i);
    // Open the Custom Map popup over the freshly-generated world, exactly as the old New Game did.
    uiState.setCustomMap(true);
  }
  async function del(i: number) {
    await deleteSlot(i);
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
  <button class="backdrop" aria-label="Close slot picker" onclick={onClose}></button>
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-label="Save slots"
    tabindex="-1"
    transition:scale={{ duration: 140, start: 0.96 }}
  >
    <div class="hdr">
      <h2 class="title">{intent === 'new' ? 'New Game' : 'Load Game'} — choose a slot</h2>
      <button class="close" aria-label="Close" onclick={onClose}>✕</button>
    </div>

    <div class="grid">
      {#each metas as meta, i (i)}
        <SaveSlotTile
          {meta}
          index={i}
          allowNew={intent === 'new'}
          onLoad={() => load(i)}
          onNew={() => newGame(i)}
          onDelete={() => del(i)}
        />
      {/each}
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
    width: min(560px, 92vw);
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
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
</style>
