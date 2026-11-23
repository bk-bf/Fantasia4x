<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { environmentService, getAmbientLight } from '$lib/game/services/EnvironmentService';
  import {
    anchorSheet,
    driftAt,
    fallAt,
    planWeather,
    sheetDrift,
    sheetKey,
    sheetMotion,
    sheetReach,
    tileImage,
    weatherMoves
  } from './weatherPlan';

  let { scale, origin = { x: 0, y: 0 } }: { scale: number; origin?: { x: number; y: number } } =
    $props();

  const light = $derived(getAmbientLight(environmentService.ambientTurn($gameState)));
  const moving = weatherMoves();
  const groups = $derived(planWeather($gameState.weather, light, scale));
</script>

<div class="weather" aria-hidden="true">
  {#each groups as g (g.kind)}
    <div class="group" style:opacity={g.opacity} style:background={g.tint || null}>
      {#each g.sheets as s (sheetKey(s))}
        {@const a = anchorSheet(s, origin.x, origin.y, moving)}
        {@const reach = sheetReach(s, moving)}
        <b
          style:translate="{a.x}px {a.y}px"
          {@attach sheetDrift(s)}
          {@attach driftAt(a.drift, s.drift?.secs ?? 0)}
        >
          <i
            style:left="{-reach.left}px"
            style:top="{-reach.top}px"
            style:width="calc(100% + {reach.w}px)"
            style:height="calc(100% + {reach.h}px)"
            style:background-image={tileImage(s.tile)}
            style:background-size={s.size}
            style:image-rendering={s.soft ? 'auto' : 'pixelated'}
            {@attach sheetMotion(s)}
            {@attach fallAt(a.phase, s.secs)}
          ></i>
        </b>
      {/each}
    </div>
  {/each}
</div>

<style>
  .weather,
  .group,
  b {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .weather,
  .group {
    overflow: hidden;
  }
  .weather {
    z-index: 5;
  }
  b {
    will-change: transform;
  }
  i {
    position: absolute;
  }
</style>
