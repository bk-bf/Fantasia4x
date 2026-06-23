<!--
  SaveListRow — one row in the SaveListMenu. In LOAD mode, clicking the row loads that save. In SAVE mode,
  clicking it OVERWRITES that save with the current game (two-step "Overwrite?" confirm, since it replaces a
  checkpoint). The corner ✕ deletes the save (its own confirm), available in both modes. Shows the colony
  summary, an Auto/Manual badge (which kind of save wrote it last), and the date+time it was taken.
-->
<script lang="ts">
  import type { SaveEntry } from '$lib/stores/saveManager';

  let {
    save,
    mode = 'load',
    onActivate,
    onDelete
  }: {
    save: SaveEntry;
    mode?: 'load' | 'save';
    onActivate: () => void; // load (load mode) or overwrite (save mode)
    onDelete: () => void;
  } = $props();

  // Only one inline confirm is shown at a time.
  let confirm = $state<'none' | 'delete' | 'overwrite'>('none');

  function activate() {
    if (mode === 'save') confirm = 'overwrite';
    else onActivate();
  }

  const seasonCap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  function fmtWhen(ms: number): string {
    return new Date(ms).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<div class="row">
  <button class="main" onclick={activate}>
    <div class="top">
      <span class="race">{save.meta.raceName}</span>
      <span class="badge" class:auto={save.meta.kind === 'auto'}>
        {save.meta.kind === 'auto' ? 'Autosave' : 'Manual'}
      </span>
    </div>
    <div class="sub">
      {seasonCap(save.meta.season)} · Day {save.meta.day} · {save.meta.population} colonist{save.meta
        .population === 1
        ? ''
        : 's'}
    </div>
    <div class="when">{fmtWhen(save.meta.savedAt)}</div>
  </button>

  {#if confirm === 'overwrite'}
    <div class="confirm">
      <span>Overwrite?</span>
      <button
        class="cbtn yes"
        onclick={() => {
          confirm = 'none';
          onActivate();
        }}>Yes</button
      >
      <button class="cbtn" onclick={() => (confirm = 'none')}>No</button>
    </div>
  {:else if confirm === 'delete'}
    <div class="confirm">
      <span>Delete?</span>
      <button
        class="cbtn yes"
        onclick={() => {
          confirm = 'none';
          onDelete();
        }}>Yes</button
      >
      <button class="cbtn" onclick={() => (confirm = 'none')}>No</button>
    </div>
  {:else}
    <button class="del" aria-label="Delete save" onclick={() => (confirm = 'delete')}>✕</button>
  {/if}
</div>

<style>
  .row {
    position: relative;
  }
  .main {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 9px 11px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-family: var(--font-mono);
    text-align: left;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    transition:
      background 0.12s,
      border-color 0.12s,
      box-shadow 0.12s;
  }
  .main:hover {
    background: var(--bg-hover);
    border-color: var(--border-hi);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
  }
  .top {
    display: flex;
    align-items: baseline;
    gap: 8px;
    /* Leave room for the absolutely-positioned ✕ (top-right) so the right-aligned badge can't clip it. */
    padding-right: 22px;
  }
  .race {
    color: var(--accent-hi);
    font-size: 14px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    margin-left: auto;
    flex: none;
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 5px;
  }
  /* An autosave reads a touch warmer so it's distinguishable at a glance from a deliberate snapshot. */
  .badge.auto {
    color: var(--accent-hi);
    border-color: var(--accent-hi);
    opacity: 0.7;
  }
  .sub {
    font-size: 11px;
    color: var(--text);
    letter-spacing: 0.03em;
  }
  .when {
    font-size: 10px;
    color: var(--text-muted);
  }
  .del {
    position: absolute;
    top: 6px;
    right: 8px;
    width: 18px;
    height: 18px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
  }
  .del:hover {
    color: var(--neg, #c0392b);
  }
  .confirm {
    position: absolute;
    inset: 0 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    background: rgba(6, 4, 2, 0.92);
    border-radius: 0 6px 6px 0;
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
