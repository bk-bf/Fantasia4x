<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import {
    WEATHER_IDS,
    WEATHER_LABELS,
    SEASON_IDS,
    SEASON_LABELS
  } from '$lib/game/services/EnvironmentService';
  import type { Season } from '$lib/game/core/types';
  import SegmentedRow from '$lib/components/UI/widget/SegmentedRow.svelte';
  import Slider from '$lib/components/UI/widget/Slider.svelte';
  import CheckBox from '$lib/components/UI/widget/CheckBox.svelte';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import DebugField from './DebugField.svelte';

  const QUICK_WEATHER = ['clear', 'rain', 'snow', 'fog'].filter((w) => WEATHER_IDS.includes(w));
  const HOURS: { id: number | ''; label: string; title: string }[] = [
    { id: '', label: 'Turn', title: 'Follow the clock' },
    { id: 0.3, label: 'Dawn', title: 'Dawn' },
    { id: 0.5, label: 'Noon', title: 'Noon' },
    { id: 0.82, label: 'Dusk', title: 'Dusk' },
    { id: 0, label: 'Night', title: 'Night' }
  ];
  const SEASONS: { id: Season | ''; label: string; title: string }[] = [
    { id: '', label: 'Turn', title: 'Follow the calendar' },
    ...SEASON_IDS.map((s) => ({
      id: s,
      label: SEASON_LABELS[s].slice(0, 3),
      title: SEASON_LABELS[s]
    }))
  ];

  let snowValue = $state(0);
  let iceValue = $state(0);

  const weather = $derived($gameState.weather?.type ?? 'clear');
  const cmd = (type: string, payload: Record<string, unknown> = {}) =>
    gameState.command({ type, payload, save: true });

  const setWeather = (type: string) => cmd('setWeather', { type });
  function setMapSnow(v: number) {
    snowValue = v;
    cmd('devSetMapSnow', { value: v });
  }
  function setMapIce(v: number) {
    iceValue = v;
    cmd('devSetMapIce', { value: v });
  }
</script>

<SegmentedRow
  label="Weather"
  options={QUICK_WEATHER.map((w) => ({
    id: w,
    label: WEATHER_LABELS[w].split(' ')[0],
    title: WEATHER_LABELS[w]
  }))}
  value={weather}
  onSelect={setWeather}
/>
<DebugField>
  <select
    value={weather}
    aria-label="Weather"
    onchange={(e) => setWeather((e.target as HTMLSelectElement).value)}
  >
    {#each WEATHER_IDS as w (w)}<option value={w}>{WEATHER_LABELS[w]}</option>{/each}
  </select>
</DebugField>
<SegmentedRow
  label="Season"
  options={SEASONS}
  value={$gameState._debugSeason ?? ''}
  onSelect={(s) => cmd('setSeason', { season: s === '' ? null : s })}
/>
<SegmentedRow
  label="Hour"
  options={HOURS}
  value={$gameState._debugTimeOfDay ?? ''}
  onSelect={(t) => cmd('setTimeOfDay', { timeOfDay: t === '' ? null : t })}
/>
<h5>Snow</h5>
<div class="cover">
  <Slider label="Snow cover" value={snowValue} oninput={setMapSnow}>{snowValue}%</Slider>
  <ChromeButton
    mini
    glyph="x"
    label="Clear snow"
    title="Clear snow"
    onclick={() => setMapSnow(0)}
  />
</div>
<h5>Ice</h5>
<div class="cover">
  <Slider label="Ice cover" value={iceValue} oninput={setMapIce}>{iceValue}%</Slider>
  <ChromeButton mini glyph="x" label="Clear ice" title="Clear ice" onclick={() => setMapIce(0)} />
</div>
<CheckBox
  checked={!!$gameState._devResearchGateOff}
  onchange={() => cmd('setResearchGateOff', { off: !$gameState._devResearchGateOff })}
  >Research gate off</CheckBox
>

<style>
  .cover {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cover :global(.slider) {
    flex: 1;
  }
</style>
