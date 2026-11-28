<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { RampName } from '$lib/pixelArt/palette';
  import SkinBar from './SkinBar.svelte';

  let {
    label,
    value,
    ramp = 'honey',
    title,
    wide = false,
    children
  }: {
    label: string;
    value: number;
    ramp?: RampName;
    title?: string;
    wide?: boolean;
    children: Snippet;
  } = $props();
</script>

<div class="meter-row" class:wide {title}>
  <em>{label}</em>
  <SkinBar {value} {ramp} />
  <span>{@render children()}</span>
</div>

<style>
  .meter-row {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 18px;
    min-width: 0;
  }
  em {
    flex: none;
    width: 40px;
    font-style: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wide em {
    width: 150px;
  }
  .meter-row :global(.skin-bar) {
    min-width: 12px;
  }
  span {
    flex: none;
    width: 74px;
    text-align: right;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wide span {
    width: 40px;
  }
</style>
