import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { cpus, hostname, loadavg, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const [SHELL, APP_TREE, OUTPUT = 'display', SECONDS = '6', ROUNDS = '3'] = process.argv.slice(2);
const HEADLESS_HZ = OUTPUT === 'display' ? null : Number(OUTPUT);
const WINDOW = { width: 1440, height: 870 };
const DEV_PORT = 5273;
const LISTENER_PORT = 5274;
const ORIGIN = `http://127.0.0.1:${DEV_PORT}`;
const LISTENER = `http://127.0.0.1:${LISTENER_PORT}`;
const FIXTURE = 'tools/work-pins/fixtures/dev-save.json.gz';
const MAX_ATTEMPTS = 3;
const RUN_TIMEOUT_MS = 40 * 60 * 1000;
const UNIT = `f4x-bench-${SHELL}`;
const UNCAPPED = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];
const ELECTRON = [
  join(HERE, '../node_modules/electron/dist/electron'),
  join(HERE, 'electron-main.js'),
  `--user-data-dir=${join(tmpdir(), UNIT + '-profile')}`,
  '--password-store=basic'
];
const SHELLS = {
  electron: ELECTRON,
  'electron-uncapped': [...ELECTRON, ...UNCAPPED],
  tauri: [join(HERE, 'tauri/src-tauri/target/release/app')]
};
const ZOOMS = [
  ['whole map', 0, null],
  ['16 px', 7, 16],
  ['64 px', 45, 64]
];
const PASSES = [
  ['1x', ['run 1x', 'paused pan'], Number(SECONDS)],
  ['4x', ['run 4x'], Math.min(Number(SECONDS), 5)]
];
const SEGMENTS = PASSES.flatMap(([pass, kinds, seconds]) =>
  ZOOMS.map(([zoom, wheelIn, tile]) => ({ name: `${pass} | ${zoom}`, zoom, wheelIn, tile, kinds, seconds }))
);

if (!SHELLS[SHELL] || !APP_TREE) {
  console.error(`usage: node run.mjs <${Object.keys(SHELLS).join('|')}> <tree serving the game> [display|<headless output Hz>] [seconds] [rounds]`);
  process.exit(2);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const log = (line) => process.stdout.write(`[${SHELL}] ${line}\n`);
const sh = (file, args) => {
  try {
    return execFileSync(file, args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};
const median = (xs) => {
  const a = [...xs].sort((p, q) => p - q);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};

const OWN_CGROUP = '/sys/fs/cgroup' + readFileSync('/proc/self/cgroup', 'utf8').trim().split('::')[1];
const CGROUPS = new Set([OWN_CGROUP, join(dirname(OWN_CGROUP), `${UNIT}.scope`)]);
const COMPOSITOR_UNIT = 'f4x-bench-compositor';
const COMPOSITOR_CGROUP = join(dirname(OWN_CGROUP), `${COMPOSITOR_UNIT}.scope`);
const cgroupSeconds = (dir) => {
  try {
    return Number(/usage_usec (\d+)/.exec(readFileSync(join(dir, 'cpu.stat'), 'utf8'))[1]) / 1e6;
  } catch {
    return 0;
  }
};
function cpuSample() {
  const f = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const busy = f.reduce((a, b) => a + b, 0) - f[3] - f[4];
  return {
    t: Date.now() / 1000,
    busy: busy / 100,
    own: [...CGROUPS].reduce((sum, dir) => sum + cgroupSeconds(dir), 0),
    compositor: cgroupSeconds(COMPOSITOR_CGROUP)
  };
}
function cpuSince(a) {
  const b = cpuSample();
  const dt = b.t - a.t;
  const total = (b.busy - a.busy) / dt;
  const own = (b.own - a.own) / dt;
  const compositor = (b.compositor - a.compositor) / dt;
  return {
    totalCores: +total.toFixed(2),
    ownCores: +own.toFixed(2),
    compositorCores: +compositor.toFixed(2),
    bgCores: +Math.max(0, total - own - compositor).toFixed(2)
  };
}

const sessionEnv = Object.fromEntries(
  sh('systemctl', ['--user', 'show-environment'])
    .split('\n')
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);
const instances = () => JSON.parse(execFileSync('hyprctl', ['instances', '-j'], { encoding: 'utf8' }));
const HEADLESS_CONFIG = `monitor = , 1920x1080@60, auto, 1
animations {
    enabled = false
}
decoration {
    blur {
        enabled = false
    }
    shadow {
        enabled = false
    }
}
misc {
    disable_hyprland_logo = true
    disable_splash_rendering = true
}
xwayland {
    enabled = false
}
ecosystem {
    no_update_news = true
    no_donation_nag = true
}
`;

async function startHeadlessCompositor() {
  const config = join(tmpdir(), `${COMPOSITOR_UNIT}.conf`);
  writeFileSync(config, HEADLESS_CONFIG);
  const before = new Set(instances().map((i) => i.instance));
  const { HYPRLAND_INSTANCE_SIGNATURE: _signature, HYPRLAND_CONFIG: _config, DISPLAY: _display, ...env } = process.env;
  spawn(
    'systemd-run',
    ['--user', '--scope', '--quiet', '--collect', `--unit=${COMPOSITOR_UNIT}`, '--slice=app.slice', '--', 'Hyprland', '-c', config],
    { env: { ...env, WAYLAND_DISPLAY: sessionEnv.WAYLAND_DISPLAY }, detached: true, stdio: 'ignore' }
  ).unref();
  let instance;
  for (let i = 0; i < 60 && !(instance = instances().find((n) => !before.has(n.instance))); i++) await sleep(500);
  if (!instance) throw new Error('the headless compositor did not start');
  return instance.instance;
}

const HYPR_INSTANCE = HEADLESS_HZ ? await startHeadlessCompositor() : sessionEnv.HYPRLAND_INSTANCE_SIGNATURE;
const hyprEnv = { ...process.env, HYPRLAND_INSTANCE_SIGNATURE: HYPR_INSTANCE };
const hyprctl = (...args) => execFileSync('hyprctl', args, { encoding: 'utf8', env: hyprEnv }).trim();
const monitors = () => JSON.parse(hyprctl('-j', 'monitors'));
if (HEADLESS_HZ) {
  const nested = monitors().map((m) => m.name);
  hyprctl('output', 'create', 'headless');
  for (const name of nested) hyprctl('output', 'remove', name);
  const output = monitors()[0].name;
  hyprctl('keyword', 'monitor', `${output},1920x1080@${HEADLESS_HZ},0x0,1`);
  await sleep(1000);
}
const LUA_CONFIG = !hyprctl('eval', 'return 1').includes('only supported with the lua');
const windows = () => JSON.parse(hyprctl('-j', 'clients'));
const WINDOWS_BEFORE = new Set(windows().map((c) => c.address));
const startedByBench = (pid) => {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(HERE);
  } catch {
    return false;
  }
};
const shellWindow = () => windows().find((c) => !WINDOWS_BEFORE.has(c.address) && startedByBench(c.pid));

function gpuSecondsByProcess() {
  const seen = new Set();
  const byProcess = {};
  for (const dir of CGROUPS) {
    if (dir === OWN_CGROUP) continue;
    let pids = [];
    try {
      pids = readFileSync(join(dir, 'cgroup.procs'), 'utf8').trim().split('\n').filter(Boolean);
    } catch {
      continue;
    }
    for (const pid of pids) {
      try {
        const name = readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
        for (const fd of readdirSync(`/proc/${pid}/fdinfo`)) {
          const info = readFileSync(`/proc/${pid}/fdinfo/${fd}`, 'utf8');
          const client = /drm-client-id:\s*(\d+)/.exec(info)?.[1];
          const gfx = /drm-engine-gfx:\s*(\d+) ns/.exec(info)?.[1];
          if (!client || !gfx || seen.has(client)) continue;
          seen.add(client);
          byProcess[name] = +((byProcess[name] ?? 0) + Number(gfx) / 1e9).toFixed(2);
        }
      } catch {
        continue;
      }
    }
  }
  return byProcess;
}

async function startDevServer() {
  const out = createWriteStream(join(tmpdir(), `${UNIT}.dev-server.log`));
  const child = spawn(join(APP_TREE, 'dev.sh'), ['--browser', '--port', String(DEV_PORT)], {
    cwd: APP_TREE,
    detached: true,
    env: { ...process.env, GIT_DIR: '/dev/null', CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  for (let i = 0; i < 600; i++) {
    if (child.exitCode !== null) throw new Error(`dev server exited ${child.exitCode}`);
    try {
      if ((await fetch(`${ORIGIN}/`)).ok) return child;
    } catch {
      await sleep(500);
    }
  }
  throw new Error('dev server never answered');
}

function launchShell(recorderFile) {
  const launcher = join(tmpdir(), `${UNIT}.launch.sh`);
  const env = {
    SPIKE_URL: ORIGIN,
    F4X_BENCH_RECORDER: recorderFile,
    F4X_BENCH_WIDTH: WINDOW.width,
    F4X_BENCH_HEIGHT: WINDOW.height
  };
  const exports = Object.entries(env).map(([k, v]) => `export ${k}='${v}'`);
  const scope = `systemd-run --user --scope --quiet --collect --unit=${UNIT} --slice=app.slice -p CPUWeight=100 --`;
  const command = SHELLS[SHELL].map((a) => `'${a}'`).join(' ');
  writeFileSync(
    launcher,
    ['#!/usr/bin/env bash', ...exports, 'unset ELECTRON_RUN_AS_NODE ELECTRON_NO_ATTACH_CONSOLE', `exec ${scope} ${command}`, ''].join('\n'),
    { mode: 0o755 }
  );
  if (LUA_CONFIG) hyprctl('eval', `hl.exec_cmd("${launcher}")`);
  else hyprctl('dispatch', 'exec', launcher);
}

async function placeWindow() {
  let win;
  for (let i = 0; i < 120 && !(win = shellWindow()); i++) await sleep(500);
  if (!win) throw new Error('the shell opened no window');
  const target = `address:${win.address}`;
  CGROUPS.add('/sys/fs/cgroup' + readFileSync(`/proc/${win.pid}/cgroup`, 'utf8').trim().split('::')[1]);
  const size = `${WINDOW.width} ${WINDOW.height}`;
  if (LUA_CONFIG) {
    if (!win.floating) hyprctl('eval', `hl.dispatch(hl.dsp.window.float({ action = "enable", window = "${target}" }))`);
    hyprctl('eval', `hl.dispatch(hl.dsp.window.resize({ x = ${WINDOW.width}, y = ${WINDOW.height}, window = "${target}" }))`);
  } else {
    if (!win.floating) hyprctl('dispatch', 'setfloating', target);
    hyprctl('dispatch', 'resizewindowpixel', `exact ${size},${target}`);
  }
  await sleep(1000);
  win = shellWindow();
  log(`WINDOW ${JSON.stringify({ cgroups: [...CGROUPS].map((c) => c.split('/').pop()),  class: win.class, title: win.title, size: win.size, at: win.at, floating: win.floating, xwayland: win.xwayland, fullscreen: win.fullscreen, workspace: win.workspace?.id, pid: win.pid })}`);
}

const monitor = monitors().find((m) => m.focused) ?? monitors()[0];
const rest0 = cpuSample();
await sleep(10000);
const machine = {
  host: hostname(),
  cpu: cpus()[0].model.trim(),
  threads: cpus().length,
  restBefore: cpuSince(rest0),
  load1: +loadavg()[0].toFixed(2),
  governor: sh('cat', ['/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor']),
  monitor: { name: monitor.name, mode: `${monitor.width}x${monitor.height}`, refreshHz: monitor.refreshRate, scale: monitor.scale, vrr: monitor.vrr },
  output: HEADLESS_HZ ? 'a headless output of a nested Hyprland' : 'the display',
  hyprland: sh('Hyprland', ['--version']).split('\n')[0],
  shell: SHELL,
  command: SHELLS[SHELL],
  window: WINDOW,
  seconds: Number(SECONDS),
  rounds: Number(ROUNDS),
  tree: sh('git', ['-C', APP_TREE, 'rev-parse', '--short', 'HEAD']),
  benchTree: sh('git', ['-C', HERE, 'rev-parse', '--short', 'HEAD'])
};
log(`MACHINE ${JSON.stringify(machine)}`);

const save = gunzipSync(readFileSync(resolve(APP_TREE, FIXTURE)));
const recorderFile = join(tmpdir(), `${UNIT}.recorder.js`);
const config = { origin: ORIGIN, listener: LISTENER, window: WINDOW, rounds: Number(ROUNDS), refreshHz: monitor.refreshRate };
writeFileSync(recorderFile, `window.__F4X_BENCH_CONFIG = ${JSON.stringify(config)};\n${readFileSync(join(HERE, 'recorder.js'), 'utf8')}`);

const result = { machine, rows: [], failures: [] };
const state = { index: 0, step: 'seed', attempts: 0 };
let mark = cpuSample();
let finish;
const finished = new Promise((done) => (finish = done));

function advance() {
  state.index += 1;
  state.attempts = 0;
  state.step = state.index < SEGMENTS.length ? 'seed' : 'done';
  if (state.step === 'done') setTimeout(finish, 500);
}

function recordSegment({ rows, window }) {
  result.window = window;
  for (const row of rows) {
    const m = (k) => median(row.runs.map((r) => r[k]));
    const list = (k) => row.runs.map((r) => r[k]).join(', ');
    const summary = { ...row, fps: m('fps'), tps: m('tps'), p95Ms: m('p95Ms'), p99Ms: m('p99Ms'), maxMs: Math.max(...row.runs.map((r) => r.maxMs)) };
    result.rows.push(summary);
    log(
      `${row.segment} (tile ${row.tilePx}px) | ${row.kind}: fps ${summary.fps} [${list('fps')}] tps ${summary.tps} [${list('tps')}] | ` +
        `frame ms p50 [${list('p50Ms')}] p95 [${list('p95Ms')}] p99 [${list('p99Ms')}] max [${list('maxMs')}] | ` +
        `frames over 1.5x [${list('over1_5')}] over 3x [${list('over3')}] of [${list('frames')}] | ` +
        `cores: shell ${m('ownCores')} [${list('ownCores')}], compositor ${m('compositorCores')}, background ${m('bgCores')} [${list('bgCores')}] | turn ${row.runs.at(-1).turn}`
    );
  }
}

const routes = {
  '/state': () => ({ step: state.step, segment: SEGMENTS[state.index] ?? null }),
  '/seeded': (body) => {
    state.step = 'run';
    result.renderer = body.renderer;
    log(`seeded for ${SEGMENTS[state.index].name}, WebGL2 renderer: ${body.renderer}`);
    return {};
  },
  '/segment': (body) => {
    recordSegment(body);
    advance();
    return {};
  },
  '/fail': (body) => {
    state.attempts += 1;
    const name = SEGMENTS[state.index]?.name;
    log(`${name}: attempt ${state.attempts} failed: ${body.message.replace(/\n\s*/g, ' | ')}`);
    result.failures.push({ segment: name, attempt: state.attempts, message: body.message });
    if (state.attempts >= MAX_ATTEMPTS) advance();
    else state.step = 'seed';
    return {};
  },
  '/log': (body) => {
    log(body.line);
    return {};
  },
  '/cpu-mark': () => {
    mark = cpuSample();
    return {};
  },
  '/cpu-since': () => cpuSince(mark)
};

const listener = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/save.json') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(save);
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const route = routes[req.url];
    if (!route) {
      res.statusCode = 404;
      return res.end('{}');
    }
    const text = Buffer.concat(chunks).toString();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(route(text ? JSON.parse(text) : {})));
  });
});
await new Promise((done) => listener.listen(LISTENER_PORT, '127.0.0.1', done));

const server = await startDevServer();
log(`dev server on ${ORIGIN}, listener on ${LISTENER}`);
let exitCode = 0;
try {
  launchShell(recorderFile);
  await placeWindow();
  const timedOut = await Promise.race([finished.then(() => false), sleep(RUN_TIMEOUT_MS).then(() => true)]);
  log(`GPU seconds by process, from fdinfo drm-engine-gfx: ${JSON.stringify(gpuSecondsByProcess())}`);
  if (timedOut) {
    log(`timed out after ${RUN_TIMEOUT_MS / 60000} min at ${SEGMENTS[state.index]?.name} (${state.step})`);
    exitCode = 1;
  }
} catch (e) {
  log(`failed: ${e.message}`);
  exitCode = 1;
} finally {
  for (const win of windows().filter((c) => !WINDOWS_BEFORE.has(c.address) && startedByBench(c.pid))) {
    log(`closing ${win.class} "${win.title}"`);
    const target = `address:${win.address}`;
    try {
      if (LUA_CONFIG) hyprctl('dispatch', `hl.dsp.window.close({ window = "${target}" })`);
      else hyprctl('dispatch', 'closewindow', target);
    } catch (e) {
      log(`could not close it: ${e.message}`);
    }
  }
  await sleep(2000);
  for (const dir of CGROUPS) if (dir !== OWN_CGROUP) sh('systemctl', ['--user', 'stop', dir.split('/').pop()]);
  if (HEADLESS_HZ) {
    try {
      hyprctl('dispatch', 'exit');
    } catch (e) {
      log(`could not stop the headless compositor: ${e.message}`);
    }
    await sleep(1000);
    sh('systemctl', ['--user', 'stop', `${COMPOSITOR_UNIT}.scope`]);
  }
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
  listener.close();
}
console.log('RESULT ' + JSON.stringify(result));
process.exit(exitCode);
