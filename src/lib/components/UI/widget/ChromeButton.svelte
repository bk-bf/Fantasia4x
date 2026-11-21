<script lang="ts">
  import type { Snippet } from 'svelte';
  import { chrome } from '$lib/pixelArt/chrome';
  import type { GlyphName } from '$lib/pixelArt/glyphs';
  import type { RampName } from '$lib/pixelArt/palette';
  import type { ChromeKind } from '$lib/pixelArt/skins';
  import PixelGlyph from './PixelGlyph.svelte';

  let {
    on = false,
    mini = false,
    kind = 'btn',
    glyph,
    ramp,
    label,
    title,
    disabled = false,
    class: cls = '',
    onclick,
    children
  }: {
    on?: boolean;
    mini?: boolean;
    kind?: ChromeKind;
    glyph?: GlyphName;
    ramp?: RampName;
    label?: string;
    title?: string;
    disabled?: boolean;
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
  } = $props();
</script>

<button
  class="cbtn {cls}"
  class:on
  class:mini
  aria-label={label}
  aria-pressed={on}
  data-title={title}
  {disabled}
  {onclick}
  {@attach chrome(on ? 'btnOn' : kind)}
>
  {#if glyph}<PixelGlyph name={glyph} {ramp} />{/if}
  {#if children}<span>{@render children()}</span>{/if}
</button>

<style>
  .cbtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 22px;
    padding: 0 8px;
    border: 0;
    background: none;
    color: var(--text);
    font: 16px/18px var(--font-pixel);
    letter-spacing: 0.6px;
    white-space: nowrap;
    cursor: pointer;
  }
  .cbtn.mini {
    width: 19px;
    height: 19px;
    padding: 0;
  }
  .cbtn.on span {
    color: var(--ember);
  }
  .cbtn:disabled {
    color: var(--text-muted);
    cursor: default;
  }
  :global(:root[data-theme='timber']) .cbtn.on span {
    text-shadow:
      0 0 6px rgb(255 160 60 / 0.7),
      1px 1px 0 #0b0806;
  }
  :global(:root[data-theme='vellum']) .cbtn.on :global(.glyph canvas) {
    filter: invert(1);
  }
</style>
