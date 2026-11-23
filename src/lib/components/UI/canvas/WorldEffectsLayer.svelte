<script lang="ts">
  import { worldEffects } from '$lib/stores/fx/worldEffects';
  import { cameraTileSize } from '$lib/stores/cameraView';
  import { gameState } from '$lib/stores/gameState';
  import { environmentService, getAmbientLight } from '$lib/game/services/EnvironmentService';
  import { weatherEffects, uiTheme } from '$lib/stores/uiPrefs';
  import WorldWeather from '$lib/components/UI/weather/WorldWeather.svelte';
  import GlyphFloats from './GlyphFloats.svelte';
  import LairEffects from './LairEffects.svelte';
  import ProjectileOverlays from './ProjectileOverlays.svelte';
  import CombatFloats from './CombatFloats.svelte';
  import { MAP_BAR_H, MAP_BAR_W, mapBarUrl } from './mapBar';

  const isPaused = gameState.isPaused;
  const BASE_TILE = 20;

  const floatScale = $derived(Math.max(0.25, Math.min(1.5, $cameraTileSize / BASE_TILE)));
  const combatFloatScale = $derived(Math.min(floatScale, 1.2));
  const fxScale = $derived(Math.max(0.35, Math.min(1.8, $cameraTileSize / BASE_TILE)));
  const amb = $derived(
    $worldEffects.particleOverlays.length > 0
      ? getAmbientLight(environmentService.ambientTurn($gameState))
      : 1
  );
  const barAt = (left: number, top: number) =>
    `transform: translate(${left}px, ${top}px) translateX(-50%) scale(${floatScale});`;
</script>

<div class="world-effects-layer" class:paused={$isPaused}>
  <GlyphFloats floats={$worldEffects.glyphFloats} {floatScale} />

  {#each $worldEffects.progressOverlays as overlay (overlay.id)}
    <img
      class="map-bar"
      alt=""
      width={MAP_BAR_W}
      height={MAP_BAR_H}
      src={mapBarUrl($uiTheme, 'honey', overlay.progress)}
      style={barAt(overlay.left, overlay.top)}
    />
  {/each}

  <LairEffects overlays={$worldEffects.particleOverlays} {fxScale} {amb} />
  <ProjectileOverlays overlays={$worldEffects.projectileOverlays} />

  {#each $worldEffects.healthOverlays as overlay (overlay.id)}
    <img
      class="map-bar"
      alt=""
      width={MAP_BAR_W}
      height={MAP_BAR_H}
      src={mapBarUrl($uiTheme, 'ember', overlay.health)}
      style={barAt(overlay.left, overlay.top)}
    />
  {/each}

  {#if $worldEffects.draftTargetOverlays.length > 0}
    <svg class="draft-target-line">
      {#each $worldEffects.draftTargetOverlays as overlay (overlay.id)}
        {@const last = overlay.points[overlay.points.length - 1]}
        <polyline points={overlay.points.map((p) => `${p.x},${p.y}`).join(' ')} />
        {#if last}<circle cx={last.x} cy={last.y} r="5" />{/if}
      {/each}
    </svg>
  {/if}

  <CombatFloats overlays={$worldEffects.floatingTextOverlays} scale={combatFloatScale} />
</div>
{#if $weatherEffects}
  <WorldWeather />
{/if}

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
  .map-bar {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
    image-rendering: pixelated;
    pointer-events: none;
    filter: url(#ambient-tint-data);
  }
  :global(:root[data-theme='vellum']) .map-bar {
    filter: url(#ambient-tint-lit);
  }
  .draft-target-line {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    fill: none;
    stroke: #ffe680;
    stroke-width: 2;
    filter: drop-shadow(1px 1px 0 #0d0a10);
  }
  .draft-target-line polyline {
    stroke-dasharray: 6 5;
  }
</style>
