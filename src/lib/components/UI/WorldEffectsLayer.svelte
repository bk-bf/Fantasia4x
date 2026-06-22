<!-- WorldEffectsLayer: sits above tiles (z-index 5) but below popup panels (z-index 10).
     All in-world animations and fullscreen shader overlays are docked here.

     ── VISUAL-EFFECT HIERARCHY (three tiers, lowest → highest) ─────────────────────────────────
       1. GLOW / LIGHTING  — LightingService.collectResourceEmitters bakes per-tile point lights
          into the WebGL tile-light field (terrain SHADING, not an overlay). Use for: a thing that
          should LIGHT its surroundings (campfire, lava, glowing grove). Onboard: add a `glow` block
          to the resource/building def — no render code.
       2. WEATHER          — WeatherCanvas: one pooled fullscreen 2D-canvas particle field, zoom-
          reactive (subscribes cameraTileSize → scales count/size). Use for: GLOBAL atmosphere
          (rain, snow, dust). Onboard: extend the weather data + WeatherCanvas draw modes.
       3. WORLD EFFECTS    — THIS layer: per-entity / per-tile CSS overlays positioned in screen
          space by GameCanvas.updateWorldEffectOverlays (which owns viewX/tileWidth). Use for:
          a LOCAL animation pinned to one tile/entity (Zzz, progress bar, health bar, combat float,
          lair smoke/flies/fog). Onboard a new effect — reuse these existing circuits:
            a) add an overlay type + setter to worldEffects.ts (the store);
            b) populate it in GameCanvas.updateWorldEffectOverlays (project tile→screen px there);
            c) render + animate it below (CSS keyframes).
          Lair particle effects additionally read `fxScale` (cameraTileSize / BASE_TILE) so they
          shrink/grow WITH the map zoom — never giant blobs when zoomed out. -->
<script lang="ts">
  import { worldEffects } from '$lib/stores/worldEffects';
  import { cameraTileSize } from '$lib/stores/cameraView';
  import { gameState } from '$lib/stores/gameState';
  import { environmentService, getAmbientLight } from '$lib/game/services/EnvironmentService';
  import WeatherCanvas from './WeatherCanvas.svelte';

  // Lair effects are authored at this reference tile size (px); fxScale tracks the live zoom so a
  // "3-tile-wide" plume stays 3 tiles at any zoom instead of a fixed pixel size (the weather canvas
  // scales the same way). Clamped so it never vanishes or becomes absurd at the zoom extremes.
  const BASE_TILE = 20;

  // Per-entity floats (Zzz / ✚ / ↓, craft progress bars, campfire sparks) are authored at BASE_TILE px;
  // without scaling they stay a fixed pixel size while the tiles shrink on zoom-out, so a busy colony
  // tiles the whole screen with overlays. Track the live zoom so each stays ~1 tile across at any zoom
  // (shrinks out, grows in), clamped. (Lair PARTICLE effects compute their own fxScale separately.)
  $: floatScale = Math.max(0.25, Math.min(1.5, $cameraTileSize / BASE_TILE));

  // Floating combat text (damage numbers + condition labels) reads as cluttered at full zoom-in, so
  // cap its scale 20% below the other floats' 1.5 ceiling (1.5 × 0.8 = 1.2). Lower zooms are unchanged
  // (floatScale is already < 1.2 there); only the max-zoom end shrinks.
  $: combatFloatScale = Math.min(floatScale, 1.2);
</script>

<div class="world-effects-layer">
  <!-- ── World-Space Animations (positions derived from tile coordinates) ──────── -->

  <!-- Anchored looping glyph floats — ONE each-block over a `kind`-discriminated array (was four
       near-identical blocks for sleep / recovery / collapse / campfire). All share this positioning +
       zoom-scaling wrapper; only the inner glyph cluster + its CSS animation differ per kind. -->
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
      <!-- Recovery: same rising stagger as the Zzz of sleep, but red ✚ crosses (a wounded-resting tell). -->
      <div class="rest-float" style={xf}>
        <span class="rest-cross" style="animation-delay:0s">✚</span><span
          class="rest-cross"
          style="animation-delay:0.7s">✚</span
        ><span class="rest-cross" style="animation-delay:1.4s">✚</span>
      </div>
    {:else if float.kind === 'collapse'}
      <!-- Collapsed/downed: same rising stagger as the Zzz of sleep, but red ↓ arrows (emergency tell). -->
      <div class="collapse-float" style={xf}>
        <span class="collapse-arrow" style="animation-delay:0s">↓</span><span
          class="collapse-arrow"
          style="animation-delay:0.7s">↓</span
        ><span class="collapse-arrow" style="animation-delay:1.4s">↓</span>
      </div>
    {:else if float.kind === 'campfire'}
      <div class="fire-sparks" style={xf}>
        <span class="spark s1">·</span>
        <span class="spark s2">*</span>
        <span class="spark s3">·</span>
        <span class="spark s4">*</span>
        <span class="spark s5">·</span>
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

  <!-- Ambient per-tile particle effects — grim lair "tells". -->
  {#each $worldEffects.particleOverlays as overlay (overlay.id)}
    {@const fxScale = Math.max(0.35, Math.min(1.8, $cameraTileSize / BASE_TILE))}
    <!-- Dim with the day/night cycle so these read as PARTICLES, not light sources — they must not
         glow in the dark (that's the separate `glow` lighting tier's job). Use the ambient light
         DIRECTLY (no extra floor): getAmbientLight already bottoms at 0.15 — the SAME value the WebGL
         terrain dims to at night — so the effect tracks the world instead of sitting brighter than it. -->
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

  <!-- ── Ranged projectiles — a travelling particle streak + an impact puff on arrival ───── -->
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

  <!-- ── Draft target lines ────────────────────────────────────────────────────── -->
  <!-- All draft lines share ONE full-screen SVG. Previously each line was its own 100%×100% <svg>,
       so a group move spawned N full-viewport compositing layers repainting every frame — that
       starved the main-thread sim loop and tanked TPS (see ENGINE-PERFORMANCE.md, render-boundary). -->
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

  <!-- ── Floating combat text (damage / miss / dodge / crit / bleed) ───────────── -->
  <!-- Damage numbers and data-driven condition labels (winded, envenomed…) — share the same zoom
       scaling as the other per-tile floats so they shrink/grow with the map instead of staying a fixed
       pixel size (a wall of full-size text when zoomed out on a busy fight). The rise/fade keyframe
       animates margin-top, so this scale() on the inline transform is preserved throughout. -->
  {#each $worldEffects.floatingTextOverlays as overlay (overlay.id)}
    <div
      class="combat-float {overlay.kind}"
      style="transform: translate({overlay.left}px, {overlay.top}px) translateX(-50%) scale({combatFloatScale});{overlay.color
        ? ` color:${overlay.color};`
        : ''}"
    >
      {overlay.text}
    </div>
  {/each}

  <!-- ── Fullscreen Weather Overlay (SEASONS_WEATHER) ──────────────────────────── -->
  <!-- Rain/snow particle system on a 2D canvas — reads the weather store itself, idles when clear. -->
  <WeatherCanvas />
</div>

<style>
  .world-effects-layer {
    position: absolute;
    inset: 0;
    /* Above canvas tiles, below overlay panels (z-index: 10) */
    z-index: 5;
    pointer-events: none;
    overflow: hidden;
  }

  /* ── Working progress bar ───────────────────────────────────────────────────── */

  .pawn-progress-float {
    position: absolute;
    left: 0;
    top: 0;
    width: 22px;
    height: 4px;
    background: rgba(32, 24, 10, 0.85);
    border: 1px solid #705020;
    pointer-events: none;
    /* centering + positioning via inline style transform: translate(X,Y) translateX(-50%) */
  }

  .pawn-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4ab85a, #8ad66a);
  }

  /* ── Zzz sleeping animation ──────────────────────────────────────────────────── */

  .zzz-float {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    display: flex;
    gap: 1px;
    /* centering + positioning via inline style transform: translate(X,Y) translateX(-50%) */
  }

  .zzz-z {
    color: #7788ff;
    font-family: 'Courier New', monospace;
    font-size: 8px;
    font-weight: bold;
    opacity: 0;
    animation: zzz-rise 2.1s ease-out infinite;
    text-shadow: 0 0 4px #334;
    /* Promote to its own compositor layer so the looping opacity/transform
       animation composites on the GPU instead of re-rasterising the blurred
       text-shadow every frame — this is what tanked FPS at night when many
       pawns slept at once. */
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

  /* ── Recovery (wounded, lying down) — the SAME rising stagger as the Zzz of sleep / the ↓ of collapse,
     but red ✚ crosses, so a resting wounded pawn animates like the other lying-down tells. ── */

  .rest-float {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    display: flex;
    gap: 1px;
    /* centering + positioning via inline style transform: translate(X,Y) translateX(-50%) scale(...) */
  }

  .rest-cross {
    color: #ff4d4d;
    font-family: 'Courier New', monospace;
    font-size: 8px;
    font-weight: bold;
    opacity: 0;
    /* Reuse the Zzz rise (opacity + translateY + scale) — colour/glyph are the only difference. */
    animation: zzz-rise 2.1s ease-out infinite;
    text-shadow: 0 0 4px #a00;
    will-change: transform, opacity;
  }

  /* ── Collapsed (downed: pain / blood loss / starvation) — the SAME rising stagger as the Zzz of sleep,
     but red ↓ arrows: a fainted pawn reads as an emergency yet animates like the sleep tell it replaces. ── */

  .collapse-float {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    display: flex;
    gap: 1px;
    /* centering + positioning via inline style transform: translate(X,Y) translateX(-50%) scale(...) */
  }

  .collapse-arrow {
    color: #e23b3b;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    font-weight: bold;
    opacity: 0;
    /* Reuse the Zzz rise (opacity + translateY + scale) — colour/glyph are the only difference. */
    animation: zzz-rise 2.1s ease-out infinite;
    /* The thin ↓ glyph reads lighter than the heavy ✚ recovery cross, so thicken its stroke with
       same-colour offset shadows (on top of the red emergency glow) to match that visual weight. */
    text-shadow:
      0.6px 0 0 #e23b3b,
      -0.6px 0 0 #e23b3b,
      0 0.6px 0 #e23b3b,
      0 -0.6px 0 #e23b3b,
      0 0 4px #800;
    will-change: transform, opacity;
  }

  /* ── Campfire fire animation ─────────────────────────────────────────────────── */

  .fire-sparks {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    width: 0;
    height: 0;
    /* centering + positioning via inline style transform: translate(X,Y) translateX(-50%) */
  }

  .spark {
    position: absolute;
    font-family: 'Courier New', monospace;
    font-size: 10px;
    font-weight: bold;
    opacity: 0;
    animation: fire-rise 1.1s ease-out infinite;
    /* Same reasoning as .zzz-z: keep the blurred spark text-shadow off the
       per-frame raster path by compositing on the GPU. */
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

  /* Lair smoke — soft blurred shade-block haze that drifts up and dissipates. */
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
    font-family: 'Courier New', monospace;
    font-size: 17px;
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

  /* Shared positioning for every lair particle effect (placed via inline transform). */
  .lair-fx {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    width: 0;
    height: 0;
  }

  /* ── Ranged projectiles — the inline transform places + rotates so local +x is travel dir. ─── */
  .projectile {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    pointer-events: none;
    will-change: transform;
  }
  /* Trail: a soft streak fading from the tail (transparent) up to the head (colour), behind origin. */
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
  /* §M arcane staff bolts — elemental colours; brighter heads/trails than mundane shot. */
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
  /* Impact: a quick radial puff that expands and fades once on arrival. The wrapper carries the
   *  inline translate so the inner element's scale animation doesn't clobber the position. */
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

  /* ── flies (wolf den — carrion buzz): tiny dark specks jittering over the den ── */
  .fly {
    position: absolute;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    font-weight: bold;
    color: #14110e;
    opacity: 0.85;
    will-change: transform;
  }
  /* Each fly has its OWN erratic path + speed (no shared keyframe), so the swarm darts chaotically
     instead of tracing one synchronised criss-cross. Paths stay within ~±10px of the den. */
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

  /* Soft volumetric fog blob — a blurred radial-gradient cloud (bloodmist / miasma). Centered on
     the tile (negative left/top = half its own size), large enough to spill into neighbours; two
     layers (a/b) drift against each other so the fog churns rather than pulsing uniformly. */
  .fog {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    will-change: transform, opacity;
  }
  .lair-bloodmist .fog {
    background: radial-gradient(
      circle,
      rgba(165, 40, 32, 0.6) 0%,
      rgba(120, 30, 26, 0.4) 38%,
      rgba(80, 22, 20, 0.16) 62%,
      rgba(60, 18, 16, 0) 80%
    );
    filter: blur(7px);
  }
  /* ~2-3 tile radius (at BASE_TILE 20): a broad seething pool of blood-haze around the den. */
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
      opacity: 0.42;
      transform: translate(0, 0) scale(0.96);
    }
    50% {
      opacity: 0.72;
      transform: translate(-6px, -4px) scale(1.14);
    }
    100% {
      opacity: 0.42;
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

  /* ── feathers (harpy roost): pale shed feathers drifting DOWN, swaying ── */
  .feather {
    position: absolute;
    font-family: 'Courier New', monospace;
    font-size: 17px;
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

  /* ── Health bar overlays ───────────────────────────────────────────────────── */

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

  /* ── Floating combat text ──────────────────────────────────────────────────── */

  .combat-float {
    position: absolute;
    left: 0;
    top: 0;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    font-weight: bold;
    white-space: nowrap;
    pointer-events: none;
    text-shadow:
      0 0 3px #000,
      0 1px 2px #000;
    /* GPU-composite the rise/fade so the blurred text-shadow isn't re-rasterised
       every frame (same reasoning as .zzz-z / .spark). */
    will-change: transform, opacity;
    animation: combat-float-rise 0.9s ease-out forwards;
  }

  /* The keyframe rise stacks ON TOP of the inline translate() that positions the
     label over its tile, so the base position still tracks the camera each frame. */
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
    font-size: 14px;
  }
  .combat-float.miss {
    color: #bbbbbb;
    font-size: 10px;
  }
  .combat-float.dodge {
    color: #66ccee;
    font-size: 10px;
  }
  .combat-float.bleed {
    color: #cc2222;
    font-size: 10px;
  }
  .combat-float.knockdown {
    color: #ffcc44;
    font-size: 10px;
  }
  /* Data-driven condition labels (winded, envenomed, …): colour set inline from conditions.jsonc;
     slightly smaller + italic so they read as a status cue, distinct from the damage number. */
  .combat-float.condition {
    color: #cccccc;
    font-size: 10px;
    font-style: italic;
  }
</style>
