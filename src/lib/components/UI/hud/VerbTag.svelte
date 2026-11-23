<script lang="ts">
  import ChromeButton from '../widget/ChromeButton.svelte';
  import TagBar from '../widget/TagBar.svelte';
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

<TagBar class="verbtag" transform="translate({at.left}px, {at.top}px)" bind:w={tagW} bind:h={tagH}>
  <span class="vt-n">
    {model.what}{#if model.count > 1}&nbsp;·&nbsp;<b>{model.count}</b> marked{/if}{#if model.note}&nbsp;·&nbsp;{model.note}{/if}
  </span>
  {#each model.verbs as v (v.label)}
    <ChromeButton kind={v.quiet ? 'btn' : 'verb'} glyph={v.glyph} onclick={v.onClick}
      >{v.label}</ChromeButton
    >
  {/each}
  <ChromeButton mini glyph="x" label="Clear" onclick={model.onClear} />
</TagBar>

<style>
  :global(.tagbar.verbtag) {
    top: 0;
    left: 0;
  }
  .vt-n {
    position: relative;
  }
</style>
