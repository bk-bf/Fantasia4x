<script lang="ts">
  import { chrome } from '$lib/pixelArt/chrome';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import PixelGlyph from '$lib/components/UI/widget/PixelGlyph.svelte';
  import type { ZoneInstance } from '$lib/game/core/types';
  import { defOf } from './zoneDefs';

  let {
    inst,
    tiles,
    painting,
    filterOpen,
    pawnsOpen,
    onpaint,
    onfilter,
    onpawns,
    oncolour,
    ondelete
  }: {
    inst: ZoneInstance;
    tiles: number;
    painting: boolean;
    filterOpen: boolean;
    pawnsOpen: boolean;
    onpaint: () => void;
    onfilter: () => void;
    onpawns: () => void;
    oncolour: () => void;
    ondelete: () => void;
  } = $props();

  const def = $derived(defOf(inst.type));
  const allowed = $derived(inst.filter.allowedCategories.length);
  const pawns = $derived(inst.assignedPawnIds?.length ?? 0);
  const lit = $derived(painting || filterOpen || pawnsOpen);
</script>

<div class="zrow" class:on={lit} {@attach chrome(lit ? 'cellOn' : 'cell')}>
  {#if def}<PixelGlyph name={def.glyph} ramp="honey" />{/if}
  {#if def?.tinted}
    <i class="sw" class:hidden={inst.colorHidden} style:background={def.color}></i>
  {/if}
  <b>{inst.label}</b>
  {#if tiles > 0}<span class="pill">{tiles} tiles</span>{/if}
  {#if def?.filterable && allowed > 0}
    <span class="pill">{allowed} {inst.type === 'grow' ? 'crops' : 'filtered'}</span>
  {/if}
  {#if def?.pawnAssignable}<span class="pill">{pawns} pawn{pawns === 1 ? '' : 's'}</span>{/if}
  <span class="zb">
    <ChromeButton on={painting} onclick={onpaint}>{painting ? 'Stop' : 'Paint'}</ChromeButton>
    {#if def?.filterable}
      <ChromeButton on={filterOpen} onclick={onfilter}
        >{inst.type === 'grow' ? 'Seeds' : 'Filter'}</ChromeButton
      >
    {/if}
    {#if def?.pawnAssignable}
      <ChromeButton on={pawnsOpen} onclick={onpawns}>Pawns</ChromeButton>
    {/if}
    {#if def?.tinted}
      <ChromeButton on={!inst.colorHidden} onclick={oncolour}>Colour</ChromeButton>
    {/if}
    <ChromeButton onclick={ondelete}>Delete</ChromeButton>
  </span>
</div>

<style>
  .zrow {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 26px;
    padding: 0 4px;
  }
  b {
    width: 98px;
    flex: none;
    font-weight: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .on b {
    color: var(--ember);
  }
  .sw {
    flex: none;
    width: 8px;
    height: 8px;
    box-shadow: 0 0 0 1px var(--border-hi);
  }
  .sw.hidden {
    opacity: 0.25;
  }
  .pill {
    padding: 0 5px;
    white-space: nowrap;
    color: var(--text-dim);
    box-shadow: inset 0 0 0 1px var(--text-muted);
  }
  .on .pill {
    color: var(--ember);
  }
  .zb {
    margin-left: auto;
    display: flex;
    gap: 2px;
  }
  .zb :global(.cbtn) {
    height: 20px;
    padding: 0 6px;
  }
</style>
