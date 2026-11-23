<script lang="ts">
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import { EFFECT_KINDS, effectToggles } from '$lib/stores/fx/effectToggles';
  import { weatherEffects, windSwayOn } from '$lib/stores/uiPrefs';

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
  </div>
</div>

<style>
  .debug-effects {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 6px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 6px;
  }
</style>
