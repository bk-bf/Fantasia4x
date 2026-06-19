<!--
  DebugScreen — the DEBUG tab. Two sub-tabs (MENU / LOG) in the same underline-indicator style as
  the Pawn tab's STATUS / ATTRIBUTES / GEAR: MENU = DebugMenu (spawn/weather/season/brush buttons),
  LOG = the unified log viewer. Mounted by +page only when the DEBUG tab is present (dev.sh/launch.sh
  --debug or the standalone --log flag).
-->
<script lang="ts">
  import DebugMenu from './DebugMenu.svelte';
  import DebugLogScreen from './DebugLogScreen.svelte';
  import { persisted, persist } from '$lib/stores/uiPersist';

  type DebugTab = 'menu' | 'log';
  let activeTab = $state<DebugTab>(persisted<DebugTab>('debug.tab', 'menu'));
  $effect(() => persist('debug.tab', activeTab));
  const TABS: { id: DebugTab; label: string }[] = [
    { id: 'menu', label: 'MENU' },
    { id: 'log', label: 'LOG' }
  ];
</script>

<div class="debug-screen">
  <nav class="debug-tabs">
    {#each TABS as tab (tab.id)}
      <button
        class="debug-tab"
        class:active={activeTab === tab.id}
        onclick={() => (activeTab = tab.id)}>{tab.label}</button
      >
    {/each}
  </nav>

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
    height: 100%;
    min-height: 0;
  }

  /* Section tabs — underline-indicator style, matching the Pawn tab. */
  .debug-tabs {
    display: flex;
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
    background: var(--bg);
    border-bottom: 2px solid var(--border-hi);
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .debug-tabs::-webkit-scrollbar {
    display: none;
  }
  .debug-tab {
    flex: 1 0 auto;
    white-space: nowrap;
    padding: 6px 14px 5px;
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    color: var(--text-muted);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    cursor: pointer;
    text-transform: uppercase;
    transition: color 0.12s;
    position: relative;
  }
  .debug-tab:last-child {
    border-right: none;
  }
  .debug-tab:hover {
    color: var(--text);
  }
  .debug-tab.active {
    color: var(--accent-hi);
  }
  .debug-tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent-hi);
  }

  .debug-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
