<script lang="ts">
  import { currentWeather, currentAvgTemperature } from '$lib/stores/gameState';
  import { weatherLabel, weatherOverlayKind, isSunUp } from '$lib/game/services/EnvironmentService';
  import type { GlyphName } from '$lib/pixelArt/glyphs';
  import PixelGlyph from '$lib/components/UI/widget/PixelGlyph.svelte';

  let { hour }: { hour: number } = $props();

  const glyph: GlyphName = $derived.by(() => {
    const kind = weatherOverlayKind($currentWeather?.type);
    if (kind === 'rain' || kind === 'foggy_rain')
      return ($currentWeather?.type ?? '').includes('storm') ? 'storm' : 'rain';
    if (kind === 'fog') return 'fog';
    if (kind === 'snow' || kind === 'snowdust') return 'snow';
    return isSunUp(hour) ? 'sun' : 'moon';
  });
</script>

<PixelGlyph name={glyph} ramp={glyph === 'sun' ? 'honey' : 'water'} />
{#if $currentAvgTemperature !== undefined}<span>{$currentAvgTemperature}°</span>{/if}
<span class="lab">{weatherLabel($currentWeather?.type)}</span>

<style>
  .lab {
    flex: none;
    color: var(--text-dim);
  }
</style>
