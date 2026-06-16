<script lang="ts">
  import { recentActivity, clearActivityLog } from '$lib/stores/Log';
  import { uiState } from '$lib/stores/uiState';
  import type { ActivityLogEntry } from '$lib/game/core/Events';
  import CombatBreakdown from './CombatBreakdown.svelte';

  const TYPE_ABBR: Record<string, string> = {
    work: 'WRK',
    building: 'BLD',
    crafting: 'CRF',
    event: 'EVT',
    pawn_action: 'PWN',
    research: 'RSH',
    exploration: 'EXP',
    system: 'SYS',
    combat: 'CBT',
    entity: 'ENT',
    weather: 'WTR',
    season: 'SEA'
  };

  const SEV_CLASS: Record<string, string> = {
    info: '',
    success: 'sev-ok',
    warning: 'sev-warn',
    error: 'sev-err',
    critical: 'sev-crit'
  };

  function abbr(e: ActivityLogEntry) {
    return TYPE_ABBR[e.type] ?? '???';
  }

  let expandedId: string | null = null;

  function handleClick(entry: ActivityLogEntry) {
    // Toggle combat breakdown expansion
    if (entry.type === 'combat' && entry.combatBreakdown && entry.combatBreakdown.length > 0) {
      expandedId = expandedId === entry.id ? null : entry.id;
    }
    // Focus map on the event location
    if (entry.focusX !== undefined && entry.focusY !== undefined) {
      uiState.focusMapOn(entry.focusX, entry.focusY);
    }
    // Select first entity involved
    if (entry.entityIds && entry.entityIds.length > 0) {
      const firstId = entry.entityIds[0];
      // Heuristic: pawn IDs usually don't start with 'mob-'
      if (firstId.startsWith('mob-')) {
        uiState.selectMob(firstId);
      } else {
        uiState.selectPawn(firstId);
      }
    }
  }

  function fullLogLine(entry: ActivityLogEntry): string {
    const parts: string[] = [];
    parts.push(`[${abbr(entry)}]`);
    parts.push(`T${entry.turn}`);
    if (entry.severity) parts.push(`(${entry.severity})`);
    if (entry.actor) parts.push(`actor: ${entry.actor}`);
    parts.push(`action: ${entry.action}`);
    if (entry.target) parts.push(`target: ${entry.target}`);
    if (entry.result) parts.push(`result: ${entry.result}`);
    if (entry.location) parts.push(`loc: ${entry.location}`);
    if (entry.focusX !== undefined && entry.focusY !== undefined) {
      parts.push(`pos: (${entry.focusX}, ${entry.focusY})`);
    }
    return parts.join(' | ');
  }
</script>

<aside class="panel">
  <div class="section-hdr">
    <span>| CHRONICLE</span>
    <button
      class="clear-btn"
      title="Clear chronicle"
      aria-label="Clear chronicle"
      disabled={$recentActivity.length === 0}
      on:click={clearActivityLog}>✕</button
    >
  </div>

  <div class="log-list">
    {#if $recentActivity.length === 0}
      <div class="empty">awaiting events...</div>
    {:else}
      {#each $recentActivity as entry (entry.id)}
        <div
          class="entry {SEV_CLASS[entry.severity] || ''} {entry.focusX !== undefined
            ? 'clickable'
            : ''}"
          class:expanded={expandedId === entry.id}
          title={fullLogLine(entry)}
          on:click={() => handleClick(entry)}
          role="button"
          tabindex="0"
          on:keydown={(e) => e.key === 'Enter' && handleClick(entry)}
        >
          <span class="turn">T{entry.turn}</span>
          <span class="type">{abbr(entry)}</span>
          <span class="msg">{entry.action}{entry.result ? ' · ' + entry.result : ''}</span>
        </div>
        {#if expandedId === entry.id && entry.combatBreakdown && entry.combatBreakdown.length > 0}
          <CombatBreakdown turns={entry.combatBreakdown} />
        {/if}
      {/each}
    {/if}
  </div>
</aside>

<style>
  .panel {
    height: 100%;
    width: 100%;
    background: var(--bg-panel);
    font-family: 'Courier New', monospace;
    font-size: 10px;
    color: var(--text);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .section-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px 3px 0;
    color: var(--accent-hi);
    font-size: 10px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    flex-shrink: 0;
  }

  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    font-family: inherit;
    font-size: 10px;
    line-height: 1;
    letter-spacing: 0;
    cursor: pointer;
  }

  .clear-btn:hover:not(:disabled) {
    color: var(--neg);
    border-color: var(--neg);
    background: var(--bg-hover);
  }

  .clear-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .log-list {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
  }

  .entry {
    display: grid;
    grid-template-columns: 36px 28px 1fr;
    gap: 3px;
    padding: 2px 6px;
    border-bottom: 1px solid var(--border);
    line-height: 1.4;
  }

  .entry:hover {
    background: var(--bg-hover);
  }

  .turn {
    color: var(--text-dim);
    font-size: 9px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .type {
    color: var(--accent-hi);
    font-size: 9px;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .msg {
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
  }

  /* severity overrides */
  .sev-ok .msg {
    color: var(--pos);
  }
  .sev-warn .msg {
    color: var(--accent-hi);
  }
  .sev-err .msg,
  .sev-crit .msg {
    color: var(--neg);
  }
  .sev-crit .type {
    color: var(--neg);
  }

  .empty {
    padding: 8px;
    color: var(--text-muted);
    font-size: 9px;
    font-style: italic;
  }

  .clickable {
    cursor: pointer;
  }

  .clickable:hover {
    background: var(--bg-hover);
  }

  .expanded {
    background: rgba(212, 168, 64, 0.08);
  }

  .entry.expanded {
    border-bottom: none;
  }
</style>
