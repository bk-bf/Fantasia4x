<script lang="ts">
  import { recentActivity } from '$lib/stores/Log';
  import { uiState } from '$lib/stores/uiState';
  import type { ActivityLogEntry, CombatTurnEntry } from '$lib/game/core/Events';

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
    entity: 'ENT'
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

  function formatCombatTurn(t: CombatTurnEntry): string {
    const withWeapon = t.weapon ? ` with ${t.weapon}` : '';
    if (!t.hit) {
      return `${t.attackerName} attacks${withWeapon} but ${t.defenderName} dodges`;
    }
    let s = `${t.attackerName}${t.crit ? ' CRITS' : ' hit'} ${t.defenderName}${withWeapon}`;
    if (t.bodyPart) {
      s += ` in the ${t.bodyPart}`;
      if (t.partRemainingHp !== undefined && t.partMaxHp !== undefined) {
        s += ` (${t.partRemainingHp}/${t.partMaxHp})`;
      }
    }
    s += ` for ${t.damage}${t.damageType ? ` ${t.damageType}` : ''} damage`;
    if (t.bleeding) s += `, ${t.defenderName} is bleeding`;
    if (t.knockdown) s += `, ${t.defenderName} is knocked down`;
    return s;
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
  <div class="section-hdr">| CHRONICLE</div>

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
          <div class="combat-breakdown">
            {#each entry.combatBreakdown as turn}
              <div class="turn-line">{formatCombatTurn(turn)}</div>
            {/each}
          </div>
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
    padding: 4px 8px 3px 0;
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

  .combat-breakdown {
    padding: 2px 6px 4px 34px;
    border-bottom: 1px solid var(--border);
    background: rgba(0, 0, 0, 0.2);
  }

  .turn-line {
    font-size: 9px;
    color: var(--text-dim);
    line-height: 1.5;
    padding-left: 4px;
    border-left: 2px solid var(--border-hi);
  }
</style>
