<script lang="ts">
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import Slider from '$lib/components/UI/widget/Slider.svelte';
  import Well from '$lib/components/UI/widget/Well.svelte';
  import DebugFluids from './DebugFluids.svelte';
  import { EFFECT_KINDS, effectToggles } from '$lib/stores/fx/effectToggles';
  import { waveStrength, waveWaterOn, weatherEffects, windSwayOn } from '$lib/stores/uiPrefs';

  const allOff = $derived(!$weatherEffects && EFFECT_KINDS.every((k) => !$effectToggles[k.id]));
  function toggleAll() {
    effectToggles.setAll(allOff);
    weatherEffects.set(allOff);
  }
</script>

<div class="debug-effects">
  <ChromeButton on={allOff} onclick={toggleAll}>All effects off</ChromeButton>
  <div class="grid">
    {#each EFFECT_KINDS as kind (kind.id)}
      <ChromeButton on={$effectToggles[kind.id]} onclick={() => effectToggles.toggle(kind.id)}>
        {kind.label}
      </ChromeButton>
    {/each}
    <ChromeButton on={$weatherEffects} onclick={() => weatherEffects.toggle()}>Weather</ChromeButton
    >
    <ChromeButton on={$windSwayOn} onclick={() => windSwayOn.toggle()}>Wind sway</ChromeButton>
    <ChromeButton on={$waveWaterOn} onclick={() => waveWaterOn.toggle()}>Wave water</ChromeButton>
  </div>
  <Slider label="Wave strength" max={200} value={$waveStrength} oninput={(v) => waveStrength.set(v)}
    >{$waveStrength}%</Slider
  >
  <Well title="Fluids" scroll>
    <DebugFluids />
  </Well>
</div>

<style>
  .debug-effects {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 6px;
    flex: 1;
    min-height: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 6px;
  }
</style>
