import { openSync, writeSync, closeSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { backendOf, openGpuGame, sleep } from './session.mjs';
import { webgpuRecorder, webgpuTimer } from './webgpu-recorder.mjs';

const [TREE, LABEL, OUT_DIR, MODE = 'capture', SECONDS = '8'] = process.argv.slice(2);
const USAGE =
  'usage: CHROME=<chromium binary> node tools/gpu/native-capture.mjs <app tree> <label> <out dir> [capture|time] [seconds per cell]';
const PASSES = ['snow', 'resources', 'buildings', 'items', 'creatures', 'tall-resources', 'overlay', 'effects', 'glsl-only'];
const SETS = { terrain: PASSES, nothing: ['terrain', ...PASSES] };
const ZOOMS = [
  ['close', -120, 60],
  ['default', 120, 20]
];
const VIEW = { width: 1920, height: 1080 };
const CHUNK = 8 << 20;
const scenario = 'large-wilderness';
const sets = (process.env.F4X_SETS ?? (MODE === 'capture' ? 'terrain' : 'terrain;nothing')).split(';');

const shaderFiles = () => {
  const dir = join(TREE, 'src/lib/webgl/shaders');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.wgsl'))
    .map((f) => [f, readFileSync(join(dir, f), 'utf8')])
    .sort((a, b) => b[1].length - a[1].length);
};

function segments(code, files) {
  const hits = [];
  for (const [name, text] of files) {
    let at = code.indexOf(text);
    while (at >= 0) {
      if (!hits.some((h) => at < h.end && at + text.length > h.start)) hits.push({ name, start: at, end: at + text.length });
      at = code.indexOf(text, at + 1);
    }
  }
  hits.sort((a, b) => a.start - b.start);
  const out = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start > pos) out.push({ text: code.slice(pos, h.start) });
    out.push({ file: h.name });
    pos = h.end;
  }
  if (pos < code.length) out.push({ text: code.slice(pos) });
  return out;
}

const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
const fixed = (n) => Math.round(n * 1000) / 1000;

async function capture(page, log, zoom) {
  await page.evaluate(() => window.__nc.record(4));
  const manifest = JSON.parse(await page.evaluate(() => window.__nc.manifest()));
  const files = shaderFiles();
  const blobs = [];
  for (const o of manifest.objects) {
    if (o.kind === 'module') {
      o.segments = segments(o.code, files);
      o.files = o.segments.filter((s) => s.file).map((s) => s.file);
    }
    if (o.kind === 'buffer') blobs.push({ obj: o, write: null, length: o.size });
    if (o.kind === 'texture' && !o.canvas) for (const w of o.writes) blobs.push({ obj: w, owner: o.id, write: w.index, length: w.length });
  }
  const path = join(OUT_DIR, `${LABEL}-${zoom}.f4xc`);
  let offset = 0;
  for (const b of blobs) {
    b.obj.blob = [offset, b.length];
    offset += Math.ceil(b.length / 8) * 8;
  }
  const head = Buffer.from(JSON.stringify(manifest));
  const fd = openSync(path, 'w');
  const pre = Buffer.alloc(16);
  pre.write('F4XC', 0);
  pre.writeUInt32LE(1, 4);
  pre.writeUInt32LE(head.length, 8);
  writeSync(fd, pre);
  writeSync(fd, head);
  writeSync(fd, Buffer.alloc((8 - ((16 + head.length) % 8)) % 8));
  for (const b of blobs) {
    const id = b.write === null ? b.obj.id : b.owner;
    for (let s = 0; s < b.length; s += CHUNK) {
      const part = await page.evaluate(([i, w, st, len]) => window.__nc.chunk(i, w, st, len), [id, b.write, s, CHUNK]);
      writeSync(fd, Buffer.from(part, 'base64'));
    }
    writeSync(fd, Buffer.alloc(Math.ceil(b.length / 8) * 8 - b.length));
  }
  closeSync(fd);
  const draws = manifest.ops.filter((o) => o.op === 'draw').length;
  const byPipeline = {};
  let pipe = null;
  const labels = new Map(manifest.objects.map((o) => [o.id, o.label]));
  for (const o of manifest.ops) {
    if (o.op === 'setPipeline') pipe = labels.get(o.pipeline);
    if (o.op === 'draw') byPipeline[pipe] = (byPipeline[pipe] ?? 0) + o.vertexCount * o.instanceCount;
  }
  log(`CAPTURE ${JSON.stringify({ zoom, path, bytes: offset, canvas: manifest.canvas, draws, passes: manifest.ops.filter((o) => o.op === 'beginPass').map((o) => o.label), verticesByPipeline: byPipeline })}`);
}

async function time(page, log, zoom, set) {
  const out = await page.evaluate(async (ms) => {
    const T = window.__ncTimer;
    T.samples = [];
    T.enabled = true;
    const gaps = [];
    let last = performance.now();
    let id;
    const f = (t) => {
      gaps.push(t - last);
      last = t;
      id = requestAnimationFrame(f);
    };
    id = requestAnimationFrame(f);
    await new Promise((r) => setTimeout(r, ms));
    cancelAnimationFrame(id);
    T.enabled = false;
    return { gaps: gaps.slice(1), samples: T.samples, supported: T.supported };
  }, Number(SECONDS) * 1000);
  const gpu = out.samples.map((s) => s.reduce((a, p) => a + p.ms, 0)).sort((a, b) => a - b);
  const perPass = {};
  for (const s of out.samples) for (const p of s) (perPass[p.label] ??= []).push(p.ms);
  const gaps = [...out.gaps].sort((a, b) => a - b);
  const row = {
    set,
    zoom,
    frames: gaps.length,
    timestamps: out.supported,
    frameP50Ms: fixed(quantile(gaps, 0.5)),
    frameP95Ms: fixed(quantile(gaps, 0.95)),
    gpuP50Ms: fixed(quantile(gpu, 0.5)),
    gpuP95Ms: fixed(quantile(gpu, 0.95)),
    passP50Ms: Object.fromEntries(Object.entries(perPass).map(([k, v]) => [k, fixed(quantile(v.sort((a, b) => a - b), 0.5))]))
  };
  log(`ROW ${JSON.stringify(row)}`);
  return row;
}

const { watchScenarioLoad, waitForScenario } = await import(`${TREE}/tools/work-pins/browser-session.mjs`);
const rows = [];
for (const set of sets) {
  const skip = SETS[set];
  if (!skip) throw new Error(`unknown set ${set}`);
  const q = new URLSearchParams({ scenario, gpu: 'webgpu', skip: skip.join(',') });
  const { page, log, tile, wheel, setPaused, finish } = await openGpuGame({
    tree: TREE,
    label: `${LABEL}-${set}`,
    outDir: OUT_DIR,
    usage: USAGE,
    init: [MODE === 'capture' ? webgpuRecorder : webgpuTimer, watchScenarioLoad(scenario)],
    args: ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--enable-webgpu-developer-features'],
    query: `?${q}`
  });
  try {
    await waitForScenario(page, scenario);
    await page.setViewportSize(VIEW);
    log(`GPU ${JSON.stringify(await backendOf(page))}`);
    for (const [zoom, deltaY, steps] of ZOOMS) {
      await setPaused(true);
      await wheel(deltaY, steps);
      await sleep(3000);
      log(`ZOOM ${zoom} tilePx ${await tile()}`);
      if (MODE === 'capture') await capture(page, log, zoom);
      else rows.push(await time(page, log, zoom, set));
    }
  } catch (e) {
    log(`FAIL ${e instanceof Error ? e.stack : e}`);
    process.exitCode = 1;
  }
  await finish();
}
if (rows.length) writeFileSync(join(OUT_DIR, `${LABEL}-browser-time.json`), JSON.stringify(rows, null, 1));
