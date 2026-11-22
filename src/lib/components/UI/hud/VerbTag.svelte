<script lang="ts">
  import { chrome } from '$lib/pixelArt/chrome';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import { tagAnchor, type VerbTagModel } from '../canvas/verbTag';

  let {
    model,
    view
  }: {
    model: VerbTagModel;
    view: { x: number; y: number; tw: number; th: number; w: number; h: number };
  } = $props();

  let tagW = $state(0);
  let tagH = $state(34);
  const at = $derived(tagAnchor(model.tiles, { ...view, w: view.w - tagW }, tagH));
</script>

<div
  class="verbtag"
  role="presentation"
  style:transform="translate({at.left}px, {at.top}px)"
  bind:offsetWidth={tagW}
  bind:offsetHeight={tagH}
  onmousedown={(e) => e.stopPropagation()}
  onmouseup={(e) => e.stopPropagation()}
  {@attach chrome('tag')}
>
  <span class="vt-n">
    {model.what}{#if model.count > 1}&nbsp;·&nbsp;<b>{model.count}</b> marked{/if}{#if model.note}&nbsp;·&nbsp;{model.note}{/if}
  </span>
  {#each model.verbs as v (v.label)}
    <ChromeButton kind={v.quiet ? 'btn' : 'verb'} glyph={v.glyph} onclick={v.onClick}
      >{v.label}</ChromeButton
    >
  {/each}
  <ChromeButton mini glyph="x" label="Clear" onclick={model.onClear} />
</div>

<style>
  .verbtag {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 11;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 8px 6px 11px;
    white-space: nowrap;
    color: var(--text-dim);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
    pointer-events: auto;
  }
  .vt-n {
    position: relative;
  }
  b {
    font-weight: normal;
    color: var(--text);
  }
</style>
