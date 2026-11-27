/** @typedef {import('../work-pins/browser-session.mjs').Page} Page */

export function watchSim() {
  window.__f4xTurn = 0;
  window.__f4xSpeed = null;
  window.__f4xWorkerTps = [];
  const Native = window.Worker;
  window.Worker = class extends Native {
    constructor(/** @type {string | URL} */ url, /** @type {WorkerOptions | undefined} */ options) {
      super(url, options);
      if (String(url).includes('sim.worker')) window.__f4xSim = this;
      this.addEventListener('message', (e) => {
        const d = e.data;
        if (d?.kind === 'snapshot' && typeof d.state?.turn === 'number') window.__f4xTurn = d.state.turn;
        if (d?.kind === 'simlog')
          for (const { m: sink, a } of d.events ?? []) {
            if (sink !== 'logEvent' || a?.[0]?.category !== 'perf') continue;
            const message = a[0].message ?? '';
            const speed = /speed=([\d.]+)x/.exec(message);
            const tps = /tps=(\d+)/.exec(message);
            if (speed) window.__f4xSpeed = Number(speed[1]);
            if (tps) window.__f4xWorkerTps.push(Number(tps[1]));
          }
      });
    }
  };
}

/** @param {Page} page @param {number} speed */
export const setSpeed = (page, speed) =>
  page.evaluate((/** @type {number} */ s) => {
    window.__f4xSpeed = null;
    window.__f4xSim.postMessage({ kind: 'setSpeed', speed: s });
  }, speed);

/** @param {Page} page @param {number} speed */
export async function assertSpeed(page, speed) {
  const running = await page.evaluate(() => window.__f4xSpeed);
  if (running !== speed) throw new Error(`asked the sim for ${speed}x, it reports ${running ?? 'no'} speed`);
}
