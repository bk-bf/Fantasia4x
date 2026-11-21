(() => {
  const CONFIG = window.__F4X_BENCH_CONFIG;
  if (!CONFIG || window.top !== window || location.origin !== CONFIG.origin) return;
  if (window.__f4xBenchStarted) return;
  window.__f4xBenchStarted = true;

  const MAP = '[aria-label="World map"]';
  const CAMERA_KEY = 'fantasia4x-camera';
  const SAVE_ID = 'work-pins';
  const RANDOM_SEED = 0x2545f491;
  const NETWORK_QUIET_MS = 3000;
  const WARMUP_SECONDS = 3;
  const SETTLE_MS = 1000;
  const ZOOM_SETTLE_MS = 2000;
  const WHEEL_GAP_MS = 60;
  const WHEEL_OUT_STEPS = 45;
  const KINDS = {
    'run 1x': { speed: 1, paused: false, pan: false },
    'paused pan': { speed: 1, paused: true, pan: true },
    'run 4x': { speed: 4, paused: false, pan: false }
  };

  let seed = RANDOM_SEED;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  delete window.Audio;
  delete window.AudioContext;
  delete window.webkitAudioContext;
  localStorage.setItem('fx.gameplay.autoPauseOnThreat', 'false');
  localStorage.setItem('fx.gameplay.autoPauseOnDeath', 'false');

  let lastResource = performance.now();
  new PerformanceObserver(() => {
    lastResource = performance.now();
  }).observe({ type: 'resource', buffered: true });

  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const post = async (path, body = {}) =>
    (await fetch(CONFIG.listener + path, { method: 'POST', body: JSON.stringify(body) })).json();
  const log = (line) => post('/log', { line });

  async function waitFor(what, find, timeoutMs) {
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      const found = find();
      if (found) return found;
      if (performance.now() > deadline) throw new Error(`timed out waiting for ${what}`);
      await sleep(250);
    }
  }

  async function seedSave() {
    const snap = await (await fetch(CONFIG.listener + '/save.json')).json();
    const db = await new Promise((done, fail) => {
      const req = indexedDB.open('fantasia4x', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('saves');
      req.onsuccess = () => done(req.result);
      req.onerror = () => fail(req.error);
    });
    await new Promise((done, fail) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').clear();
      tx.objectStore('saves').put(snap.dynamic, `save:${SAVE_ID}`);
      tx.objectStore('saves').put(snap.world, `world:${SAVE_ID}`);
      tx.oncomplete = done;
      tx.onerror = () => fail(tx.error);
    });
    db.close();
    sessionStorage.clear();
  }

  async function loadGame() {
    const load = await waitFor(
      'the Load Game button',
      () =>
        [...document.querySelectorAll('button.menu-btn')].find(
          (b) => b.textContent.trim() === 'Load Game' && !b.disabled
        ),
      300_000
    );
    load.click();
    (await waitFor('a save row', () => document.querySelector('.row button.main'), 60_000)).click();
    await waitFor(
      'the map',
      () =>
        !!document.querySelector(MAP) &&
        !document.querySelector('.loading-screen') &&
        !!document.querySelector('button.ctrl-btn'),
      900_000
    );
    await waitFor(
      'the network to go quiet',
      () => performance.now() - lastResource > NETWORK_QUIET_MS,
      300_000
    );
  }

  const map = () => document.querySelector(MAP);
  const turn = () =>
    Number((document.querySelector('.bi.turn')?.textContent ?? '').replace(/[^0-9]/g, ''));
  const tile = () => {
    try {
      return JSON.parse(sessionStorage.getItem(CAMERA_KEY))?.tileWidth ?? null;
    } catch {
      return null;
    }
  };
  const pauseButton = () =>
    [...document.querySelectorAll('button.ctrl-btn')].find((b) => /PAUSE|RESUME/.test(b.textContent));
  const isPaused = () => pauseButton().classList.contains('is-paused');

  async function setPaused(want) {
    if (isPaused() !== want) pauseButton().click();
    await sleep(100);
    map().focus();
    if (isPaused() !== want) throw new Error(`pause button did not reach paused=${want}`);
  }

  async function setSpeed(speed) {
    [...document.querySelectorAll('button.spd')].find((b) => b.textContent.trim() === `${speed}x`).click();
    await sleep(100);
    const active = document.querySelector('button.spd.active')?.textContent?.trim();
    if (active !== `${speed}x`) throw new Error(`speed button did not reach ${speed}x`);
  }

  async function wheel(deltaY, steps) {
    const box = map().getBoundingClientRect();
    const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    for (let i = 0; i < steps; i++) {
      map().dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, ...at }));
      await sleep(WHEEL_GAP_MS);
    }
    await sleep(ZOOM_SETTLE_MS);
    return tile();
  }

  async function zoomTo(segment) {
    const fit = await wheel(120, WHEEL_OUT_STEPS);
    if (!(fit < 4)) throw new Error(`zooming out reached ${fit} px per tile, not the whole map`);
    const reached = segment.wheelIn ? await wheel(-120, segment.wheelIn) : fit;
    if (segment.tile !== null && reached !== segment.tile)
      throw new Error(`zoom reached ${reached} px per tile, wanted ${segment.tile}`);
    return reached;
  }

  function key(type, name) {
    map().dispatchEvent(new KeyboardEvent(type, { key: name, code: name, bubbles: true, cancelable: true }));
  }

  async function pan(ms) {
    for (const name of ['ArrowRight', 'ArrowLeft']) {
      map().focus();
      key('keydown', name);
      await sleep(ms / 2);
      key('keyup', name);
    }
  }

  const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

  async function measure(kindName, seconds) {
    const kind = KINDS[kindName];
    await setPaused(false);
    await setSpeed(kind.speed);
    await setPaused(kind.paused);
    await post('/cpu-mark');
    await sleep(SETTLE_MS);
    const times = [];
    let loop = 0;
    const onFrame = (t) => {
      times.push(t);
      loop = requestAnimationFrame(onFrame);
    };
    const turn0 = turn();
    const start = performance.now();
    loop = requestAnimationFrame(onFrame);
    if (kind.pan) await pan(seconds * 1000);
    else await sleep(seconds * 1000);
    cancelAnimationFrame(loop);
    const secs = (performance.now() - start) / 1000;
    const turn1 = turn();
    const cpu = await post('/cpu-since');
    if (document.querySelector('.game-over')) throw new Error(`the colony died by turn ${turn1}`);
    const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
    const frameMs = 1000 / CONFIG.refreshHz;
    return {
      fps: +(times.length / secs).toFixed(1),
      tps: +((turn1 - turn0) / secs).toFixed(1),
      p50Ms: +quantile(gaps, 0.5).toFixed(2),
      p95Ms: +quantile(gaps, 0.95).toFixed(2),
      p99Ms: +quantile(gaps, 0.99).toFixed(2),
      maxMs: +gaps[gaps.length - 1].toFixed(1),
      over1_5: gaps.filter((g) => g > frameMs * 1.5).length,
      over3: gaps.filter((g) => g > frameMs * 3).length,
      frames: times.length,
      turn: turn1,
      ...cpu
    };
  }

  function webglRenderer() {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'no WebGL2';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  }

  function windowInfo() {
    const canvas = map()?.querySelector('canvas') ?? document.querySelector('canvas');
    return {
      userAgent: navigator.userAgent,
      inner: `${innerWidth}x${innerHeight}`,
      devicePixelRatio,
      canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
      threads: navigator.hardwareConcurrency,
      visibility: document.visibilityState,
      focused: document.hasFocus()
    };
  }

  async function runSegment(segment) {
    const started = performance.now();
    await loadGame();
    if (innerWidth !== CONFIG.window.width || innerHeight !== CONFIG.window.height)
      throw new Error(`the window is ${innerWidth}x${innerHeight}, not ${CONFIG.window.width}x${CONFIG.window.height}`);
    map().focus();
    await setPaused(true);
    const tilePx = await zoomTo(segment);
    const warm = await measure(segment.kinds[0], WARMUP_SECONDS);
    await log(
      `${segment.name}: loaded and warmed in ${((performance.now() - started) / 1000).toFixed(0)} s, ` +
        `tile ${tilePx}, turn ${warm.turn}, warm-up fps ${warm.fps} ${JSON.stringify(windowInfo())}`
    );
    const rows = [];
    for (const kindName of segment.kinds) {
      const runs = [];
      for (let r = 0; r < CONFIG.rounds; r++) runs.push(await measure(kindName, segment.seconds));
      rows.push({ segment: segment.name, zoom: segment.zoom, tilePx, kind: kindName, runs });
    }
    return { rows, window: windowInfo() };
  }

  async function main() {
    const state = await post('/state');
    if (state.step === 'done') return;
    try {
      if (state.step === 'seed') {
        await seedSave();
        await post('/seeded', { renderer: webglRenderer() });
      } else {
        await post('/segment', await runSegment(state.segment));
      }
    } catch (e) {
      await post('/fail', { message: String(e?.message ?? e) });
    }
    location.reload();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
