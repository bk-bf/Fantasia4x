<script lang="ts">
  import DebugMenu from './DebugMenu.svelte';
  import DebugLogScreen from './DebugLogScreen.svelte';
  import DebugEffects from './DebugEffects.svelte';
  import FilterTabs from '$lib/components/UI/widget/FilterTabs.svelte';
  import ChromeButton from '$lib/components/UI/widget/ChromeButton.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';
  import { autoPauseOnThreat, autoPauseOnDeath } from '$lib/stores/uiPrefs';

  const TABS = [
    { id: 'menu', label: 'Menu' },
    { id: 'log', label: 'Log' },
    { id: 'effects', label: 'Effects' }
  ];
  type DebugTab = 'menu' | 'log' | 'effects';
  let activeTab = $state<DebugTab>(persisted<DebugTab>('debug.tab', 'menu'));
  $effect(() => persist('debug.tab', activeTab));

  const autoPauseOff = $derived(!$autoPauseOnThreat && !$autoPauseOnDeath);
  function toggleAutoPause() {
    autoPauseOnThreat.set(autoPauseOff);
    autoPauseOnDeath.set(autoPauseOff);
  }
</script>

<div class="debug-screen">
  <div class="debug-bar">
    <FilterTabs tabs={TABS} selected={activeTab} onSelect={(id) => (activeTab = id as DebugTab)} />
    <ChromeButton on={autoPauseOff} onclick={toggleAutoPause}>Auto-pause off</ChromeButton>
  </div>
  <div class="debug-content">
    {#if activeTab === 'menu'}
      <DebugMenu />
    {:else if activeTab === 'effects'}
      <DebugEffects />
    {:else}
      <DebugLogScreen />
    {/if}
  </div>
</div>

<style>
  .debug-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .debug-screen {
    display: flex;
    flex-direction: column;
    gap: 6px;
    height: 100%;
    min-height: 0;
  }
  .debug-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
