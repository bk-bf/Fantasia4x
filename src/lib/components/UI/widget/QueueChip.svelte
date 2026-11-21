<script lang="ts">
  import { chrome } from '$lib/pixelArt/chrome';
  import ChromeButton from './ChromeButton.svelte';
  import SpriteIcon from './SpriteIcon.svelte';

  let {
    name,
    qty = 1,
    item = null,
    building = null,
    progress,
    state,
    title,
    target = false,
    onpause,
    oncancel,
    ondragstart,
    ondragend,
    ondrop
  }: {
    name: string;
    qty?: number;
    item?: string | null;
    building?: string | null;
    progress: number;
    state: 'run' | 'wait' | 'pause';
    title: string;
    target?: boolean;
    onpause: () => void;
    oncancel: () => void;
    ondragstart: () => void;
    ondragend: () => void;
    ondrop: () => void;
  } = $props();

  const word = $derived(
    state === 'wait' ? 'waiting' : state === 'pause' ? 'paused' : `${progress}%`
  );
</script>

<div
  class="qchip {state}"
  class:target
  draggable="true"
  role="listitem"
  data-title={title}
  {ondragstart}
  {ondragend}
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => {
    e.preventDefault();
    e.stopPropagation();
    ondrop();
  }}
  {@attach chrome('cell')}
>
  {#if state !== 'wait'}<i class="qfill" style:width="{progress}%"></i>{/if}
  <i class="grip">⠿</i>
  <SpriteIcon {item} {building} px={16} />
  <b
    >{name}{#if qty > 1}&nbsp;×{qty}{/if}</b
  >
  <em>{word}</em>
  <ChromeButton
    mini
    glyph={state === 'pause' ? 'play' : 'pause'}
    label={state === 'pause' ? 'Resume' : 'Pause'}
    onclick={(e) => {
      e.stopPropagation();
      onpause();
    }}
  />
  <ChromeButton
    mini
    glyph="x"
    label="Cancel"
    onclick={(e) => {
      e.stopPropagation();
      oncancel();
    }}
  />
</div>

<style>
  .qchip {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 2px 0 4px;
    margin-bottom: 2px;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text-muted) 50%, transparent);
    cursor: grab;
  }
  .qchip:active {
    cursor: grabbing;
  }
  .qchip.target:hover {
    box-shadow: inset 0 0 0 1px var(--accent-hi);
  }
  .qfill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: -1;
    background: color-mix(in srgb, var(--accent-hi) 22%, transparent);
    pointer-events: none;
  }
  .grip {
    font-style: normal;
    color: var(--text-muted);
  }
  b {
    flex: 1;
    min-width: 0;
    font-weight: normal;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  em {
    font-style: normal;
    color: var(--accent-hi);
    white-space: nowrap;
  }
  .wait em,
  .pause em {
    color: var(--text-muted);
  }
  .pause b {
    opacity: 0.7;
  }
  .qchip :global(.cbtn.mini) {
    width: 18px;
    height: 18px;
  }
</style>
