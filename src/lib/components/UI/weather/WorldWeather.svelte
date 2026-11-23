<script lang="ts">
  import { cameraTileSize, cameraViewport } from '$lib/stores/cameraView';
  import WeatherLayer from './WeatherLayer.svelte';
  import { WEATHER_TILE, weatherScale } from './weatherPlan';
</script>

<WeatherLayer
  scale={weatherScale($cameraTileSize)}
  view={{
    x: ($cameraViewport.x + $cameraViewport.w / 2) * WEATHER_TILE,
    y: ($cameraViewport.y + $cameraViewport.h / 2) * WEATHER_TILE
  }}
/>
