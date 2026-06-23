<!--
  SaveSlotTile — one square in the SaveSlotMenu. Filled → colony summary, whole-tile click loads it,
  corner ✕ deletes (two-step confirm). Empty → "+ New Game", click starts a fresh colony in this slot.
-->
<script lang="ts">
  import type { SlotMeta } from '$lib/stores/saveManager';

  let {
    meta,
    index,
    onLoad,
    onNew,
    onDelete
  }: {
    meta: SlotMeta | null;
    index: number;
    onLoad: () => void;
    onNew: () => void;
    onDelete: () => void;
  } = $props();

  let confirming = $state(false);

  const seasonCap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  function fmtDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
</script>

<div class="tile" class:filled={!!meta}>
  {#if meta}
    <button class="main" onclick={onLoad}>
      <div class="slot-no">Slot {index + 1}</div>
      <div class="race">{meta.raceName}</div>
      <div class="line">{seasonCap(meta.season)} · Day {meta.day}</div>
      <div class="line">{meta.population} colonist{meta.population === 1 ? '' : 's'}</div>
      <div class="date">{fmtDate(meta.savedAt)}</div>
    </button>
    {#if confirming}
      <div class="confirm">
        <span>Delete?</span>
        <button
          class="cbtn yes"
          onclick={() => {
            confirming = false;
            onDelete();
          }}>Yes</button
        >
        <button class="cbtn" onclick={() => (confirming = false)}>No</button>
      </div>
    {:else}
      <button class="del" aria-label="Delete slot {index + 1}" onclick={() => (confirming = true)}
        >✕</button
      >
    {/if}
  {:else}
    <button class="main empty" onclick={onNew}>
      <div class="slot-no">Slot {index + 1}</div>
      <div class="empty-label">Empty</div>
      <div class="empty-action">+ New Game</div>
    </button>
  {/if}
</div>

<style>
  .tile {
    position: relative;
    aspect-ratio: 1;
  }
  .main {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 8px 6px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 7px;
    color: var(--text);
    font-family: var(--font-mono);
    cursor: pointer;
    /* Soft drop shadow lifts each card off the panel so it reads as a raised tile, not a box drawn
       inside another box. */
    box-shadow: 0 2px 7px rgba(0, 0, 0, 0.45);
    transition:
      background 0.12s,
      border-color 0.12s,
      box-shadow 0.12s,
      transform 0.12s;
  }
  .main:hover {
    background: var(--bg-hover);
    border-color: var(--border-hi);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.55);
    transform: translateY(-1px);
  }
  .slot-no {
    color: var(--text-muted);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .race {
    color: var(--accent-hi);
    font-size: 13px;
    font-weight: 700;
    margin-top: 2px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line {
    font-size: 10px;
    color: var(--text);
    letter-spacing: 0.04em;
  }
  .date {
    margin-top: 4px;
    font-size: 9px;
    color: var(--text-muted);
  }
  .empty .empty-label {
    color: var(--text-muted);
    font-size: 12px;
    letter-spacing: 0.1em;
    margin-top: 4px;
  }
  .empty .empty-action {
    color: var(--text-dim);
    font-size: 11px;
    margin-top: 8px;
  }
  .empty:hover .empty-action {
    color: var(--accent-hi);
  }
  .del {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 18px;
    height: 18px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
  }
  .del:hover {
    color: var(--neg, #c0392b);
  }
  .confirm {
    position: absolute;
    inset: auto 0 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 5px;
    background: rgba(6, 4, 2, 0.92);
    border-radius: 0 0 7px 7px; /* match the card's rounded bottom corners */
    font-size: 10px;
    color: var(--text);
  }
  .cbtn {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 2px 7px;
    cursor: pointer;
  }
  .cbtn.yes:hover {
    color: var(--neg, #c0392b);
    border-color: var(--neg, #c0392b);
  }
  .cbtn:hover {
    border-color: var(--border-hi);
  }
</style>
