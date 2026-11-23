<script lang="ts">
  import DebugMenu from './DebugMenu.svelte';
  import DebugLogScreen from './DebugLogScreen.svelte';
  import FilterTabs from '$lib/components/UI/widget/FilterTabs.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';

  const TABS = [
    { id: 'menu', label: 'Menu' },
    { id: 'log', label: 'Log' }
  ];
  type DebugTab = 'menu' | 'log';
  let activeTab = $state<DebugTab>(persisted<DebugTab>('debug.tab', 'menu'));
  $effect(() => persist('debug.tab', activeTab));
</script>

<div class="debug-screen">
  <FilterTabs tabs={TABS} selected={activeTab} onSelect={(id) => (activeTab = id as DebugTab)} />
  <div class="debug-content">
    {#if activeTab === 'menu'}
      <DebugMenu />
    {:else}
      <DebugLogScreen />
    {/if}
  </div>
</div>

<style>
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
