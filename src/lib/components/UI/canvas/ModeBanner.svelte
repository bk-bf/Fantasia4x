<script lang="ts" module>
  import type { GlyphName } from '$lib/pixelArt/glyphs';

  export interface BannerVerb {
    label: string;
    glyph?: GlyphName;
    verb?: boolean;
    on?: boolean;
    onClick: () => void;
  }

  export interface BannerModel {
    lead: string;
    subject: string;
    size?: string | null;
    verbs: BannerVerb[];
  }
</script>

<script lang="ts">
  import ChromeButton from '../widget/ChromeButton.svelte';
  import TagBar from '../widget/TagBar.svelte';

  let { model }: { model: BannerModel } = $props();
</script>

<TagBar class="mode-banner">
  <span
    >{model.lead} <b>{model.subject}</b>{#if model.size}&nbsp;·&nbsp;{model.size}{/if}</span
  >
  {#each model.verbs as v (v.label)}
    <ChromeButton kind={v.verb ? 'verb' : 'btn'} glyph={v.glyph} on={v.on} onclick={v.onClick}
      >{v.label}</ChromeButton
    >
  {/each}
</TagBar>

<style>
  :global(.tagbar.mode-banner) {
    top: 76px;
    left: 50%;
    translate: -50% 0;
  }
</style>
