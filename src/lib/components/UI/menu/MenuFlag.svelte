<script lang="ts">
  import { pixels } from '$lib/pixelArt/pixels';
  import { swayStrip, type FlagFace, type SwayStrip } from './mainMenuFlagArt';
  import { FLAG_H, SWAY_PAD, type Rect } from './mainMenuPlan';

  let {
    face,
    index,
    wind,
    rect,
    scale,
    disabled = false,
    onclick
  }: {
    face: FlagFace;
    index: number;
    wind: number;
    rect: Rect;
    scale: number;
    disabled?: boolean;
    onclick: () => void;
  } = $props();

  let hot = $state(false);

  const idle = $derived(swayStrip(face, index, wind, false));
  const lit = $derived(swayStrip(face, index, wind, true));
  const strip: SwayStrip = $derived(hot && !disabled ? lit : idle);
  const delay = $derived(-(((index * 0.618) % 1) * strip.seconds));

  const timing = $derived({
    '--frames': String(strip.frames),
    '--seconds': `${strip.seconds}s`,
    '--delay': `${delay}s`
  });
</script>

<button
  class="flag"
  class:hot
  {disabled}
  aria-label={face.note ? `${face.label}, ${face.note}` : face.label}
  style:left="{rect.x * scale}px"
  style:top="{rect.y * scale}px"
  style:width="{strip.frameW * scale}px"
  style:height="{FLAG_H * scale}px"
  style:--s={scale}
  onpointerenter={() => (hot = true)}
  onpointerleave={() => (hot = false)}
  onfocus={() => (hot = true)}
  onblur={() => (hot = false)}
  {onclick}
>
  <span
    class="frame cloth"
    {@attach pixels(strip.cloth, scale, timing)}
    style:top="{-SWAY_PAD * scale}px"
    style:height="{strip.frameH * scale}px"
  ></span>
  <span
    class="frame ink"
    {@attach pixels(strip.ink, scale, timing)}
    style:top="{-SWAY_PAD * scale}px"
    style:height="{strip.frameH * scale}px"
  ></span>
</button>

<style>
  .flag {
    position: absolute;
    display: block;
    padding: 0;
    margin: 0;
    border: 0;
    background: none;
    cursor: pointer;
    outline: none;
    pointer-events: auto;
  }
  .flag:disabled {
    cursor: default;
    filter: saturate(0.25) brightness(0.62);
  }
  .frame {
    position: absolute;
    left: 0;
    width: 100%;
    overflow: hidden;
  }
  .frame :global(canvas) {
    animation: sway var(--seconds) steps(var(--frames)) var(--delay) infinite;
  }
  .cloth {
    filter: url(#ambient-tint)
      drop-shadow(calc(var(--s) * 2px) calc(var(--s) * 2px) 0 rgb(6 4 3 / 0.5));
  }
  .hot .cloth {
    filter: url(#ambient-tint) brightness(1.2)
      drop-shadow(calc(var(--s) * 2px) calc(var(--s) * 2px) 0 rgb(6 4 3 / 0.5));
  }
  .ink {
    filter: url(#ambient-tint-legible);
  }
  .flag:disabled .ink {
    opacity: 0.5;
  }
  .flag:focus-visible .cloth {
    filter: url(#ambient-tint) brightness(1.2) drop-shadow(0 0 calc(var(--s) * 1px) #ffe680);
  }
  @keyframes sway {
    to {
      transform: translateY(-100%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .frame :global(canvas) {
      animation: none;
    }
  }
</style>
