<!--
  DebugLogScreen — live in-game viewer for the `.debug/*.log` stream.
  Dev-only: mounted by +page.svelte solely when VITE_DEBUG_MODE is set. Streams
  from /api/debug-stream (SSE) with source switching, tag/severity/text filters,
  tag colouring, autoscroll, and a clear button. Ported from the yact LogStreamer.
-->
<script lang="ts">
  import { browser } from '$app/environment';
  import { parseDebugLine, type ParsedDebugLine } from '$lib/game/dev/parseDebugLine';
  import DebugLogRow from './DebugLogRow.svelte';

  const SOURCES = ['all', 'pawns', 'entities', 'activity', 'game', 'perf'] as const;
  const SEVERITIES = ['ALL', 'error', 'warning', 'info', 'debug'] as const;
  const BUFFER_CAP = 2000; // lines retained in memory
  const RENDER_CAP = 600; // lines actually painted

  let source = $state<(typeof SOURCES)[number]>('all');
  let filterTag = $state('ALL');
  let filterSeverity = $state('ALL');
  let search = $state('');
  let autoscroll = $state(true);

  let lines = $state<ParsedDebugLine[]>([]);
  let bodyEl: HTMLElement | null = $state(null);
  let keyCounter = 0;
  let es: EventSource | null = null;

  const knownTags = $derived([...new Set(lines.flatMap((l) => (l.tag ? [l.tag] : [])))].sort());

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    let out = lines;
    if (filterTag !== 'ALL') out = out.filter((l) => l.tag === filterTag);
    if (filterSeverity !== 'ALL') out = out.filter((l) => l.severity === filterSeverity);
    if (q) out = out.filter((l) => l.raw.toLowerCase().includes(q));
    return out.slice(-RENDER_CAP);
  });

  // Drop a stale tag filter when the source switch makes it invalid.
  $effect(() => {
    if (filterTag !== 'ALL' && !knownTags.includes(filterTag)) filterTag = 'ALL';
  });

  // (Re)connect whenever the source changes.
  $effect(() => {
    if (!browser) return;
    const src = source;
    es?.close();
    lines = [];
    es = new EventSource(`/api/debug-stream?source=${src}`);
    es.onmessage = (ev: MessageEvent) => {
      const parsed = parseDebugLine(ev.data as string, ++keyCounter);
      lines = [...lines.slice(-(BUFFER_CAP - 1)), parsed];
    };
    return () => es?.close();
  });

  // Autoscroll to the newest line as content arrives.
  $effect(() => {
    const _ = filtered.length;
    if (browser && autoscroll && bodyEl) {
      const el = bodyEl;
      requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
    }
  });

  async function clearLogs() {
    await fetch('/api/logs', { method: 'DELETE' }).catch(() => {});
    lines = [];
  }
</script>

<div class="debug-log">
  <div class="header">
    <span class="title">DEBUG LOG</span>
    <select class="sel" bind:value={source} aria-label="Source">
      {#each SOURCES as s}<option value={s}>{s}</option>{/each}
    </select>
    <select class="sel" bind:value={filterTag} aria-label="Tag filter">
      <option value="ALL">tag:ALL</option>
      {#each knownTags as t (t)}<option value={t}>[{t}]</option>{/each}
    </select>
    <select class="sel" bind:value={filterSeverity} aria-label="Severity filter">
      {#each SEVERITIES as s}<option value={s}>{s === 'ALL' ? 'sev:ALL' : s}</option>{/each}
    </select>
    <input class="search" type="text" placeholder="search…" bind:value={search} />
    <button class="btn" class:on={autoscroll} onclick={() => (autoscroll = !autoscroll)}>
      {autoscroll ? 'scroll■' : 'scroll□'}
    </button>
    <button class="btn" onclick={clearLogs}>clear</button>
    <span class="count">{filtered.length}/{lines.length}</span>
  </div>

  <div class="body" bind:this={bodyEl}>
    {#if lines.length === 0}
      <div class="waiting">waiting for log stream…</div>
    {:else if filtered.length === 0}
      <div class="waiting">no lines match filter</div>
    {:else}
      {#each filtered as line (line.key)}
        <DebugLogRow {line} />
      {/each}
    {/if}
  </div>
</div>

<style>
  .debug-log {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    font-family: 'Courier New', monospace;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 0.4em;
    flex-wrap: wrap;
    padding: 4px 6px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-hi);
    flex-shrink: 0;
  }
  .title {
    color: var(--accent-hi);
    font-size: 11px;
    letter-spacing: 0.1em;
    margin-right: auto;
  }
  .sel,
  .search,
  .btn {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    font-family: inherit;
    font-size: 11px;
    padding: 2px 5px;
    cursor: pointer;
    outline: none;
  }
  .sel:focus,
  .search:focus {
    border-color: var(--border-hi);
  }
  .search {
    width: 9em;
    cursor: text;
  }
  .btn:hover {
    background: var(--bg-hover);
    color: var(--accent-hi);
  }
  .btn.on {
    color: var(--accent-hi);
    border-color: var(--border-hi);
  }
  .count {
    color: var(--text-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 3px 4px;
    scrollbar-width: thin;
  }
  .waiting {
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    padding: 6px 2px;
  }
</style>
