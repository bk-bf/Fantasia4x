<!--
  DebugLogScreen — in-game viewer for the unified log. Mounted by +page.svelte only when the DEBUG tab
  is present: under dev.sh/launch.sh --debug (VITE_DEBUG_MODE) or the standalone --log flag
  (VITE_DEBUG_LOG, composable with --profiler/--electron), OR at runtime in a shipped/--play build when
  the player enables Settings → Debug mode ($debugMode) — which also flips the verbose gate that
  produces these traces (see core/logSink setVerboseLogging).

  Reads the store (chronicle ⊕ diagnostics via `allLogEntries`), not a live file/SSE tap — so it
  streams in realtime, survives tab close/reopen, never leaks (the stores are bounded + persisted),
  and works under the sim worker (the worker forwards log calls to these stores). Filter by
  category/severity/text. The agent fetches the same data after the fact from `.debug/<category>.log`.
-->
<script module lang="ts">
  // Filter prefs survive tab close/reopen (the panel is destroyed when you leave the tab).
  let lastTag = 'ALL';
  let lastSeverity = 'ALL';
  let lastSearch = '';
  let lastWrap = false;
</script>

<script lang="ts">
  import { allLogEntries, clearDebugLog } from '$lib/stores/Log';
  import DebugLogControls from './DebugLogControls.svelte';
  import ScrollArea from '$lib/components/UI/ScrollArea.svelte';

  const SEVERITIES = ['ALL', 'critical', 'error', 'warning', 'success', 'info'] as const;
  const RENDER_CAP = 600; // lines actually painted

  let filterTag = $state(lastTag);
  let filterSeverity = $state(lastSeverity);
  let search = $state(lastSearch);
  let autoscroll = $state(true);
  let wrap = $state(lastWrap);
  let bodyEl: HTMLElement | null = $state(null);

  $effect(() => void (lastTag = filterTag));
  $effect(() => void (lastSeverity = filterSeverity));
  $effect(() => void (lastSearch = search));
  $effect(() => void (lastWrap = wrap));

  const knownTags = $derived([...new Set($allLogEntries.map((e) => e.type))].sort());

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    let out = $allLogEntries;
    if (filterTag !== 'ALL') out = out.filter((e) => e.type === filterTag);
    if (filterSeverity !== 'ALL') out = out.filter((e) => e.severity === filterSeverity);
    if (q)
      out = out.filter(
        (e) =>
          e.action.toLowerCase().includes(q) ||
          (e.result ?? '').toLowerCase().includes(q) ||
          (e.actor ?? '').toLowerCase().includes(q)
      );
    return out.slice(-RENDER_CAP);
  });

  // Drop a stale category filter when it no longer matches any entry.
  $effect(() => {
    if (filterTag !== 'ALL' && !knownTags.includes(filterTag as (typeof knownTags)[number]))
      filterTag = 'ALL';
  });

  // Autoscroll to newest as content arrives.
  $effect(() => {
    const _ = filtered.length;
    if (autoscroll && bodyEl) {
      const el = bodyEl;
      requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
    }
  });

  function sevColor(sev: string): string {
    switch (sev) {
      case 'critical':
        return 'var(--danger, #ff5555)';
      case 'error':
        return '#ff7b72';
      case 'warning':
        return '#e3b341';
      case 'success':
        return '#7ee787';
      default:
        return 'var(--text-muted)';
    }
  }

  async function clearLogs() {
    clearDebugLog();
    await fetch('/api/logs', { method: 'DELETE' }).catch(() => {});
  }
</script>

<div class="debug-log">
  <DebugLogControls
    bind:filterTag
    bind:filterSeverity
    bind:search
    bind:autoscroll
    bind:wrap
    severities={SEVERITIES}
    {knownTags}
    shown={filtered.length}
    total={$allLogEntries.length}
    onclear={clearLogs}
  />

  <ScrollArea class="body" bind:viewport={bodyEl}>
    {#if $allLogEntries.length === 0}
      <div class="waiting">no log entries yet — unpause the game</div>
    {:else if filtered.length === 0}
      <div class="waiting">no entries match filter</div>
    {:else}
      {#each filtered as e (e.id)}
        <div class="row" class:wrap>
          <span class="turn">T{String(e.turn).padStart(5, '0')}</span>
          <span class="cat">{e.type}</span>
          <span class="msg" style:color={sevColor(e.severity)}>
            {#if e.actor && e.actor !== 'system'}<span class="actor">{e.actor}</span
              >{/if}{e.action}{#if e.result}<span class="result"> — {e.result}</span>{/if}
          </span>
        </div>
      {/each}
    {/if}
  </ScrollArea>
</div>

<style>
  .debug-log {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    font-family: var(--font-mono);
  }
  /* .body is the ScrollArea viewport (overflow + auto-hiding bar live in ScrollArea). */
  .debug-log :global(.body) {
    flex: 1;
    min-height: 0;
    padding: 3px 4px;
  }
  .row {
    display: flex;
    gap: 0.6em;
    font-size: 11px;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row.wrap {
    white-space: normal;
  }
  .turn {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .cat {
    color: var(--accent-hi);
    flex-shrink: 0;
    width: 5.5em;
  }
  .msg {
    flex: 1;
    min-width: 0;
  }
  .actor {
    color: var(--text);
    margin-right: 0.4em;
  }
  .result {
    color: var(--text-muted);
  }
  .waiting {
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    padding: 6px 2px;
  }
</style>
