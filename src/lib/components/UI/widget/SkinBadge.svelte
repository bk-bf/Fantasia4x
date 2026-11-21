<script lang="ts">
  import { pixels } from '$lib/pixelArt/pixels';
  import type { GlyphName } from '$lib/pixelArt/glyphs';
  import { SKINS, type BadgeKind } from '$lib/pixelArt/skins';
  import { uiTheme } from '$lib/stores/uiPrefs';

  let { glyph, kind }: { glyph: GlyphName; kind: BadgeKind } = $props();

  const art = $derived(SKINS[$uiTheme].badge(glyph, kind));
</script>

<i class="skin-badge" aria-hidden="true" {@attach pixels(art, 1)}></i>

<style>
  .skin-badge {
    display: inline-block;
    flex: none;
    width: 17px;
    height: 17px;
    vertical-align: middle;
  }
  .skin-badge :global(canvas) {
    filter: url(#ambient-tint-data);
  }
  :global(:root[data-theme='vellum']) .skin-badge :global(canvas) {
    filter: url(#ambient-tint-lit);
  }
</style>
