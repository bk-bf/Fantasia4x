<script lang="ts">
  import { chrome } from '$lib/pixelArt/chrome';
  import ClickAway from '../widget/ClickAway.svelte';

  let {
    x,
    y,
    entries,
    onclose
  }: {
    x: number;
    y: number;
    entries: { label: string; run: () => void }[];
    onclose: () => void;
  } = $props();

  let hot = $state(-1);
</script>

<ClickAway {onclose} />
<div class="ctx" role="menu" style:left="{x}px" style:top="{y}px" {@attach chrome('tip')}>
  {#each entries as entry, i (i)}
    <button
      class="ci"
      class:on={hot === i}
      role="menuitem"
      onmouseenter={() => (hot = i)}
      onmouseleave={() => (hot = -1)}
      onclick={() => {
        entry.run();
        onclose();
      }}
      {@attach chrome(hot === i ? 'cellOn' : 'cell')}><span>{entry.label}</span></button
    >
  {/each}
</div>

<style>
  .ctx {
    position: fixed;
    z-index: 999;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 190px;
    padding: 6px;
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
  }
  .ci {
    padding: 2px 8px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .ci.on span {
    color: var(--ember);
  }
</style>
