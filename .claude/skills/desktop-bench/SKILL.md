---
name: desktop-bench
description: Measure Fantasia4x rendering and frame-time performance on the desktop machine's real GPU — zoom and pan stutters, frame drops, FPS or TPS that feel worse, "is this build slower than that one". Use whenever a perf complaint needs numbers from a real browser with a real GPU, before blaming or fixing a renderer change, and to compare two builds or bisect a regression across commits.
---

# Benchmarking on the desktop

The order to investigate a perf complaint in, and the traps found so far, are in the
`perf-investigation` skill; this one holds the commands.

The desktop (`ssh desktop`, CachyOS, Hyprland, AMD RX 5700 XT, 16 threads) is the machine for
GPU-bound measurements. ubuntuserver has no GPU and the laptop runs the owner's own session.
Tell the owner before starting if the desktop is off; he turns it on.

## What runs where

- `tools/gpu/zoom-out.mjs` loads the dev-save fixture, zooms to the closest tile size, then wheels
  out to the whole map at the recorder's pace (45 steps, 60 ms apart). It records every frame gap
  and a CPU profile per round, paused and running at 1x, and writes `<label>-results.json` and one
  `.cpuprofile` per round.
- `tools/gpu/steady.mjs` holds the same save close up, at the default zoom and zoomed out, each
  paused, at 1x and at 4x, and reports FPS, frame-time p50/p95/p99, frames over 33 and 50 ms, and
  TPS counted from the worker's turn. Same arguments as `zoom-out.mjs`, with seconds per cell last.
  The desktop holds 60 FPS at its vsync cap, so FPS shows a cost only when it breaks that cap;
  `taskMs`, `scriptMs`, `layoutMs` and `styleMs` are main-thread milliseconds per second of the
  cell and show it under the cap, and `nodes` is the DOM node count. The far cells come after
  about a minute of play, so creatures have gone to sleep and the map has aged.
  `F4X_PROFILE=1` also saves a CPU profile per cell; `stall.mjs --whole <profile>` ranks the whole
  cell instead of its longest busy stretch, which is the read for a steady low frame rate.
- `tools/gpu/frame-cost.mjs` is the heavyweight absolute bench, for troubleshooting a slowdown
  rather than gating one. It loads `large-wilderness` (750x750, seed 4242, about 1170 creatures)
  through `?scenario=`, or the save in `F4X_FIXTURE` when that is set, with vsync and the frame-rate
  limit off, and holds three zooms by paused, 1x, 4x and max speed (the worker told to run as fast
  as it can). Each cell prints FPS, frame-time p50, p95 and longest in ms, main-thread, script and
  layout-plus-style ms per frame, TPS and DOM nodes, and `<label>-frame-cost.json` keeps the rows.
  `F4X_SKIP` lists the pass sets to run, `;` between sets and `,` inside one, `none` for every pass
  on; each set is its own page load, since `src/lib/webgl/passes.ts` reads `?skip=` once, and only
  in a dev build. The passes are `gl` (every GL draw), `terrain`, `snow`, `resources`, `buildings`,
  `items`, `creatures`, `tall-resources`, `overlay` (the creature and item overlay update) and
  `effects` (the world-effects layer). A pass's cost is the baseline's row minus the row with it
  skipped. `F4X_CAPPED=1` keeps vsync on. It runs no CPU profiler.
- All of them share `tools/gpu/session.mjs`, which starts the nested compositor and the browser.
  The compositor's unit is named after the probe's process, so two probes at once no longer stop
  each other's compositor; still run one at a time when the numbers matter, since they share
  the GPU.
  `F4X_FIXTURE=<save.json.gz>` loads another save than the CI fixture, such as one copied out of
  the owner's game; the probe serves it from the tree's `static/` for the run, since a save past
  about 100 MB closes the page when Playwright hands it over directly, and `F4X_HARNESS=<tree>` borrows the harness and Playwright of another tree for
  a build too old to have them, such as `main`.
- Starting V8's CPU profiler costs one frame of about 500 ms. `zoom-out.mjs` starts it right as
  the measured zoom begins, so its first frame per round is the profiler, not the game; read its
  longest frame from a run with no profile, or from the second-longest frame. Start a profiler
  well before the stretch it measures, or leave it off.
- `tools/gpu/stall.mjs <file.cpuprofile>...` prints the longest busy stretch of a profile with
  its self and inclusive time per function.
- The steady-state shell bench (frame times per zoom level at 1x, 4x and paused pan, Electron
  against Tauri) lives on branch `test/shell-and-renderer-bench` in `tools/dev-shell/bench/`
  (`run.mjs`, `recorder.js`). Its recorder clicks the old HUD; check its selectors against the
  build before using it.

## Measuring the owner's laptop

When a cost shows on the laptop and not on the desktop, record the laptop's own game rather than
running anything there. Nothing runs on the laptop but the game the owner starts.

1. The owner launches the build with its debug port on the host network:
   `./launch.sh --electron --net-host` (the default sandbox hides port 9222).
2. From ubuntuserver, tunnel to it and attach:

```bash
systemd-run --user --collect --unit=f4x-laptop-tunnel ssh -N -L 9333:127.0.0.1:9222 laptop
node tools/gpu/attach-trace.mjs http://127.0.0.1:9333 /tmp/f4x-laptop 3
systemctl --user stop f4x-laptop-tunnel
```

- It zooms the owner's camera in and out for about a minute; tell him before it starts, and to
  keep his hands off the window while it runs.
- `ENV` names the GPU, window size and pixel ratio, `ROW` gives the frame gaps per round, and
  `FRAME` the worst frames by thread. `CommandBufferProxyImpl::WaitForGetOffset` on the renderer
  main thread is time spent waiting for the GPU process; the GPU process's own rows say on what.
- Read the round profiles with `stall.mjs` for the JavaScript side.
- `.debug/perf.log` in the laptop checkout opens each session with a `session` line naming the
  build, GPU, window and map, and stamps every line with the time; match a complaint to its
  session there before measuring.

## Setting up a build

On the desktop, every build under test gets its own worktree inside the repo, its own install
and its own WASM build:

```bash
export PATH="$HOME/.npm-global/bin:$HOME/.cargo/bin:$PATH"
R=~/Documents/Projects/Fantasia4x; T=$R/.claude/worktrees/bench-<name>
git -C $R fetch origin && git -C $R worktree add --detach $T <commit>
cd $T && CI=true pnpm install --frozen-lockfile && pnpm add:wasm && pnpm add:wasm:sim
CI=true pnpm exec svelte-kit sync
```

- `pnpm` is in `~/.npm-global/bin`, not on the default `PATH`.
- Never symlink `node_modules` from another checkout: `dev.sh` runs `pnpm install`, which rewrites
  the linked checkout's packages to point into the worktree.
- The worktree must sit inside the repo; Vite refuses to serve a `node_modules` outside its root.
- Build the WASM fresh in every worktree. A build left over from another commit can lack
  exports the TypeScript calls, and the worker then throws on its first path search.

## Running

Headless Chromium falls back to SwiftShader here. The probe starts a nested Hyprland with a
headless 1920x1080@60 output and runs Chromium headful inside it, so the real GPU renders and
nothing appears on the owner's screen. Check that the log's `renderer` line names the AMD card.

Playwright cannot download its own browser on CachyOS; point `CHROME` at the one that is cached:

```bash
CH=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome | tail -1)
systemd-run --user --collect --unit=f4x-zoom -E PATH="$PATH" -E CHROME="$CH" \
  systemd-inhibit --what=idle:sleep --why=zoom-bench \
  node $T/tools/gpu/zoom-out.mjs $T <label> /tmp/f4x-zoom 3
```

- Run it under `systemd-run`: a process started over ssh dies with the ssh session.
- `systemd-inhibit` keeps the session from idling or sleeping mid-run.
- With no `F4X_QUERY` the probe measures what `./launch.sh` opens, which `readPaintedFlag` and
  `readGroundBlendFlag` in the build's `src/lib/webgl/painted/flag.ts` decide: the painted renderer
  with the ground blend where both default on. `-E F4X_QUERY='?painted=0'` measures the glyph
  renderer there, and `?blend=0` the painted one without the blend.
- A build whose `readPaintedFlag` is on only for `?painted=1`, such as `dev`, is glyph with no
  query. Comparing one against a build that defaults on, give both
  `-E F4X_QUERY='?painted=1&blend=1'`, which is painted with the blend on either.
- The absolute bench, every pass on and with the GL draw off:

```bash
systemd-run --user --collect --unit=f4x-frame-cost -E PATH="$PATH" -E CHROME="$CH" \
  -E F4X_SKIP='none;gl;terrain;effects' \
  systemd-inhibit --what=idle:sleep --why=frame-cost \
  node $T/tools/gpu/frame-cost.mjs $T <label> /tmp/f4x-frame-cost 8
```

- Alternate the builds (A B A B) and run three rounds each, so a slow minute on the machine shows
  up as spread rather than as a difference.
- Read `ROW` lines from the log: `maxMs` is the longest frame, `stallMs` the sum of frames over
  50 ms, `over100` the count over 100 ms, `pausedShare` the share of the round's time the game sat
  paused, and `worstPaused` whether the longest frame fell in a pause. A running row with a
  `pausedShare` above 0 was paused part of the time, by auto-pause or by hand; never report it
  as running.

## Reporting

State the machine, GPU, browser build, renderer, fixture, the commits compared and the rounds,
and give each build's range, not one number. A CPU profile whose longest busy stretch is far
shorter than the longest frame means the rest is native or GPU time, which needs a trace rather
than a CPU profile.
