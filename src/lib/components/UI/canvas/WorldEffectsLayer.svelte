<script lang="ts">
  import { worldEffects } from '$lib/stores/fx/worldEffects';
  import { cameraTileSize } from '$lib/stores/cameraView';
  import { gameState } from '$lib/stores/gameState';
  const isPaused = gameState.isPaused;
  import { weatherEffects, showDialogBubbles } from '$lib/stores/uiPrefs';
  import WeatherCanvas from './WeatherCanvas.svelte';

  const BASE_TILE = 20;

  $: floatScale = Math.max(0.25, Math.min(1.5, $cameraTileSize / BASE_TILE));

  $: combatFloatScale = Math.min(floatScale, 1.2);
</script>

<div class="world-effects-layer" class:paused={$isPaused}>
  {#each $worldEffects.glyphFloats as float (float.kind + float.id)}
    {@const xf = `transform: translate(${float.left}px, ${float.top}px) translateX(-50%) scale(${floatScale});`}
    {#if float.kind === 'sleep'}
      <div class="zzz-float" style={xf}>
        <span class="zzz-z" style="animation-delay:0s">Z</span><span
          class="zzz-z"
          style="animation-delay:0.7s">z</span
        ><span class="zzz-z" style="animation-delay:1.4s">z</span>
      </div>
    {:else if float.kind === 'rest'}
      <div class="rest-float" style={xf}>
        <span class="rest-cross" style="animation-delay:0s">✚</span><span
          class="rest-cross"
          style="animation-delay:0.7s">✚</span
        ><span class="rest-cross" style="animation-delay:1.4s">✚</span>
      </div>
    {:else if float.kind === 'collapse'}
      <div class="collapse-float" style={xf}>
        <span class="collapse-arrow" style="animation-delay:0s">↓</span><span
          class="collapse-arrow"
          style="animation-delay:0.7s">↓</span
        ><span class="collapse-arrow" style="animation-delay:1.4s">↓</span>
      </div>
    {:else if float.kind === 'winded'}
      <div class="winded-float" style={xf}>
        <span class="winded-arrow" style="animation-delay:0s">↓</span><span
          class="winded-arrow"
          style="animation-delay:0.7s">↓</span
        ><span class="winded-arrow" style="animation-delay:1.4s">↓</span>
      </div>
    {:else if float.kind === 'campfire'}
      <div class="fire-sparks" style={xf}>
        <span class="spark s1">·</span>
        <span class="spark s2">*</span>
        <span class="spark s3">·</span>
        <span class="spark s4">*</span>
        <span class="spark s5">·</span>
      </div>
    {:else if float.kind === 'trade'}
      <div class="trade-float" style={xf}>
        <span class="trade-mark">?</span>
      </div>
    {/if}
  {/each}

  {#each $worldEffects.progressOverlays as overlay (overlay.id)}
    <div
      class="pawn-progress-float"
      style="transform: translate({overlay.left}px, {overlay.top}px) translateX(-50%) scale({floatScale});"
    >
      <div class="pawn-progress-fill" style="width:{overlay.progress * 100}%"></div>
    </div>
  {/each}

  {#each $worldEffects.projectileOverlays as o (o.id)}
    {#if o.progress < 1}
      <div
        class="projectile fx-{o.effect}"
        style="transform: translate({o.left}px, {o.top}px) rotate({o.angle}deg);"
      >
        <span class="proj-trail"></span>
        <span class="proj-head"></span>
      </div>
    {:else}
      <div class="proj-impact-wrap" style="transform: translate({o.left}px, {o.top}px);">
        <div class="proj-impact fx-{o.effect}"></div>
      </div>
    {/if}
  {/each}

  {#each $worldEffects.healthOverlays as overlay (overlay.id)}
    <div
      class="health-bar-float"
      style="transform: translate({overlay.left}px, {overlay.top}px) translateX(-50%);"
    >
      <div
        class="health-bar-fill"
        class:pawn={overlay.type === 'pawn'}
        class:mob={overlay.type === 'mob'}
        style="width:{overlay.health * 100}%"
      ></div>
    </div>
  {/each}

  {#if $worldEffects.draftTargetOverlays.length > 0}
    <svg
      class="draft-target-line"
      style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none;"
    >
      {#each $worldEffects.draftTargetOverlays as overlay (overlay.id)}
        {@const last = overlay.points[overlay.points.length - 1]}
        <polyline
          points={overlay.points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#ff4444"
          stroke-width="2"
          stroke-dasharray="4,4"
          opacity="0.7"
        />
        {#if last}
          <circle cx={last.x} cy={last.y} r="4" fill="#ff4444" opacity="0.5" />
        {/if}
      {/each}
    </svg>
  {/if}

  {#each $worldEffects.floatingTextOverlays as overlay (overlay.id)}
    {#if overlay.kind === 'social'}
      {#if $showDialogBubbles}
        <div
          class="social-bubble"
          style="transform: translate({overlay.left}px, {overlay.top}px) translateX(-50%) scale({combatFloatScale});"
        >
          <span class="combat-float social">{overlay.text}</span>
        </div>
      {/if}
    {:else}
      <div
        class="combat-float {overlay.kind}"
        style="transform: translate({overlay.left}px, {overlay.top}px) translateX(-50%) scale({combatFloatScale});{overlay.color
          ? ` color:${overlay.color};`
          : ''}"
      >
        {overlay.text}
      </div>
    {/if}
  {/each}

  {#if $weatherEffects}
    <WeatherCanvas />
  {/if}
</div>

<style>
  .world-effects-layer {
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    overflow: hidden;
  }
  .world-effects-layer.paused :global(*) {
    animation-play-state: paused !important;
  }

  .pawn-progress-float {
    position: absolute;
    left: 0;
    top: 0;
    width: 22px;
    height: 4px;
    background: rgba(32, 24, 10, 0.85);
    border: 1px solid #705020;
    pointer-events: none;
  }

  .pawn-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4ab85a, #8ad66a);
  }

  .zzz-float {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    display: flex;
    gap: 1px;
  }

  .zzz-z {
    color: #7788ff;
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: bold;
    opacity: 0;
    animation: zzz-rise 2.1s ease-out infinite;
    text-shadow: 0 0 4px #334;
    will-change: transform, opacity;
  }

  @keyframes zzz-rise {
    0% {
      opacity: 0;
      transform: translateY(2px) scale(0.75);
    }
    15% {
      opacity: 1;
    }
    70% {
      opacity: 0.7;
      transform: translateY(-14px) scale(1.1);
    }
    100% {
      opacity: 0;
      transform: translateY(-20px) scale(0.85);
    }
  }

  .trade-float {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    display: flex;
  }

  .trade-mark {
    color: #f0c040;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: bold;
    animation: trade-bob 1.6s ease-in-out infinite;
    text-shadow: 0 0 4px #630;
    will-change: transform;
  }

  @keyframes trade-bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-4px);
    }
  }

  .rest-float {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    display: flex;
    gap: 1px;
  }

  .rest-cross {
    color: #ff4d4d;
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: bold;
    opacity: 0;
    animation: zzz-rise 2.1s ease-out infinite;
    text-shadow: 0 0 4px #a00;
    will-change: transform, opacity;
  }

  .collapse-float {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    display: flex;
    gap: 1px;
  }

  .collapse-arrow {
    color: #e23b3b;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: bold;
    opacity: 0;
    animation: zzz-rise 2.1s ease-out infinite;
    text-shadow:
      0.6px 0 0 #e23b3b,
      -0.6px 0 0 #e23b3b,
      0 0.6px 0 #e23b3b,
      0 -0.6px 0 #e23b3b,
      0 0 4px #800;
    will-change: transform, opacity;
  }

  .winded-float {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    display: flex;
    gap: 1px;
  }

  .winded-arrow {
    color: #4aa3ff;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: bold;
    opacity: 0;
    animation: zzz-rise 2.1s ease-out infinite;
    text-shadow:
      0.6px 0 0 #4aa3ff,
      -0.6px 0 0 #4aa3ff,
      0 0.6px 0 #4aa3ff,
      0 -0.6px 0 #4aa3ff,
      0 0 4px #0a3a80;
    will-change: transform, opacity;
  }

  .fire-sparks {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    width: 0;
    height: 0;
  }

  .spark {
    position: absolute;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: bold;
    opacity: 0;
    animation: fire-rise 1.1s ease-out infinite;
    will-change: transform, opacity;
  }

  .s1 {
    color: #ff3300;
    animation-delay: 0s;
    left: -5px;
    text-shadow: 0 0 6px #ff1100;
  }
  .s2 {
    color: #ff8800;
    animation-delay: 0.22s;
    left: 3px;
    text-shadow: 0 0 6px #ff5500;
  }
  .s3 {
    color: #ffcc00;
    animation-delay: 0.44s;
    left: -1px;
    text-shadow: 0 0 6px #ff9900;
  }
  .s4 {
    color: #ff5500;
    animation-delay: 0.66s;
    left: 5px;
    text-shadow: 0 0 6px #ff2200;
  }
  .s5 {
    color: #ffee44;
    animation-delay: 0.88s;
    left: -3px;
    text-shadow: 0 0 6px #ffbb00;
  }

  @keyframes fire-rise {
    0% {
      opacity: 0;
      transform: translateY(2px) scale(1.5);
    }
    10% {
      opacity: 1;
    }
    50% {
      opacity: 0.85;
      transform: translateY(-18px) scale(1.1);
    }
    100% {
      opacity: 0;
      transform: translateY(-36px) scale(0.4);
    }
  }

  .projectile {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    pointer-events: none;
    will-change: transform;
  }
  .proj-trail {
    position: absolute;
    left: 0;
    top: -1px;
    height: 2px;
    width: 16px;
    transform: translateX(-100%);
    border-radius: 1px;
    background: linear-gradient(to right, transparent, var(--proj-color, #d8d4c8));
    opacity: 0.85;
  }
  .proj-head {
    position: absolute;
    left: -1.5px;
    top: -1.5px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--proj-color, #f0ead8);
    box-shadow: 0 0 3px var(--proj-color, #d8d4c8);
  }
  .fx-arrow {
    --proj-color: #d9d4c4;
  }
  .fx-bolt {
    --proj-color: #c8ccd4;
  }
  .fx-stone {
    --proj-color: #b6a98c;
  }
  .fx-spear {
    --proj-color: #cdbf9a;
  }
  .fx-fireball {
    --proj-color: #ff7a2a;
  }
  .fx-frostbolt {
    --proj-color: #8fd6ff;
  }
  .fx-spark {
    --proj-color: #ffe45e;
  }
  .fx-fireball .proj-head,
  .fx-frostbolt .proj-head,
  .fx-spark .proj-head {
    width: 5px;
    height: 5px;
    left: -2.5px;
    top: -2.5px;
    box-shadow: 0 0 6px var(--proj-color);
  }
  .fx-fireball .proj-trail,
  .fx-frostbolt .proj-trail,
  .fx-spark .proj-trail {
    width: 14px;
    height: 3px;
    top: -1.5px;
    opacity: 0.9;
  }
  .fx-stone .proj-trail {
    width: 9px;
    opacity: 0.5;
  }
  .fx-stone .proj-head {
    width: 4px;
    height: 4px;
    left: -2px;
    top: -2px;
  }
  .fx-spear .proj-trail {
    width: 22px;
    height: 3px;
    top: -1.5px;
  }
  .fx-bolt .proj-trail {
    width: 18px;
  }
  .proj-impact-wrap {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }
  .proj-impact {
    position: absolute;
    left: -4px;
    top: -4px;
    width: 8px;
    height: 8px;
    pointer-events: none;
    border-radius: 50%;
    background: radial-gradient(circle, var(--proj-color, #d8d4c8) 0%, transparent 70%);
    animation: proj-impact 180ms ease-out forwards;
  }
  @keyframes proj-impact {
    from {
      transform: scale(0.5);
      opacity: 0.9;
    }
    to {
      transform: scale(1.9);
      opacity: 0;
    }
  }

  .health-bar-float {
    position: absolute;
    left: 0;
    top: 0;
    width: 20px;
    height: 3px;
    background: rgba(32, 24, 10, 0.9);
    border: 1px solid #503020;
    pointer-events: none;
  }

  .health-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #cc3322, #ee5544);
  }

  .health-bar-fill.pawn {
    background: linear-gradient(90deg, #44aa66, #66cc88);
  }

  .health-bar-fill.mob {
    background: linear-gradient(90deg, #cc3322, #ee5544);
  }

  .combat-float {
    position: absolute;
    left: 0;
    top: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: bold;
    white-space: nowrap;
    pointer-events: none;
    text-shadow:
      0 0 3px #000,
      0 1px 2px #000;
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
    color: #ff6644;
  }
  .combat-float.crit {
    color: #ff3322;
    font-size: 15px;
  }
  .combat-float.miss {
    color: #bbbbbb;
    font-size: 11px;
  }
  .combat-float.dodge {
    color: #66ccee;
    font-size: 11px;
  }
  .combat-float.bleed {
    color: #cc2222;
    font-size: 11px;
  }
  .combat-float.knockdown {
    color: #ffcc44;
    font-size: 11px;
  }
  .combat-float.fracture {
    color: #ff9944;
    font-size: 11px;
  }
  .combat-float.condition {
    color: #cccccc;
    font-size: 11px;
    font-style: italic;
  }
  .social-bubble {
    position: absolute;
    left: 0;
    top: 0;
    min-width: 40px;
    min-height: 24px;
    padding: 2px 4px;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    pointer-events: none;
  }
  .social-bubble .combat-float.social {
    position: relative;
    left: auto;
    top: auto;
  }
  .combat-float.social {
    color: #ffffff;
    font-size: 10px;
    font-weight: normal;
    font-style: italic;
    white-space: normal;
    max-width: 160px;
    width: max-content;
    text-shadow:
      0 0 3px #000,
      0 1px 2px #000,
      0 0 6px #000;
    animation: social-float-dwell 4.5s ease-out forwards;
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
