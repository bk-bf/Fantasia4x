<script lang="ts">
  import { ribbon } from '$lib/pixelArt/cloth';
  import { picture, toArt } from '$lib/pixelArt/picture';
  import { DYES } from '$lib/components/UI/menu/mainMenuFlagArt';

  const CLOTH_H = 56;

  let {
    label,
    key,
    dye,
    width,
    on,
    disabled,
    note,
    onclick
  }: {
    label: string;
    key: string;
    dye: number;
    width: number;
    on: boolean;
    disabled: boolean;
    note?: string;
    onclick: () => void;
  } = $props();

  const cloth = $derived(toArt(ribbon(width, CLOTH_H, DYES[dye % DYES.length], dye, on)));
</script>

<button
  class="flag"
  class:on
  {disabled}
  style:width="{width}px"
  aria-pressed={on}
  aria-label={note ? `${label}, ${note}` : label}
  data-title={note}
  {onclick}
>
  <span class="cloth" {@attach picture(cloth)}></span>
  <span class="label">{label}</span>
  <kbd>{key}</kbd>
</button>

<style>
  .flag {
    position: relative;
    height: 42px;
    padding: 2px 0 11px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    isolation: isolate;
    border: 0;
    background: none;
    font: 20px/16px var(--font-banner);
    color: var(--ember);
    text-shadow: 1px 1px 0 rgb(0 0 0 / 0.6);
    cursor: pointer;
    pointer-events: auto;
    transition: height 0.1s;
  }
  .flag:hover:not(:disabled) {
    height: 47px;
  }
  .flag.on {
    height: 52px;
    padding-bottom: 13px;
  }
  .flag:disabled {
    cursor: default;
    filter: saturate(0.25) brightness(0.62);
  }
  .cloth {
    position: absolute;
    left: 0;
    bottom: 0;
    z-index: -1;
    filter: url(#ambient-tint) drop-shadow(2px 2px 0 rgb(6 4 3 / 0.5));
  }
  .label,
  kbd {
    position: relative;
  }
  kbd {
    font: 16px/11px var(--font-pixel);
    opacity: 0.7;
  }
  :global(.tight) kbd {
    display: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .flag {
      transition: none;
    }
  }
</style>
