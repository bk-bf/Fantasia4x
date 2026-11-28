<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { environmentService, getAmbientLight } from '$lib/game/services/EnvironmentService';
  import {
    planWeather,
    sheetGust,
    tileImage,
    weatherDriver,
    type WeatherView
  } from './weatherPlan';

  let { scale, view = { x: 0, y: 0 } }: { scale: number; view?: WeatherView } = $props();

  const light = $derived(getAmbientLight(environmentService.ambientTurn($gameState)));
  const groups = $derived(planWeather($gameState.weather, light));
  const { track, drive } = weatherDriver(() => ({ scale, view }));
</script>

<div class="weather" aria-hidden="true" {@attach drive}>
  {#each groups as g (g.kind)}
    <div class="group" style:opacity={g.opacity} style:background={g.tint || null}>
      {#each g.sheets as s (s.tile)}
        <b {@attach track(s)}>
          <i
            style:background-image={tileImage(s.tile)}
            style:image-rendering={s.soft ? 'auto' : 'pixelated'}
            {@attach sheetGust(s)}
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
    will-change: translate;
  }
  i {
    position: absolute;
    left: 0;
    top: 0;
  }
</style>
