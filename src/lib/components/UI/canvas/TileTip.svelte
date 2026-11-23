<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';
  import KvRow from '../widget/KvRow.svelte';
  import type { TileFact } from './tileFacts';

  let {
    title,
    desc,
    rows,
    children
  }: { title: string; desc?: string; rows: TileFact[]; children?: Snippet } = $props();
</script>

<aside class="tile-tip" {@attach chrome('tip')}>
  <div class="body">
    <h5>{title}</h5>
    {#if desc}<p>{desc}</p>{/if}
    {@render children?.()}
    {#each rows as r, i (i)}
      <KvRow label={r.label}>{r.value}</KvRow>
    {/each}
  </div>
</aside>

<style>
  .tile-tip {
    position: absolute;
    bottom: 6px;
    left: calc(var(--hud-left-inset, 0px) + 6px);
    width: 250px;
    box-sizing: border-box;
    padding: 9px 12px 10px;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
    pointer-events: none;
    z-index: 10;
  }
  .body {
    filter: url(#ambient-tint-legible);
  }
  h5 {
    margin: 0 0 2px;
    font: inherit;
    color: var(--accent-hi);
    text-transform: uppercase;
    letter-spacing: 1.6px;
  }
  p {
    margin: 2px 0 5px;
    color: var(--text-dim);
  }
  .body :global(.kv em) {
    color: var(--text-dim);
  }
</style>
