<script lang="ts">
  import { recentActivity } from '$lib/stores/Log';
  import type { ActivityLogEntry } from '$lib/game/core/Events';

  const TYPE_ABBR: Record<string, string> = {
    work: 'WRK',
    building: 'BLD',
    crafting: 'CRF',
    event: 'EVT',
    pawn_action: 'PWN',
    research: 'RSH',
    exploration: 'EXP',
    system: 'SYS'
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
</script>

<aside class="panel">
  <div class="section-hdr">| CHRONICLE</div>

  <div class="log-list">
    {#if $recentActivity.length === 0}
      <div class="empty">awaiting events...</div>
    {:else}
      {#each $recentActivity as entry (entry.id)}
        <div class="entry {SEV_CLASS[entry.severity] || ''}">
          <span class="turn">T{entry.turn}</span>
          <span class="type">{abbr(entry)}</span>
          <span class="msg">{entry.action}{entry.result ? ' · ' + entry.result : ''}</span>
        </div>
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
    padding: 4px 8px 3px;
    color: var(--accent-hi);
    font-size: 10px;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    flex-shrink: 0;
  }

  .log-list {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
  }

  .entry {
    display: grid;
    grid-template-columns: 28px 28px 1fr;
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
  }

  .type {
    color: var(--accent-hi);
    font-size: 9px;
    text-transform: uppercase;
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
</style>
