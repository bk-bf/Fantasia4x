export type FrameSection = 'sim' | 'fx' | 'draw';

type HeapPerformance = Performance & { memory?: { usedJSHeapSize: number } };

const clock = () => new Date().toTimeString().slice(0, 8);

const pct = (ms: number, elapsedMs: number) => `${((ms * 100) / elapsedMs).toFixed(1)}%`;

export function perfSessionLine(): string {
  const branch = import.meta.env.VITE_DEV_BRANCH || 'detached';
  const commit = import.meta.env.VITE_DEV_COMMIT || 'unknown';
  return `perf-session branch=${branch} commit=${commit} t=${clock()}`;
}

export function createFramePerf() {
  const sections: Record<FrameSection, number> = { sim: 0, fx: 0, draw: 0 };
  let js = 0;
  let jsMax = 0;
  let ui = 0;
  let render = 0;
  let pans = 0;
  let frameStart = 0;
  let frameEnd = 0;
  let uiEnd = 0;
  let sectionStart = 0;
  let lastViewX = Number.NaN;
  let lastViewY = Number.NaN;

  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    render += performance.now() - uiEnd;
  };
  const afterMicrotasks = () => {
    uiEnd = performance.now();
    ui += uiEnd - frameEnd;
    channel.port2.postMessage(null);
  };

  return {
    begin(now: number) {
      frameStart = now;
    },
    start() {
      sectionStart = performance.now();
    },
    stop(section: FrameSection) {
      sections[section] += performance.now() - sectionStart;
    },
    end(viewX: number, viewY: number) {
      frameEnd = performance.now();
      const t = frameEnd - frameStart;
      js += t;
      if (t > jsMax) jsMax = t;
      if (viewX !== lastViewX || viewY !== lastViewY) {
        if (!Number.isNaN(lastViewX)) pans++;
        lastViewX = viewX;
        lastViewY = viewY;
      }
      queueMicrotask(afterMicrotasks);
    },
    report(elapsedMs: number): string {
      const idle = Math.max(0, elapsedMs - js - ui - render);
      const heap = (performance as HeapPerformance).memory?.usedJSHeapSize;
      const heapText = heap === undefined ? 'n/a' : `${Math.round(heap / 1048576)}MB`;
      const fxNodes =
        document.querySelector('.world-effects-layer')?.getElementsByTagName('*').length ?? 0;
      const line =
        `t=${clock()} vis=${document.visibilityState} focus=${document.hasFocus() ? 1 : 0} ` +
        `js=${pct(js, elapsedMs)} sim=${pct(sections.sim, elapsedMs)} ` +
        `fx=${pct(sections.fx, elapsedMs)} draw=${pct(sections.draw, elapsedMs)} ` +
        `ui=${pct(ui, elapsedMs)} render=${pct(render, elapsedMs)} idle=${pct(idle, elapsedMs)} ` +
        `jsMax=${jsMax.toFixed(1)}ms heap=${heapText} fxNodes=${fxNodes} pan=${pans}`;
      js = 0;
      jsMax = 0;
      ui = 0;
      render = 0;
      pans = 0;
      sections.sim = 0;
      sections.fx = 0;
      sections.draw = 0;
      return line;
    }
  };
}
