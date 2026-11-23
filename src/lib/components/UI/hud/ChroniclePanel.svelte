<script lang="ts">
  import { recentActivity, clearActivityLog } from '$lib/stores/Log';
  import { uiState } from '$lib/stores/uiState';
  import { hideSidebars, chronicleMinimized } from '$lib/stores/uiPrefs';
  import type { ActivityLogEntry, LogCategory } from '$lib/game/core/defs/events';
  import CombatBreakdown from './CombatBreakdown.svelte';
  import HoverTip from '../tooltip/HoverTip.svelte';
  import ScrollArea from '../widget/ScrollArea.svelte';
  import ChromeButton from '../widget/ChromeButton.svelte';
  import KvRow from '../widget/KvRow.svelte';
  import ColumnScrim from './ColumnScrim.svelte';
  import { turnToGameDate } from './topbar/gameDate';
  import './hudColumns.css';

  const CATEGORY_LABEL: Record<LogCategory, string> = {
    work: 'Labour',
    building: 'Construction',
    crafting: 'Crafting',
    event: 'Event',
    pawn_action: 'Colonist',
    research: 'Discovery',
    exploration: 'Expedition',
    system: 'Chronicle',
    combat: 'Battle',
    entity: 'Wildlife',
    social: 'Company',
    weather: 'Weather',
    season: 'Season',
    ai: 'Instinct',
    needs: 'Needs',
    job: 'Task',
    item: 'Item',
    perf: 'Chronicle'
  };

  function categoryLabel(e: ActivityLogEntry) {
    return CATEGORY_LABEL[e.type];
  }

  const SEV_CLASS: Record<string, string> = {
    info: '',
    success: 'sev-ok',
    warning: 'sev-warn',
    error: 'sev-err',
    critical: 'sev-crit'
  };

  let expandedId: string | null = $state(null);

  const ENTRY_ROW_HEIGHT = 17;
  const OVERSCAN_ROWS = 8;

  let listViewport: HTMLElement | null = $state(null);
  let listViewportHeight = $state(0);

  $effect(() => {
    if (!listViewport) return;
    const el = listViewport;
    const observer = new ResizeObserver(() => {
      listViewportHeight = el.clientHeight;
    });
    observer.observe(el);
    listViewportHeight = el.clientHeight;
    return () => observer.disconnect();
  });

  let visibleActivity = $derived(
    $recentActivity.slice(0, Math.ceil(listViewportHeight / ENTRY_ROW_HEIGHT) + OVERSCAN_ROWS)
  );

  function socialLines(entry: ActivityLogEntry): { name: string; text: string }[] {
    if (entry.type !== 'social') return [];
    const lines = entry.details?.lines;
    return Array.isArray(lines) ? lines : [];
  }

  function handleClick(entry: ActivityLogEntry) {
    if (socialLines(entry).length > 0) {
      expandedId = expandedId === entry.id ? null : entry.id;
    }
    const willSelectEntity = !!(entry.entityIds && entry.entityIds.length > 0);
    if (entry.focusX !== undefined && entry.focusY !== undefined) {
      uiState.focusMapOn(entry.focusX, entry.focusY, !willSelectEntity);
    }
    if (willSelectEntity) {
      const firstId = entry.entityIds![0];
      if (firstId.startsWith('mob-')) {
        uiState.selectMob(firstId);
      } else {
        uiState.selectPawn(firstId);
      }
    }
  }

  let hoverEntry: ActivityLogEntry | null = $state(null);
  let hoverX = $state(0);
  let hoverY = $state(0);
  function onEntryEnter(e: MouseEvent, entry: ActivityLogEntry) {
    hoverEntry = entry;
    hoverX = e.clientX;
    hoverY = e.clientY;
  }
  function onEntryMove(e: MouseEvent) {
    if (hoverEntry) {
      hoverX = e.clientX;
      hoverY = e.clientY;
    }
  }
  function onEntryLeave() {
    hoverEntry = null;
  }
</script>

<aside
  class="panel hud-col hud-col-r"
  class:transparent={$hideSidebars}
  class:collapsed={$chronicleMinimized}
>
  {#if $hideSidebars}<ColumnScrim right />{/if}
  {#if $chronicleMinimized}
    <button
      class="restore-btn"
      title="Expand chronicle"
      aria-label="Expand chronicle"
      onclick={() => chronicleMinimized.set(false)}>‹</button
    >
  {:else}
    <div class="tools">
      <ChromeButton
        mini
        glyph="x"
        label="Clear the chronicle"
        title="Clear the chronicle"
        disabled={$recentActivity.length === 0}
        onclick={clearActivityLog}
      />
    </div>

    <ScrollArea class="log-list" bind:viewport={listViewport}>
      {#if $recentActivity.length > 0}
        {#each visibleActivity as entry (entry.id)}
          <div
            class="entry {SEV_CLASS[entry.severity] || ''} {entry.focusX !== undefined
              ? 'clickable'
              : ''}"
            class:expanded={expandedId === entry.id}
            onclick={() => handleClick(entry)}
            onmouseenter={(e) => onEntryEnter(e, entry)}
            onmousemove={onEntryMove}
            onmouseleave={onEntryLeave}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && handleClick(entry)}
          >
            <span class="turn">{turnToGameDate(entry.turn).clock}</span>
            <span class="msg">{entry.action}{entry.result ? ' · ' + entry.result : ''}</span>
          </div>
          {#if expandedId === entry.id && socialLines(entry).length > 0}
            <div class="convo">
              {#each socialLines(entry) as line}
                <div class="convo-line">
                  <span class="convo-who">{line.name}:</span> “{line.text}”
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      {/if}
    </ScrollArea>
  {/if}

  {#if hoverEntry}
    <HoverTip x={hoverX} y={hoverY}>
      {#if hoverEntry.combatBreakdown && hoverEntry.combatBreakdown.length > 0}
        <CombatBreakdown entry={hoverEntry} />
      {:else}
        <h5>{categoryLabel(hoverEntry)}</h5>
        <p class:grave={SEV_CLASS[hoverEntry.severity] === 'sev-crit'}>{hoverEntry.action}</p>
        {#if hoverEntry.result}<KvRow label="Outcome">{hoverEntry.result}</KvRow>{/if}
        {#if hoverEntry.location}<KvRow label="Where">{hoverEntry.location}</KvRow>{/if}
        <KvRow label="When">{turnToGameDate(hoverEntry.turn).clock}</KvRow>
        {#if socialLines(hoverEntry).length > 0}
          <KvRow label="Overheard">{socialLines(hoverEntry).length} lines</KvRow>
        {/if}
      {/if}
    </HoverTip>
  {/if}
</aside>

<style>
  .panel {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .panel.transparent {
    overflow: visible;
  }
  .panel.collapsed {
    align-items: center;
    padding-top: 4px;
  }
  .restore-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--col-mute);
    background: none;
    color: var(--col-hot);
    font: inherit;
    cursor: pointer;
  }
  .tools {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    padding: 4px 10px 2px;
  }
  .panel :global(.log-list) {
    flex: 1;
    padding: 2px 10px 8px 8px;
  }
  .entry {
    margin-bottom: 3px;
    line-height: 16px;
    overflow-wrap: break-word;
  }
  .turn {
    margin-right: 6px;
    color: var(--col-mute);
  }
  .sev-ok .msg {
    color: var(--col-pos);
  }
  .sev-warn .msg {
    color: var(--col-hot);
  }
  .sev-err .msg,
  .sev-crit .msg {
    color: var(--col-neg);
  }
  .sev-crit .turn::before {
    content: '!';
    display: inline-block;
    width: 9px;
    margin-right: 4px;
    text-align: center;
    background: var(--col-neg);
    color: #1a0806;
    text-shadow: none;
  }
  .clickable {
    cursor: pointer;
  }
  .clickable:hover .msg {
    text-decoration: underline dotted;
    text-underline-offset: 3px;
  }
  .entry.expanded .msg {
    color: var(--col-hot);
  }

  p.grave {
    color: var(--neg);
  }
  .convo {
    padding: 1px 0 4px 46px;
    color: var(--col-dim);
  }
  .convo-who {
    color: var(--col-hot);
  }
</style>
