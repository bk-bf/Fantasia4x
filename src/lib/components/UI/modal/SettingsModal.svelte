<script lang="ts">
  import { onMount } from 'svelte';
  import SettingRow from '../menu/SettingRow.svelte';
  import SettingSection from '../menu/SettingSection.svelte';
  import ThemeSection from '../menu/ThemeSection.svelte';
  import AudioSection from '../menu/AudioSection.svelte';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import ModalWindow from '../window/ModalWindow.svelte';
  import {
    weatherEffects,
    dayNightTint,
    vignetteOn,
    showDialogBubbles,
    showFps,
    showTps,
    hideSidebars,
    autosaveEnabled,
    autoPauseOnThreat,
    autoPauseOnDeath,
    defaultGameSpeed,
    debugMode,
    wasdPan,
    tipPlacement,
    isTipPlacement
  } from '$lib/stores/uiPrefs';

  let { onClose }: { onClose: () => void } = $props();

  let windowMode = $state<'windowed' | 'fullscreen'>('windowed');
  function syncWindowMode() {
    windowMode = document.fullscreenElement ? 'fullscreen' : 'windowed';
  }
  onMount(() => {
    syncWindowMode();
    document.addEventListener('fullscreenchange', syncWindowMode);
    return () => document.removeEventListener('fullscreenchange', syncWindowMode);
  });
  async function setWindowMode(mode: string) {
    try {
      if (mode === 'fullscreen') await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch {}
  }

  const flag = (store: { toggle: () => void }, on: boolean, label: string, sub = '') => ({
    store,
    on,
    label,
    sub
  });
</script>

{#snippet checks(rows: ReturnType<typeof flag>[])}
  {#each rows as r (r.label)}
    <SettingRow
      type="checkbox"
      label={r.label}
      sub={r.sub}
      checked={r.on}
      onToggle={r.store.toggle}
    />
  {/each}
{/snippet}

<ModalWindow id="settings" title="Settings" width={640} onclose={onClose}>
  <div class="cols">
    <div>
      <ThemeSection />
      <SettingSection title="Display">
        <SettingRow
          type="select"
          label="Window mode"
          value={windowMode}
          options={[
            { value: 'windowed', label: 'Windowed' },
            { value: 'fullscreen', label: 'Fullscreen' }
          ]}
          onSelect={setWindowMode}
        />
        {@render checks([flag(showFps, $showFps, 'Show FPS'), flag(showTps, $showTps, 'Show TPS')])}
      </SettingSection>
      <AudioSection />
    </div>
    <div>
      <SettingSection title="Graphics">
        {@render checks([
          flag(weatherEffects, $weatherEffects, 'Weather effects'),
          flag(dayNightTint, $dayNightTint, 'Day/night UI tint'),
          flag(vignetteOn, $vignetteOn, 'Vignette'),
          flag(showDialogBubbles, $showDialogBubbles, 'Dialog bubbles')
        ])}
      </SettingSection>
      <SettingSection title="Interface">
        {@render checks([flag(hideSidebars, $hideSidebars, 'Cinematic layout')])}
        <SettingRow
          type="select"
          label="Hover panels"
          value={$tipPlacement}
          options={[
            { value: 'cursor', label: 'By cursor' },
            { value: 'window', label: 'Under window' }
          ]}
          onSelect={(v) => isTipPlacement(v) && tipPlacement.set(v)}
        />
      </SettingSection>
      <SettingSection title="Controls">
        {@render checks([flag(wasdPan, $wasdPan, 'WASD camera panning', 'alongside arrow keys')])}
      </SettingSection>
      <SettingSection title="Gameplay">
        <SettingRow
          type="select"
          label="Default game speed"
          value={String($defaultGameSpeed)}
          options={[
            { value: '1', label: '1×' },
            { value: '2', label: '2×' },
            { value: '4', label: '4×' }
          ]}
          onSelect={(v) => defaultGameSpeed.set(Number(v))}
        />
        {@render checks([
          flag(autosaveEnabled, $autosaveEnabled, 'Autosave'),
          flag(autoPauseOnThreat, $autoPauseOnThreat, 'Auto-pause on threat'),
          flag(autoPauseOnDeath, $autoPauseOnDeath, 'Auto-pause on death')
        ])}
      </SettingSection>
      <SettingSection title="Advanced">
        {@render checks([flag(debugMode, $debugMode, 'Debug mode')])}
      </SettingSection>
    </div>
  </div>
  <div class="foot">
    <ChromeButton onclick={onClose}>Done</ChromeButton>
  </div>
</ModalWindow>

<style>
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 22px;
    max-height: 70vh;
    overflow-y: auto;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
  }
</style>
