<script lang="ts">
  import { chrome } from '$lib/pixelArt/chrome';
  import SpriteIcon from './SpriteIcon.svelte';

  let {
    any,
    options,
    value,
    qty,
    have,
    short,
    note = null,
    onpick
  }: {
    any: string;
    options: { id: string; name: string; have: number }[];
    value: string;
    qty: number;
    have: number | null;
    short: boolean;
    note?: string | null;
    onpick: (id: string) => void;
  } = $props();
</script>

<div class="pick" class:short>
  <SpriteIcon item={value || null} px={16} />
  <span class="well" {@attach chrome('well')}>
    <select {value} class:unset={!value} onchange={(e) => onpick(e.currentTarget.value)}>
      <option value="">any {any}</option>
      {#each options as o (o.id)}
        <option value={o.id}>{o.name} ({o.have})</option>
      {/each}
    </select>
  </span>
  <b>{qty}</b>
  <em>{have ?? ''}</em>
</div>
{#if note}<p class="note">{note}</p>{/if}

<style>
  .pick {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 19px;
    font: 16px/17px var(--font-pixel);
  }
  .well {
    flex: 1;
    min-width: 0;
    display: flex;
    height: 18px;
  }
  select {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font: 15px/16px var(--font-pixel);
    padding: 0 2px;
    cursor: pointer;
    outline: none;
  }
  select.unset {
    color: var(--text-muted);
  }
  select option {
    background: var(--bg-panel);
    color: var(--text);
  }
  b {
    font-weight: normal;
    color: var(--text);
  }
  em {
    width: 28px;
    text-align: right;
    font-style: normal;
    color: var(--text-muted);
  }
  .short b,
  .short em {
    color: var(--neg);
  }
  .note {
    margin: 0 0 1px 22px;
    color: var(--cold);
    font: 14px/15px var(--font-pixel);
  }
</style>
