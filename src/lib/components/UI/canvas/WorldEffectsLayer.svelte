<script lang="ts">
  import { worldEffects } from '$lib/stores/fx/worldEffects';
  import { cameraTileSize } from '$lib/stores/cameraView';
  import { gameState } from '$lib/stores/gameState';
  const isPaused = gameState.isPaused;
  import { environmentService, getAmbientLight } from '$lib/game/services/EnvironmentService';
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

  {#each $worldEffects.particleOverlays as overlay (overlay.id)}
    {@const fxScale = Math.max(0.35, Math.min(1.8, $cameraTileSize / BASE_TILE))}

    {@const amb = getAmbientLight(environmentService.ambientTurn($gameState))}
    {@const xf = `transform: translate(${overlay.left}px, ${overlay.top}px) translateX(-50%) scale(${fxScale}); filter: brightness(${amb});`}
    {#if overlay.effect === 'smoke'}
      <div class="lair-fx lair-smoke" style={xf}>
        <span class="puff p1">▒</span>
        <span class="puff p2">░</span>
        <span class="puff p3">▒</span>
        <span class="puff p4">░</span>
        <span class="puff p5">▒</span>
        <span class="puff p6">░</span>
      </div>
    {:else if overlay.effect === 'bloodmist'}
      <div class="lair-fx lair-bloodmist" style={xf}>
        <span class="fog blood-a"></span>
        <span class="fog blood-b"></span>
      </div>
    {:else if overlay.effect === 'miasma'}
      <div class="lair-fx lair-miasma" style={xf}>
        <span class="fog miasma-a"></span>
        <span class="fog miasma-b"></span>
      </div>
    {:else if overlay.effect === 'flies'}
      <div class="lair-fx lair-flies" style={xf}>
        <span class="fly f1">·</span>
        <span class="fly f2">·</span>
        <span class="fly f3">·</span>
        <span class="fly f4">·</span>
        <span class="fly f5">·</span>
        <span class="fly f6">·</span>
      </div>
    {:else if overlay.effect === 'feathers'}
      <div class="lair-fx lair-feathers" style={xf}>
        <span class="feather fe1">'</span>
        <span class="feather fe2">`</span>
        <span class="feather fe3">'</span>
        <span class="feather fe4">,</span>
        <span class="feather fe5">`</span>
      </div>
    {/if}
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

  .lair-smoke {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    width: 0;
    height: 0;
  }
  .puff {
    position: absolute;
    font-family: var(--font-mono);
    font-size: 18px;
    color: #4f4b45;
    opacity: 0;
    filter: blur(3px);
    text-shadow: 0 0 6px #3a3833;
    animation: smoke-rise 4.4s ease-out infinite;
    will-change: transform, opacity;
  }
  .puff.p1 {
    animation-delay: 0s;
    left: -3px;
  }
  .puff.p2 {
    animation-delay: 0.7s;
    left: 4px;
  }
  .puff.p3 {
    animation-delay: 1.4s;
    left: -6px;
  }
  .puff.p4 {
    animation-delay: 2.1s;
    left: 2px;
  }
  .puff.p5 {
    animation-delay: 2.8s;
    left: -1px;
  }
  .puff.p6 {
    animation-delay: 3.5s;
    left: 5px;
  }
  @keyframes smoke-rise {
    0% {
      opacity: 0;
      transform: translateY(2px) translateX(0) scale(0.7);
    }
    15% {
      opacity: 0.72;
    }
    45% {
      opacity: 0.55;
      transform: translateY(-44px) translateX(7px) scale(1.7);
    }
    75% {
      opacity: 0.3;
      transform: translateY(-86px) translateX(3px) scale(2.7);
    }
    100% {
      opacity: 0;
      transform: translateY(-124px) translateX(12px) scale(3.6);
    }
  }

  .lair-fx {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    width: 0;
    height: 0;
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

  .fly {
    position: absolute;
    font-family: var(--font-mono);
    font-size: 14px;
    font-weight: bold;
    color: #14110e;
    opacity: 0.85;
    will-change: transform;
  }
  .fly.f1 {
    animation: fly1 0.62s linear infinite;
  }
  .fly.f2 {
    animation: fly2 0.74s linear infinite;
  }
  .fly.f3 {
    animation: fly3 0.53s linear infinite;
  }
  .fly.f4 {
    animation: fly4 0.81s linear infinite;
  }
  .fly.f5 {
    animation: fly5 0.67s linear infinite;
  }
  .fly.f6 {
    animation: fly6 0.58s linear infinite;
  }
  @keyframes fly1 {
    0% {
      transform: translate(-8px, -3px);
    }
    30% {
      transform: translate(4px, -9px);
    }
    55% {
      transform: translate(9px, 2px);
    }
    80% {
      transform: translate(-2px, 6px);
    }
    100% {
      transform: translate(-8px, -3px);
    }
  }
  @keyframes fly2 {
    0% {
      transform: translate(6px, 4px);
    }
    28% {
      transform: translate(-5px, 8px);
    }
    52% {
      transform: translate(-9px, -2px);
    }
    78% {
      transform: translate(3px, -7px);
    }
    100% {
      transform: translate(6px, 4px);
    }
  }
  @keyframes fly3 {
    0% {
      transform: translate(0, -7px);
    }
    33% {
      transform: translate(7px, -1px);
    }
    60% {
      transform: translate(2px, 7px);
    }
    82% {
      transform: translate(-7px, 3px);
    }
    100% {
      transform: translate(0, -7px);
    }
  }
  @keyframes fly4 {
    0% {
      transform: translate(-6px, 5px);
    }
    26% {
      transform: translate(8px, 3px);
    }
    54% {
      transform: translate(5px, -6px);
    }
    80% {
      transform: translate(-9px, -4px);
    }
    100% {
      transform: translate(-6px, 5px);
    }
  }
  @keyframes fly5 {
    0% {
      transform: translate(3px, -5px);
    }
    30% {
      transform: translate(-8px, -6px);
    }
    58% {
      transform: translate(-4px, 6px);
    }
    84% {
      transform: translate(8px, 5px);
    }
    100% {
      transform: translate(3px, -5px);
    }
  }
  @keyframes fly6 {
    0% {
      transform: translate(-9px, 1px);
    }
    32% {
      transform: translate(-1px, -8px);
    }
    56% {
      transform: translate(9px, -3px);
    }
    80% {
      transform: translate(4px, 8px);
    }
    100% {
      transform: translate(-9px, 1px);
    }
  }

  .fog {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    will-change: transform, opacity;
  }
  .lair-bloodmist .fog {
    background: radial-gradient(
      circle,
      rgba(165, 40, 32, 0.3) 0%,
      rgba(120, 30, 26, 0.2) 38%,
      rgba(80, 22, 20, 0.08) 62%,
      rgba(60, 18, 16, 0) 80%
    );
    filter: blur(7px);
  }
  .blood-a {
    width: 124px;
    height: 92px;
    left: -62px;
    top: -46px;
    animation: blood-seethe 6s ease-in-out infinite;
  }
  .blood-b {
    width: 88px;
    height: 70px;
    left: -44px;
    top: -52px;
    animation: blood-seethe 8s ease-in-out infinite reverse;
    animation-delay: -2.4s;
  }
  @keyframes blood-seethe {
    0% {
      opacity: 0.22;
      transform: translate(0, 0) scale(0.96);
    }
    50% {
      opacity: 0.38;
      transform: translate(-6px, -4px) scale(1.14);
    }
    100% {
      opacity: 0.22;
      transform: translate(5px, 2px) scale(0.96);
    }
  }
  .lair-miasma .fog {
    background: radial-gradient(
      circle,
      rgba(120, 158, 84, 0.5) 0%,
      rgba(92, 126, 64, 0.3) 45%,
      rgba(64, 96, 48, 0) 74%
    );
    filter: blur(6px);
  }
  .miasma-a {
    width: 60px;
    height: 44px;
    left: -30px;
    top: -22px;
    animation: miasma-churn 6.5s ease-in-out infinite;
  }
  .miasma-b {
    width: 44px;
    height: 34px;
    left: -22px;
    top: -28px;
    animation: miasma-churn 8.5s ease-in-out infinite reverse;
    animation-delay: -3s;
  }
  @keyframes miasma-churn {
    0% {
      opacity: 0.4;
      transform: translate(0, 0) scale(0.95);
    }
    50% {
      opacity: 0.68;
      transform: translate(7px, -6px) scale(1.18);
    }
    100% {
      opacity: 0.4;
      transform: translate(-5px, 2px) scale(0.95);
    }
  }

  .feather {
    position: absolute;
    font-family: var(--font-mono);
    font-size: 18px;
    font-weight: bold;
    color: #c4bcb2;
    opacity: 0;
    animation: feather-fall 4s ease-in-out infinite;
    will-change: transform, opacity;
  }
  .feather.fe1 {
    animation-delay: 0s;
    left: -12px;
  }
  .feather.fe2 {
    animation-delay: 0.9s;
    left: 8px;
  }
  .feather.fe3 {
    animation-delay: 1.7s;
    left: -4px;
  }
  .feather.fe4 {
    animation-delay: 2.5s;
    left: 13px;
  }
  .feather.fe5 {
    animation-delay: 3.3s;
    left: -8px;
  }
  @keyframes feather-fall {
    0% {
      opacity: 0;
      transform: translateY(-34px) translateX(0) rotate(-18deg);
    }
    20% {
      opacity: 0.75;
    }
    50% {
      transform: translateY(-6px) translateX(16px) rotate(20deg);
    }
    80% {
      opacity: 0.5;
    }
    100% {
      opacity: 0;
      transform: translateY(26px) translateX(-10px) rotate(-14deg);
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
