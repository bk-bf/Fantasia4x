<!--
  DebugLogScreen — live in-game viewer for the game's debug logs.
  Dev-only: mounted by +page.svelte solely when VITE_DEBUG_MODE is set.

  Default source `live` taps gameLogger's in-memory buffer directly (zero
  latency, no server round-trip); the per-file sources stream from
  /api/debug-stream (SSE) and include prior-session history persisted on disk.
  Either way: source switching, tag/severity/text filters, tag colouring,
  autoscroll, clear. Ported from the yact LogStreamer.
-->
<script lang="ts">
  import { browser } from '$app/environment';
  import { gameLogger } from '$lib/game/dev/gameLogger';
  import { parseDebugLine, type ParsedDebugLine } from '$lib/game/dev/parseDebugLine';
  import DebugLogRow from './DebugLogRow.svelte';
  import DebugLogControls from './DebugLogControls.svelte';

  const SOURCES = ['live', 'all', 'pawns', 'entities', 'activity', 'game', 'perf'] as const;
  const SEVERITIES = ['ALL', 'error', 'warning', 'info', 'debug'] as const;
  const BUFFER_CAP = 2000; // lines retained in memory
  const RENDER_CAP = 600; // lines actually painted

  let source = $state<(typeof SOURCES)[number]>('live');
  let filterTag = $state('ALL');
  let filterSeverity = $state('ALL');
  let search = $state('');
  let autoscroll = $state(true);

  let lines = $state<ParsedDebugLine[]>([]);
  let bodyEl: HTMLElement | null = $state(null);
  let keyCounter = 0;
  let es: EventSource | null = null;
  // Live-tap batching: plain (non-reactive) staging drained into `lines` once per frame.
  let pending: ParsedDebugLine[] = [];
  let rafId: number | null = null;

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
    lines = [];

    // Live source: tap gameLogger's buffer in-memory. Each line is staged into a
    // plain array on the hot path; we coalesce into reactive `lines` once per rAF
    // so Svelte invalidates per-frame, never per-log-call.
    if (src === 'live') {
      pending = [];
      const flush = () => {
        rafId = null;
        if (pending.length === 0) return;
        lines = [...lines, ...pending].slice(-BUFFER_CAP);
        pending = [];
      };
      const unsub = gameLogger.subscribe((raw) => {
        pending.push(parseDebugLine(raw, ++keyCounter));
        if (rafId === null) rafId = requestAnimationFrame(flush);
      });
      return () => {
        unsub();
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = null;
        pending = [];
      };
    }

    es?.close();
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
  <DebugLogControls
    bind:source
    bind:filterTag
    bind:filterSeverity
    bind:search
    bind:autoscroll
    sources={SOURCES}
    severities={SEVERITIES}
    {knownTags}
    shown={filtered.length}
    total={lines.length}
    onclear={clearLogs}
  />

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
