<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { environmentService, getAmbientLight } from '$lib/game/services/EnvironmentService';
  import { planWeather, sheetKey, sheetMotion, tileImage } from './weatherPlan';

  let { scale }: { scale: number } = $props();

  const light = $derived(getAmbientLight(environmentService.ambientTurn($gameState)));
  const groups = $derived(planWeather($gameState.weather, light, scale));
</script>

<div class="weather" aria-hidden="true">
  {#each groups as g (g.kind)}
    <div class="group" style:opacity={g.opacity} style:background={g.tint || null}>
      {#each g.sheets as s (sheetKey(s))}
        <i
          style:left="{s.tx > 0 ? -s.tx : 0}px"
          style:top="{-s.ty}px"
          style:width="calc(100% + {Math.abs(s.tx)}px)"
          style:height="calc(100% + {s.ty}px)"
          style:background-image={tileImage(s.tile)}
          style:background-size={s.size}
          style:image-rendering={s.soft ? 'auto' : 'pixelated'}
          {@attach sheetMotion(s)}
        ></i>
      {/each}
    </div>
  {/each}
</div>

<style>
  .weather,
  .group {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .weather {
    z-index: 5;
  }
  i {
    position: absolute;
  }
</style>
