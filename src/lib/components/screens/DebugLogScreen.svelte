<!--
  DebugLogScreen — live in-game viewer for the game's debug logs.
  Dev-only: mounted by +page.svelte solely when VITE_DEBUG_MODE is set.

  Default source `live` taps gameLogger's in-memory buffer directly (zero
  latency, no server round-trip); the per-file sources stream from
  /api/debug-stream (SSE) and include prior-session history persisted on disk.
  Either way: source switching, tag/severity/text filters, tag colouring,
  autoscroll, clear. Ported from the yact LogStreamer.
-->
<script module lang="ts">
  import type { ParsedDebugLine } from '$lib/game/dev/parseDebugLine';

  // Survives tab close/reopen: the panel lives behind {#if currentScreen==='debug'},
  // so it's destroyed when you leave. Caching the buffer (and last source) per
  // module lets a reopen paint instantly instead of flickering "waiting…".
  const lineCache = new Map<string, ParsedDebugLine[]>();
  let lastSource = 'live';
  let lastWrap = false; // line-wrap preference survives tab close/reopen
  let keyCounter = 0;
  const nextKey = () => ++keyCounter; // monotonic across remounts so keys never collide
</script>

<script lang="ts">
  import { browser } from '$app/environment';
  import { gameLogger } from '$lib/game/dev/gameLogger';
  import { parseDebugLine } from '$lib/game/dev/parseDebugLine';
  import DebugLogRow from './DebugLogRow.svelte';
  import DebugLogControls from './DebugLogControls.svelte';

  const SOURCES = ['live', 'all', 'pawns', 'entities', 'activity', 'game', 'perf'] as const;
  const SEVERITIES = ['ALL', 'error', 'warning', 'info', 'debug'] as const;
  const BUFFER_CAP = 2000; // lines retained in memory
  const RENDER_CAP = 600; // lines actually painted

  let source = $state<(typeof SOURCES)[number]>(lastSource as (typeof SOURCES)[number]);
  let filterTag = $state('ALL');
  let filterSeverity = $state('ALL');
  let search = $state('');
  let autoscroll = $state(true);
  let wrap = $state(lastWrap);

  // Seed from the cache at creation so the first paint already has content.
  let lines = $state<ParsedDebugLine[]>(lineCache.get(lastSource) ?? []);
  let bodyEl: HTMLElement | null = $state(null);
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
    lastSource = src;
    lines = lineCache.get(src) ?? []; // restore this source's buffer (empty first time)

    // Live source: tap gameLogger's buffer in-memory. Each line is staged into a
    // plain array on the hot path; we coalesce into reactive `lines` once per rAF
    // so Svelte invalidates per-frame, never per-log-call.
    if (src === 'live') {
      pending = [];
      const flush = () => {
        rafId = null;
        if (pending.length === 0) return;
        lines = [...lines, ...pending].slice(-BUFFER_CAP);
        lineCache.set(src, lines);
        pending = [];
      };
      const unsub = gameLogger.subscribe((raw) => {
        pending.push(parseDebugLine(raw, nextKey()));
        if (rafId === null) rafId = requestAnimationFrame(flush);
      });
      return () => {
        unsub();
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = null;
        pending = [];
      };
    }

    // File sources replay their tail from disk on (re)connect, so they
    // repopulate themselves — caching them would double up the replayed lines.
    es?.close();
    es = new EventSource(`/api/debug-stream?source=${src}`);
    es.onmessage = (ev: MessageEvent) => {
      const parsed = parseDebugLine(ev.data as string, nextKey());
      lines = [...lines.slice(-(BUFFER_CAP - 1)), parsed];
    };
    return () => es?.close();
  });

  // Remember the wrap preference for the next time the tab is reopened.
  $effect(() => {
    lastWrap = wrap;
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
    lineCache.delete(source);
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
    bind:wrap
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
        <DebugLogRow {line} {wrap} />
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
