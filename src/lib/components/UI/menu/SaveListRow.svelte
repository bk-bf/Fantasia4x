<script lang="ts">
  import type { SaveEntry } from '$lib/stores/saveManager';
  import { chrome } from '$lib/pixelArt/chrome';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import { copyText } from '$lib/components/util/copyText';

  let {
    save,
    mode = 'load',
    selected = false,
    onSelect,
    onActivate,
    onDelete
  }: {
    save: SaveEntry;
    mode?: 'load' | 'save';
    selected?: boolean;
    onSelect?: () => void;
    onActivate: () => void;
    onDelete: () => void;
  } = $props();

  let confirm = $state<'none' | 'delete' | 'overwrite'>('none');
  const meta = $derived(save.meta);

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

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  async function copySeed() {
    if (meta.seed == null) return;
    await copyText(String(meta.seed));
    copied = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), 1200);
  }

  function settle(yes: boolean) {
    const was = confirm;
    confirm = 'none';
    if (!yes) return;
    if (was === 'delete') onDelete();
    else onActivate();
  }
</script>

<div class="row" class:on={selected} {@attach chrome(selected ? 'cellOn' : 'well')}>
  <button class="info" disabled={mode === 'save'} onclick={onSelect}>
    <span class="head">
      <b>{meta.cultureName}</b>
      <span class="pill" class:warn={meta.kind !== 'auto'}>
        {meta.kind === 'auto' ? 'Autosave' : 'Manual'}
      </span>
    </span>
    <span class="line">
      {seasonCap(meta.season)} · Day {meta.day} · {meta.population} colonist{meta.population === 1
        ? ''
        : 's'}
    </span>
    <em>{fmtWhen(meta.savedAt)}</em>
  </button>
  {#if meta.seed != null && mode === 'load'}
    <button class="seed" title="copy the seed" onclick={copySeed}>
      {copied ? 'Copied' : `Seed ${meta.seed}`}
    </button>
  {/if}
  {#if confirm !== 'none'}
    <span class="ask">{confirm === 'delete' ? 'Delete it?' : 'Write over it?'}</span>
    <ChromeButton onclick={() => settle(true)}>Yes</ChromeButton>
    <ChromeButton onclick={() => settle(false)}>No</ChromeButton>
  {:else if mode === 'save'}
    <ChromeButton onclick={() => (confirm = 'overwrite')}>Write over</ChromeButton>
  {:else}
    <ChromeButton onclick={onActivate}>Load</ChromeButton>
    <ChromeButton mini glyph="x" label="Delete" onclick={() => (confirm = 'delete')} />
  {/if}
</div>

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-dim);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .info:disabled {
    cursor: default;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 6px;
    max-width: 100%;
  }
  b {
    font-weight: normal;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pill {
    flex: none;
    padding: 0 5px;
    box-shadow: inset 0 0 0 1px var(--text-muted);
    color: var(--text-dim);
  }
  .pill.warn {
    color: var(--accent-hi);
  }
  em {
    font-style: normal;
    color: var(--text-muted);
  }
  .seed {
    flex: none;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-muted);
    font: inherit;
    cursor: pointer;
  }
  .seed:hover {
    color: var(--text);
  }
  .ask {
    flex: none;
    color: var(--accent-hi);
  }
  :global(:root[data-theme='vellum']) .row.on :is(.info, b, em, .seed, .pill) {
    color: var(--ember);
  }
  :global(:root[data-theme='vellum']) .row.on .pill {
    box-shadow: inset 0 0 0 1px var(--ember);
  }
</style>
