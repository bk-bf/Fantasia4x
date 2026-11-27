import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { encodePng } from './png.mjs';
import { backendOf, gpuSwitch, patchChromium, startCompositor } from './session.mjs';

/** @typedef {import('playwright').Page} Page */
/** @typedef {{ scene: string, w: number, h: number, sha256: string } & Record<string, unknown>} Scene */

const USAGE =
  'usage: CHROME=<chromium> [F4X_GPU=webgpu|webgl2] [F4X_PASSES=wgsl] node tools/gpu/capture.mjs <app tree> <out dir>';
const [TREE_ARG, OUT_ARG] = process.argv.slice(2);
const CHROME = process.env.CHROME;
if (!TREE_ARG || !OUT_ARG || !CHROME) {
  console.error(USAGE);
  process.exit(2);
}
const TREE = resolve(TREE_ARG);
const { gpu: GPU, args: GPU_ARGS, apply: applyGpu } = gpuSwitch();
const GPU_QUERY = applyGpu(new URLSearchParams());
const QUERY = GPU_QUERY.size ? `?${GPU_QUERY}` : '';
const OUT = resolve(OUT_ARG);
mkdirSync(OUT, { recursive: true });
const git = (/** @type {string[]} */ args) =>
  execFileSync('git', ['-C', TREE, ...args], { encoding: 'utf8' }).trim();
const COMMIT = git(['rev-parse', 'HEAD']);
const DIRTY = git(['status', '--porcelain', '--untracked-files=no']) !== '';
console.log(`TREE ${TREE} at ${COMMIT}${DIRTY ? ' with uncommitted changes' : ''}`);

const STORE = '/src/lib/stores/gameState.ts';
const FIXTURE = join(TREE, 'tools/work-pins/fixtures/dev-save.json.gz');
const CAMERA = { viewX: 228, viewY: 230, tileWidth: 24 };
const TIME_OF_DAY = 0.5;
const SETTLE_FRAMES = 120;
const FRAME_MS = 16;
const LOADS = [
  { name: 'painted-spring', season: 'spring' },
  { name: 'painted-winter', season: 'winter' }
];
/** @type {[string, number, number][]} */
const ZOOMS = [
  ['t24', 0, 0],
  ['t48', -120, 12],
  ['fit', 120, 40]
];

const { openGame, freezeClock, setPaused, logger, sleep } = await import(
  join(TREE, 'tools/work-pins/browser-session.mjs')
);

function keepDrawingBuffer() {
  const w = /** @type {any} */ (globalThis);
  const orig = HTMLCanvasElement.prototype.getContext;
  w.__f4xGlCanvases = [];
  /** @type {any} */ (HTMLCanvasElement.prototype).getContext = function (
    /** @type {string} */ type,
    /** @type {any} */ attrs
  ) {
    if (type === 'webgl2' || type === 'webgl') {
      const ctx = orig.call(this, type, { ...(attrs ?? {}), preserveDrawingBuffer: true });
      if (ctx) w.__f4xGlCanvases.push(this);
      return ctx;
    }
    return orig.call(this, type, attrs);
  };
}

function keepWebgpuFrames() {
  const w = /** @type {any} */ (globalThis);
  if (!w.GPUCanvasContext) return;
  const proto = w.GPUCanvasContext.prototype;
  const configure = proto.configure;
  proto.configure = function (/** @type {any} */ c) {
    this.__f4xDevice = c.device;
    return configure.call(this, {
      ...c,
      usage: (c.usage ?? w.GPUTextureUsage.RENDER_ATTACHMENT) | w.GPUTextureUsage.COPY_SRC
    });
  };
  const current = proto.getCurrentTexture;
  proto.getCurrentTexture = function () {
    const texture = current.call(this);
    w.__f4xFrameTexture = { context: this, texture };
    return texture;
  };
  const submit = w.GPUQueue.prototype.submit;
  w.GPUQueue.prototype.submit = function (/** @type {any} */ buffers) {
    const result = submit.call(this, buffers);
    const frame = w.__f4xFrameTexture;
    w.__f4xFrameTexture = null;
    const device = frame?.context.__f4xDevice;
    if (!frame || device?.queue !== this) return result;
    const { texture } = frame;
    const bytesPerRow = Math.ceil((texture.width * 4) / 256) * 256;
    const buffer = device.createBuffer({
      size: bytesPerRow * texture.height,
      usage: w.GPUBufferUsage.COPY_DST | w.GPUBufferUsage.MAP_READ
    });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture },
      { buffer, bytesPerRow },
      { width: texture.width, height: texture.height }
    );
    submit.call(this, [encoder.finish()]);
    const done = buffer.mapAsync(w.GPUMapMode.READ).then(() => {
      const rows = new Uint8Array(buffer.getMappedRange());
      const rgba = new Uint8Array(texture.width * texture.height * 4);
      const bgra = texture.format === 'bgra8unorm';
      for (let y = 0; y < texture.height; y++)
        for (let x = 0; x < texture.width; x++) {
          const i = y * bytesPerRow + x * 4;
          const o = (y * texture.width + x) * 4;
          rgba[o] = rows[i + (bgra ? 2 : 0)];
          rgba[o + 1] = rows[i + 1];
          rgba[o + 2] = rows[i + (bgra ? 0 : 2)];
          rgba[o + 3] = rows[i + 3];
        }
      buffer.destroy();
      return { w: texture.width, h: texture.height, rgba };
    });
    w.__f4xWebgpuFrame = done;
    return result;
  };
}

function logWorker() {
  const w = /** @type {any} */ (globalThis);
  /** @type {any} */
  const Native = w.Worker;
  w.__f4xWorkerLog = [];
  const note = (/** @type {string} */ dir, /** @type {any} */ d) => {
    if (w.__f4xWorkerLogOn)
      w.__f4xWorkerLog.push(
        `${dir} ${d?.kind ?? typeof d}${d?.cmd?.type ? ':' + d.cmd.type : ''} @${performance.now()}`
      );
  };
  w.Worker = class extends Native {
    constructor(/** @type {any} */ url, /** @type {any} */ options) {
      super(url, options);
      this.addEventListener('message', (/** @type {MessageEvent} */ e) => note('in', e.data));
    }
    postMessage(/** @type {any} */ d, /** @type {any} */ t) {
      note('out', d);
      return super.postMessage(d, t);
    }
  };
}

function installRandomStreams() {
  const w = /** @type {any} */ (globalThis);
  const seeded = (/** @type {number} */ seed) => {
    let x = seed;
    return () => {
      x = (x + 0x6d2b79f5) | 0;
      let t = Math.imul(x ^ (x >>> 15), 1 | x);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  w.__f4xRandomCalls = {};
  w.__f4xStream = (/** @type {string} */ name, /** @type {number} */ seed) => {
    const inner = seeded(seed);
    if (!w.__f4xTraceRandom) return inner;
    const calls = w.__f4xRandomCalls;
    return () => {
      const site =
        name +
        ' ' +
        ((new Error().stack ?? '')
          .split('\n')[2]
          ?.trim()
          .replace(/\?[^:)]*/, '') ?? '?');
      calls[site] = (calls[site] ?? 0) + 1;
      return inner();
    };
  };
}

function disableAutosaveInit() {
  localStorage.setItem('fx.gameplay.autosave', 'false');
}

function setCamera(/** @type {string} */ cam) {
  sessionStorage.setItem('fantasia4x-camera', cam);
}

function fixtureFor(/** @type {string} */ season) {
  const snap = JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString());
  snap.dynamic.season = season;
  snap.dynamic._debugSeason = season;
  snap.dynamic._debugTimeOfDay = TIME_OF_DAY;
  const path = join(OUT, `.fixture-${season}.json`);
  writeFileSync(path, JSON.stringify(snap));
  return path;
}

async function settle(/** @type {Page} */ page) {
  for (let round = 0; round < 3; round++) {
    await sleep(1500);
    for (let i = 0; i < SETTLE_FRAMES / 3; i++) await page.clock.runFor(FRAME_MS);
  }
}

async function waitRendererUp(/** @type {Page} */ page) {
  const start = Date.now();
  while (
    !(await page.evaluate(async (store) => {
      const s = await import(store);
      let ready = false;
      s.rendererReady.subscribe((/** @type {boolean} */ v) => (ready = v))();
      return ready;
    }, STORE))
  ) {
    if (Date.now() - start > 300_000) throw new Error('renderer never reported ready');
    await sleep(250);
  }
}

async function remountRenderer(
  /** @type {Page} */ page,
  /** @type {(line: string) => void} */ log,
  /** @type {string} */ season
) {
  const before = await page.evaluate(
    async ([store, cam]) => {
      const w = /** @type {any} */ (globalThis);
      const s = await import(store);
      sessionStorage.setItem('fantasia4x-camera', cam);
      Math.random = w.__f4xStream('render', 0x5eed0001);
      w.__f4xRendererUp = false;
      s.storeReady.set(false);
      await Promise.resolve();
      s.rendererReady.subscribe((/** @type {boolean} */ v) => (w.__f4xRendererUp = v));
      s.storeReady.set(true);
      return w.__f4xGlCanvases.length;
    },
    [STORE, JSON.stringify(CAMERA)]
  );
  const start = Date.now();
  while (!(await page.evaluate(() => /** @type {any} */ (globalThis).__f4xRendererUp === true))) {
    if (Date.now() - start > 300_000)
      throw new Error('renderer did not come back after remount without advancing the clock');
    await sleep(250);
  }
  const after = await page.evaluate(() => {
    const w = /** @type {any} */ (globalThis);
    Math.random = w.__f4xStream('other', 0x5eed0002);
    return w.__f4xGlCanvases.filter((/** @type {HTMLCanvasElement} */ c) => c.isConnected).length;
  });
  const snapshots = () =>
    page.evaluate(
      () =>
        /** @type {any} */ (globalThis).__f4xWorkerLog.filter((/** @type {string} */ l) =>
          l.startsWith('in snapshot')
        ).length
    );
  const snaps = await snapshots();
  await page.evaluate(
    async ([store, season]) => {
      const s = await import(store);
      s.gameState.command({ type: 'setSeason', payload: { season }, save: false });
    },
    [STORE, season]
  );
  const t1 = Date.now();
  while ((await snapshots()) <= snaps) {
    if (Date.now() - t1 > 120_000)
      throw new Error('no snapshot came back for setSeason after the remount');
    await sleep(250);
  }
  await sleep(2000);
  log(
    `renderer remounted on the frozen clock after ${t1 - start} ms real (gl contexts ${before} -> live ${after}); setSeason ${season} snapshot back after ${Date.now() - t1} ms`
  );
}

async function readCanvas(/** @type {Page} */ page) {
  const gpuFrame = await page.evaluate(async () => {
    const frame = await /** @type {any} */ (globalThis).__f4xWebgpuFrame;
    if (!frame) return null;
    let s = '';
    for (let i = 0; i < frame.rgba.length; i += 0x8000)
      s += String.fromCharCode(...frame.rgba.subarray(i, i + 0x8000));
    return { w: frame.w, h: frame.h, b64: btoa(s), canvases: 1 };
  });
  if (gpuFrame) return { ...gpuFrame, rgba: Buffer.from(gpuFrame.b64, 'base64') };
  const r = await page.evaluate(() => {
    /** @type {HTMLCanvasElement[]} */
    const canvases = /** @type {any} */ (globalThis).__f4xGlCanvases;
    const live = canvases.filter((c) => c.isConnected && c.width > 0);
    const c = live.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const out = document.createElement('canvas');
    out.width = c.width;
    out.height = c.height;
    const ctx = /** @type {CanvasRenderingContext2D} */ (
      out.getContext('2d', { willReadFrequently: true })
    );
    ctx.drawImage(c, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let s = '';
    for (let i = 0; i < px.length; i += 0x8000)
      s += String.fromCharCode(...px.subarray(i, i + 0x8000));
    return { w: c.width, h: c.height, b64: btoa(s), canvases: live.length };
  });
  return { ...r, rgba: Buffer.from(r.b64, 'base64') };
}

const state = (/** @type {Page} */ page) =>
  page.evaluate(async () => {
    const w = /** @type {any} */ (globalThis);
    const cam = JSON.parse(sessionStorage.getItem('fantasia4x-camera') ?? 'null');
    const worker = (await w.__f4xWorkPins?.stats())?.worker;
    const workerLog = w.__f4xWorkerLog.filter(
      (/** @type {string} */ l) => !l.startsWith('out workPins') && !l.startsWith('in workPins')
    );
    return {
      turn: worker?.turn ?? null,
      cam,
      now: performance.now(),
      date: Date.now(),
      workerLog,
      ...(w.__f4xTraceRandom ? { random: w.__f4xRandomCalls } : {})
    };
  });

const wheel = (
  /** @type {Page} */ page,
  /** @type {number} */ deltaY,
  /** @type {number} */ steps
) =>
  page.evaluate(
    ([deltaY, steps]) => {
      const map = /** @type {HTMLElement} */ (document.querySelector('[aria-label="World map"]'));
      const b = map.getBoundingClientRect();
      for (let i = 0; i < steps; i++)
        map.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY,
            bubbles: true,
            cancelable: true,
            clientX: b.x + b.width / 2,
            clientY: b.y + b.height / 2
          })
        );
    },
    [deltaY, steps]
  );

const comp = await startCompositor((/** @type {string} */ l) => console.log(l));
process.on('exit', () => comp.stop());
const { chromium } = await import(join(TREE, 'node_modules/playwright/index.mjs'));
patchChromium(chromium, {
  chrome: CHROME,
  socket: comp.socket,
  cleanEnv: comp.cleanEnv,
  query: QUERY,
  servedSave: null,
  args: GPU_ARGS
});

/** @type {Scene[]} */
const manifest = [];
const only = process.env.F4X_LOADS?.split(',');
for (const load of LOADS.filter((l) => !only || only.includes(l.name))) {
  const log = logger(load.name);
  const fixture = fixtureFor(load.season);
  const game = await openGame({
    tree: TREE,
    fixture,
    serverLog: join(OUT, `.server-${load.name}.log`),
    log,
    clock: true,
    workPins: true,
    query: QUERY,
    init: [
      keepDrawingBuffer,
      keepWebgpuFrames,
      installRandomStreams,
      logWorker,
      disableAutosaveInit,
      [setCamera, JSON.stringify(CAMERA)]
    ]
  });
  rmSync(fixture, { force: true });
  /** @type {Page} */
  const page = game.page;
  /** @type {string[]} */
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 300)));
  try {
    await setPaused(page, true);
    await waitRendererUp(page);
    await freezeClock(page);
    await page.evaluate((trace) => {
      const w = /** @type {any} */ (globalThis);
      w.__f4xTraceRandom = trace;
      w.__f4xWorkerLogOn = true;
    }, !!process.env.F4X_TRACE_RANDOM);
    await remountRenderer(page, log, load.season);
    await settle(page);
    const gpu = await backendOf(page);
    log(`GPU ${JSON.stringify(gpu)} query ${QUERY || '(none)'}`);
    if (GPU && gpu?.backend !== GPU)
      throw new Error(`asked for ${GPU} but the renderer runs ${gpu?.backend ?? 'nothing'}`);
    for (const [zoom, deltaY, steps] of ZOOMS) {
      if (steps) {
        await wheel(page, deltaY, steps);
        await settle(page);
      }
      await sleep(400);
      const st = await state(page);
      const shot = await readCanvas(page);
      const name = `${load.name}-${zoom}`;
      writeFileSync(join(OUT, `${name}.png`), encodePng(shot.w, shot.h, shot.rgba));
      const sha = createHash('sha256').update(shot.rgba).digest('hex');
      manifest.push({
        scene: name,
        commit: COMMIT,
        dirty: DIRTY,
        w: shot.w,
        h: shot.h,
        sha256: sha,
        ...st
      });
      log(
        `SCENE ${name} ${shot.w}x${shot.h} glCanvases=${shot.canvases} sha256=${sha.slice(0, 16)} ${JSON.stringify(st)}`
      );
    }
    log(`ERRORS ${JSON.stringify(game.errors.slice(0, 5))}`);
  } catch (e) {
    const canvases = await page.evaluate(() =>
      JSON.stringify(
        /** @type {any} */ (globalThis).__f4xGlCanvases.map(
          (/** @type {HTMLCanvasElement} */ c) => [c.isConnected, c.width, c.height]
        )
      )
    );
    log(
      `FAIL ${e instanceof Error ? e.message : String(e)} pageErrors=${JSON.stringify(game.errors.slice(0, 5))} console=${JSON.stringify(consoleErrors.slice(0, 8))} canvases=${canvases}`
    );
    throw e;
  } finally {
    await game.close();
  }
}

const bySha = (/** @type {string} */ n) => manifest.find((m) => m.scene === n)?.sha256;
for (const [z] of ZOOMS)
  if (
    bySha(`painted-spring-${z}`) &&
    bySha(`painted-spring-${z}`) === bySha(`painted-winter-${z}`)
  ) {
    console.error(
      `FAIL painted-spring-${z} and painted-winter-${z} are identical: the season did not reach the renderer`
    );
    process.exitCode = 1;
  }
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(
  join(OUT, 'SHA256SUMS'),
  manifest.map((m) => `${m.sha256}  ${m.scene}.rgba`).join('\n') + '\n'
);
writeFileSync(join(OUT, 'COMMIT'), `${COMMIT}${DIRTY ? ' dirty' : ''}\n`);
console.log(`wrote ${manifest.length} scenes of ${COMMIT} to ${OUT}`);
