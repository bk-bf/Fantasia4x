<script lang="ts">
  import type { FloatingTextOverlay } from '$lib/stores/fx/worldEffects';
  import { showDialogBubbles } from '$lib/stores/uiPrefs';
  import { chrome } from '$lib/pixelArt/chrome';

  let { overlays, scale }: { overlays: FloatingTextOverlay[]; scale: number } = $props();
</script>

{#each overlays as overlay (overlay.id)}
  {@const at = `transform: translate(${overlay.left}px, ${overlay.top}px) translateX(-50%) scale(${scale});`}
  {#if overlay.kind === 'social'}
    {#if $showDialogBubbles}
      <div class="social-bubble" style={at} {@attach chrome('tag')}>
        <span>{overlay.text}</span>
      </div>
    {/if}
  {:else}
    <div
      class="combat-float {overlay.kind}"
      style="{at}{overlay.color ? ` color:${overlay.color};` : ''}"
    >
      {overlay.text}
    </div>
  {/if}
{/each}

<style>
  .combat-float {
    position: absolute;
    left: 0;
    top: 0;
    font:
      16px/16px 'Fantasia Block',
      var(--font-display);
    letter-spacing: 0.5px;
    white-space: nowrap;
    pointer-events: none;
    text-shadow: 1px 1px 0 #0b0806;
    will-change: transform, opacity;
    animation: combat-float-rise 0.9s ease-out forwards;
  }
  @keyframes combat-float-rise {
    0% {
      opacity: 0;
      margin-top: 2px;
    }
    15% {
      opacity: 1;
    }
    70% {
      opacity: 1;
      margin-top: -16px;
    }
    100% {
      opacity: 0;
      margin-top: -24px;
    }
  }
  .combat-float.damage {
    color: #ff8a70;
  }
  .combat-float.crit {
    color: #ff5a3c;
    font-size: 20px;
    line-height: 20px;
  }
  .combat-float.miss {
    color: #cdbd96;
  }
  .combat-float.dodge {
    color: #a4d4f2;
  }
  .combat-float.bleed {
    color: #e0443a;
  }
  .combat-float.knockdown {
    color: #ffcf6a;
  }
  .combat-float.fracture {
    color: #ff9944;
  }
  .combat-float.condition {
    color: #f2e8cc;
  }
  .social-bubble {
    position: absolute;
    left: 0;
    top: 0;
    box-sizing: border-box;
    width: max-content;
    max-width: 210px;
    padding: 4px 9px;
    pointer-events: none;
    font: 16px/16px var(--font-pixel);
    letter-spacing: 0.6px;
    color: var(--text);
    white-space: normal;
    animation: social-float-dwell 4.5s ease-out forwards;
  }
  .social-bubble span {
    display: block;
    filter: url(#ambient-tint-legible);
  }
  @keyframes social-float-dwell {
    0% {
      opacity: 0;
      margin-top: 2px;
    }
    6% {
      opacity: 1;
    }
    80% {
      opacity: 1;
      margin-top: -10px;
    }
    100% {
      opacity: 0;
      margin-top: -14px;
    }
  }
</style>
