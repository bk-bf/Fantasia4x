<script lang="ts">
  import { cameraTileSize, cameraViewport } from '$lib/stores/cameraView';
  import WeatherLayer from './WeatherLayer.svelte';

  const WEATHER_TILE = 32;
</script>

<WeatherLayer
  scale={Math.max(1, Math.round($cameraTileSize / WEATHER_TILE))}
  origin={{ x: -$cameraViewport.x * $cameraTileSize, y: -$cameraViewport.y * $cameraTileSize }}
/>
