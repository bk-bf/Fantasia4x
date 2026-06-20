<script lang="ts">
  // Top-bar settings dropdown. Lightweight + extensible: each row is a persisted view preference
  // from uiPrefs (deliberately separate from the IndexedDB game save). Add future view toggles here.
  import { hideSidebars } from '$lib/stores/uiPrefs';
  import { gameState } from '$lib/stores/gameState';

  let open = false;

  function toggleOpen() {
    open = !open;
  }
  function close() {
    open = false;
  }

  function wipeSave() {
    if (confirm('Delete save and restart?')) {
      gameState.wipeAndReload();
    }
  }
</script>

<!-- Any click/Escape outside the menu closes it; the trigger + menu stopPropagation so they don't. -->
<svelte:window on:click={close} on:keydown={(e) => e.key === 'Escape' && close()} />

<div class="settings">
  <button
    class="ctrl-btn"
    class:is-active={open}
    on:click|stopPropagation={toggleOpen}
    title="Settings"
  >
    ⚙ SETTINGS
  </button>

  {#if open}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="menu" role="menu" tabindex="-1" on:click|stopPropagation>
      <label class="menu-row">
        <input type="checkbox" checked={$hideSidebars} on:change={hideSidebars.toggle} />
        <span>Hide sidebars</span>
      </label>
      <div class="menu-sep"></div>
      <button class="menu-row action danger" on:click={wipeSave}>Wipe save</button>
    </div>
  {/if}
</div>

<style>
  .settings {
    position: relative;
    display: inline-flex;
  }

  .ctrl-btn {
    padding: 2px 8px;
    background: var(--bg-hover);
    border: 1px solid var(--border-hi);
    color: var(--text);
    cursor: pointer;
    font-family: 'Courier New', monospace;
    font-size: 9px;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .ctrl-btn:hover {
    background: var(--bg-active);
    color: var(--accent-hi);
  }
  .ctrl-btn.is-active {
    border-color: var(--accent-hi);
    color: var(--accent-hi);
  }

  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 150px;
    background: var(--bg-panel);
    border: 1px solid var(--border-hi);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    padding: 4px;
    z-index: 200;
  }

  .menu-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    color: var(--text);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    cursor: pointer;
    white-space: nowrap;
  }
  .menu-row:hover {
    background: var(--bg-hover);
    color: var(--accent-hi);
  }
  .menu-row input {
    accent-color: var(--accent);
    cursor: pointer;
  }

  /* Button-style rows (actions) reset the native button look to match the label rows. */
  .menu-row.action {
    width: 100%;
    background: transparent;
    border: none;
    text-align: left;
  }

  .menu-sep {
    height: 1px;
    margin: 4px 2px;
    background: var(--border);
  }

  .menu-row.danger {
    color: var(--neg);
  }
  .menu-row.danger:hover {
    background: var(--neg);
    color: #fff;
  }
</style>
