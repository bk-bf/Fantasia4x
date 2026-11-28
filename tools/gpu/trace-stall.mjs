import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** @typedef {{ ph?: string, name: string, pid: number, tid: number, ts: number, dur?: number, args?: { name?: string } }} TraceEvent */
/** @typedef {{ name: string, ts: number, end: number, dur: number, child: number, top: boolean }} Slice */
/** @typedef {{ thread: string, busyMs: number, top: string[] }} ThreadCost */

const FRAME_EVENTS = new Set(['FireAnimationFrame', 'AnimationFrame', 'BeginMainThreadFrame']);

/** @param {TraceEvent[]} events */
function threadsOf(events) {
  /** @type {Map<string, string>} */
  const names = new Map();
  /** @type {Map<number, string>} */
  const procs = new Map();
  for (const e of events) {
    if (e.ph !== 'M') continue;
    if (e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args?.name ?? '?');
    if (e.name === 'process_name') procs.set(e.pid, e.args?.name ?? '?');
  }
  return { names, procs };
}

/** @param {TraceEvent[]} events */
function selfTimes(events) {
  /** @type {Map<string, Slice[]>} */
  const byThread = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur) continue;
    const key = `${e.pid}:${e.tid}`;
    if (!byThread.has(key)) byThread.set(key, []);
    /** @type {Slice[]} */ (byThread.get(key)).push({ name: e.name, ts: e.ts, end: e.ts + e.dur, dur: e.dur, child: 0, top: false });
  }
  for (const list of byThread.values()) {
    list.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    /** @type {Slice[]} */
    const stack = [];
    for (const ev of list) {
      while (stack.length && stack[stack.length - 1].end <= ev.ts) stack.pop();
      const parent = stack.at(-1);
      if (parent) parent.child += Math.min(ev.end, parent.end) - ev.ts;
      else ev.top = true;
      stack.push(ev);
    }
  }
  return byThread;
}

/** @param {TraceEvent[]} events @param {Map<string, string>} names */
function frameWindows(events, names) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const e of events) {
    if (!FRAME_EVENTS.has(e.name)) continue;
    const key = `${e.pid}:${e.tid}`;
    if (names.get(key) !== 'CrRendererMain') continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!main) return { main: null, windows: [] };
  const starts = [...new Set(events.filter((e) => FRAME_EVENTS.has(e.name) && `${e.pid}:${e.tid}` === main).map((e) => e.ts))].sort((a, b) => a - b);
  /** @type {{ from: number, to: number }[]} */
  const windows = [];
  for (let i = 1; i < starts.length; i++) windows.push({ from: starts[i - 1], to: starts[i] });
  return { main, windows };
}

/** @param {TraceEvent[]} events @returns {{ start: number, end: number }[]} */
function markedRanges(events) {
  /** @type {Map<string, { start?: number, end?: number }>} */
  const marks = new Map();
  for (const e of events) {
    const m = /^f4x-zoom-(\d+)-(start|end)$/.exec(e.name ?? '');
    if (!m) continue;
    const range = marks.get(m[1]) ?? {};
    range[/** @type {'start' | 'end'} */ (m[2])] = e.ts;
    marks.set(m[1], range);
  }
  return /** @type {{ start: number, end: number }[]} */ (
    [...marks.values()].filter((r) => r.start !== undefined && r.end !== undefined)
  );
}

/** @param {TraceEvent[] | { traceEvents: TraceEvent[] }} trace @param {number} [n] @returns {{ frameMs?: number, threads?: ThreadCost[], error?: string }[]} */
export function worstFrames(trace, n = 5) {
  const events = Array.isArray(trace) ? trace : trace.traceEvents;
  const { names, procs } = threadsOf(events);
  const { main, windows: all } = frameWindows(events, names);
  if (!main) return [{ error: 'no renderer frames in this trace' }];
  const ranges = markedRanges(events);
  const windows = ranges.length ? all.filter((w) => ranges.some((r) => w.to > r.start && w.from < r.end)) : all;
  const byThread = selfTimes(events);
  const worst = windows.sort((a, b) => (b.to - b.from) - (a.to - a.from)).slice(0, n);
  return worst.map(({ from, to }) => {
    /** @type {ThreadCost[]} */
    const threads = [];
    for (const [key, list] of byThread) {
      let busy = 0;
      /** @type {Map<string, number>} */
      const self = new Map();
      for (const ev of list) {
        const overlap = Math.min(ev.end, to) - Math.max(ev.ts, from);
        if (overlap <= 0) continue;
        if (ev.top) busy += overlap;
        const share = ((ev.dur - ev.child) * overlap) / ev.dur;
        if (share > 0) self.set(ev.name, (self.get(ev.name) ?? 0) + share);
      }
      if (busy < 5000) continue;
      const pid = Number(key.split(':')[0]);
      threads.push({
        thread: `${procs.get(pid) ?? pid}/${names.get(key) ?? key}`,
        busyMs: Math.round(busy / 1000),
        top: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${Math.round(v / 1000)}ms`)
      });
    }
    threads.sort((a, b) => b.busyMs - a.busyMs);
    return { frameMs: Math.round((to - from) / 1000), threads };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, n = '5'] = process.argv.slice(2);
  if (!file) {
    console.error('usage: node tools/gpu/trace-stall.mjs <trace.json> [frames]');
    process.exit(2);
  }
  for (const f of worstFrames(JSON.parse(readFileSync(file, 'utf8')), Number(n))) {
    console.log(`frame ${f.frameMs} ms`);
    for (const t of f.threads ?? []) console.log(`  ${t.busyMs} ms busy  ${t.thread}\n      ${t.top.join(' | ')}`);
    if (f.error) console.log(`  ${f.error}`);
  }
}
