<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';

  let {
    checked,
    partial = false,
    disabled = false,
    onchange,
    children
  }: {
    checked: boolean;
    partial?: boolean;
    disabled?: boolean;
    onchange: () => void;
    children: Snippet;
  } = $props();
</script>

<label class="chk" class:on={checked} class:partial={partial && !checked} class:off={disabled}>
  <input type="checkbox" {checked} {disabled} {onchange} />
  <i class="box" {@attach chrome(checked || partial ? 'cellOn' : 'well')}></i>
  <span>{@render children()}</span>
</label>

<style>
  .chk {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 19px;
    cursor: pointer;
    font: 16px/18px var(--font-pixel);
  }
  .off {
    opacity: 0.5;
    cursor: default;
  }
  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .box {
    display: block;
    flex: none;
    width: 11px;
    height: 11px;
  }
  .on .box::after {
    content: '';
    position: absolute;
    inset: 3px;
    background: var(--accent-hi);
  }
  .partial .box::after {
    content: '';
    position: absolute;
    left: 3px;
    right: 3px;
    top: 5px;
    height: 1px;
    background: var(--accent-hi);
  }
  input:focus-visible + .box {
    outline: 1px solid var(--accent-hi);
  }
  span {
    flex: 1;
    min-width: 0;
    display: inline-flex;
    gap: 6px;
    align-items: center;
    white-space: nowrap;
    overflow: hidden;
    color: var(--text);
  }
  .chk:not(.on) span {
    color: var(--text-muted);
  }
</style>
