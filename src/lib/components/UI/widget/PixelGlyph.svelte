<script lang="ts">
  import { pixels } from '$lib/pixelArt/pixels';
  import { glyph, type GlyphName } from '$lib/pixelArt/glyphs';
  import { RAMPS, type RampName } from '$lib/pixelArt/palette';
  import { SKINS } from '$lib/pixelArt/skins';
  import { uiTheme } from '$lib/stores/uiPrefs';

  let { name, ramp }: { name: GlyphName; ramp?: RampName } = $props();

  const skin = $derived(SKINS[$uiTheme]);
  const art = $derived(glyph(name, ramp ? RAMPS[ramp] : skin.glyphRamp, skin.glyphLine));
</script>

<i class="glyph" aria-hidden="true" {@attach pixels(art, 1)}></i>

<style>
  .glyph {
    display: inline-block;
    flex: none;
    width: 13px;
    height: 13px;
    vertical-align: middle;
  }
  .glyph :global(canvas) {
    filter: url(#ambient-tint-data);
  }
  :global(:root[data-theme='vellum']) .glyph :global(canvas) {
    filter: url(#ambient-tint-lit);
  }
</style>
