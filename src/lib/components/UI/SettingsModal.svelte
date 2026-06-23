<!--
  SettingsModal — the shared settings popup, opened from BOTH the title screen (MainMenu) and the
  in-game ESC menu (PauseMenu). Replaces the old hand-duplicated two-checkbox inline panels.

  Every control is wired to a persisted preference (uiPrefs.ts) that takes effect live:
    • Weather effects / Day-night UI tint — graphics toggles (WeatherCanvas mount / #ambient-tint filter)
    • Cinematic layout — hideSidebars
    • Default game speed — speed a new game starts at
    • Autosave — gates the debounced scheduleSave
    • Debug mode — reveals the in-game DEBUG tab
  The Audio sliders are disabled placeholders (no sound system yet). Closes on ✕ / backdrop / Escape.
  (Returning to the title is the pause menu's "Exit to Main Menu" — it works under --debug too.)
-->
<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { onMount } from 'svelte';
  import SettingRow from './SettingRow.svelte';
  import ScrollArea from './ScrollArea.svelte';
  import { gameState } from '$lib/stores/gameState';
  import {
    weatherEffects,
    dayNightTint,
    hideSidebars,
    autosaveEnabled,
    defaultGameSpeed,
    debugMode,
    wasdPan
  } from '$lib/stores/uiPrefs';

  let { onClose }: { onClose: () => void } = $props();

  // Window mode — driven by the Fullscreen API (works in the Electron/Chromium renderer with no IPC).
  // It reflects the ACTUAL window state rather than a stored pref, because a browser/Chromium can't be
  // forced into fullscreen without a user gesture, so persisting it across launches wouldn't be honoured.
  // The dropdown stays in sync if the user toggles fullscreen elsewhere (F11 / Esc) via fullscreenchange.
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
    } catch {
      /* a fullscreen request can be rejected (no user gesture / disallowed) — leave the window as-is */
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }

  // Relocated here from the old top-bar settings dropdown — wipe the IndexedDB save and reboot to a
  // fresh world. Destructive, so it sits under a confirm in the Advanced section.
  function wipeSave() {
    if (confirm('Delete the save and restart from a new world? This cannot be undone.')) {
      gameState.wipeAndReload();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="settings-overlay" transition:fade={{ duration: 120 }}>
  <!-- Real <button> backdrop (a11y-clean click-to-close) behind the panel; Escape also closes. -->
  <button class="backdrop" aria-label="Close settings" onclick={onClose}></button>
  <div
    class="settings-panel"
    role="dialog"
    aria-modal="true"
    aria-label="Settings"
    tabindex="-1"
    transition:scale={{ duration: 140, start: 0.96 }}
  >
    <div class="hdr">
      <h2 class="title">SETTINGS</h2>
      <button class="close" aria-label="Close settings" onclick={onClose}>✕</button>
    </div>

    <ScrollArea class="body">
      <div class="section">Display</div>
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

      <div class="section">Audio</div>
      {#each ['Master volume', 'Music volume', 'SFX volume'] as label (label)}
        <SettingRow type="slider" {label} sub="— coming soon" disabled />
      {/each}

      <div class="section">Graphics</div>
      <SettingRow
        type="checkbox"
        label="Weather effects"
        checked={$weatherEffects}
        onToggle={weatherEffects.toggle}
      />
      <SettingRow
        type="checkbox"
        label="Day/night UI tint"
        checked={$dayNightTint}
        onToggle={dayNightTint.toggle}
      />

      <div class="section">Interface</div>
      <SettingRow
        type="checkbox"
        label="Cinematic layout"
        checked={$hideSidebars}
        onToggle={hideSidebars.toggle}
      />

      <div class="section">Controls</div>
      <SettingRow
        type="checkbox"
        label="WASD camera panning"
        sub="— alongside arrow keys"
        checked={$wasdPan}
        onToggle={wasdPan.toggle}
      />

      <div class="section">Gameplay</div>
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
      <SettingRow
        type="checkbox"
        label="Autosave"
        checked={$autosaveEnabled}
        onToggle={autosaveEnabled.toggle}
      />

      <div class="section">Advanced</div>
      <SettingRow
        type="checkbox"
        label="Debug mode"
        checked={$debugMode}
        onToggle={debugMode.toggle}
      />
      <button class="wipe" onclick={wipeSave}>Wipe save &amp; restart</button>
    </ScrollArea>

    <button class="done" onclick={onClose}>Done</button>
  </div>
</div>

<style>
  .settings-overlay {
    position: fixed;
    inset: 0;
    z-index: 1100; /* above the pause overlay (900) and the menu (1000) */
    background: rgba(6, 4, 2, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
  }
  .backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: transparent;
    cursor: default;
    padding: 0;
  }
  .settings-panel {
    position: relative; /* above the backdrop button */
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: min(360px, 88vw);
    max-height: 86vh;
    padding: 16px 18px 14px;
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    box-shadow: 0 0 28px rgba(0, 0, 0, 0.6);
  }
  .hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .title {
    color: var(--accent-hi);
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.4em;
    text-indent: 0.4em;
    margin: 0;
  }
  .close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 15px;
    cursor: pointer;
    padding: 2px 4px;
    line-height: 1;
  }
  .close:hover {
    color: var(--accent-hi);
  }
  /* .body is the ScrollArea viewport (overflow + auto-hiding bar live in ScrollArea); here we only
     size it and lay out its sections. :global because the element lives in ScrollArea's scope.
     Bleed it into the panel's right padding so the scrollbar rides the panel edge, then re-pad the
     content the same amount — otherwise the bar crowds the right-aligned checkboxes. */
  .settings-panel :global(.body) {
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin-right: -18px;
    padding-right: 10px;
  }
  .section {
    color: var(--accent-hi);
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    margin: 12px 0 4px;
    padding-bottom: 3px;
    border-bottom: 1px solid var(--border);
  }
  .section:first-child {
    margin-top: 0;
  }
  /* Destructive action — quiet by default, reddens on hover so it never reads as a primary control. */
  .wipe {
    margin-top: 8px;
    align-self: flex-start;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition:
      color 0.12s,
      border-color 0.12s;
  }
  .wipe:hover {
    color: var(--neg);
    border-color: var(--neg);
  }
  .done {
    margin-top: 14px;
    padding: 9px 0;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
      background 0.12s,
      color 0.12s,
      border-color 0.12s;
  }
  .done:hover {
    background: var(--bg-hover);
    color: var(--accent-hi);
    border-color: var(--border-hi);
  }
</style>
