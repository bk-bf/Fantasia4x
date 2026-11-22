---
name: desktop-bench
description: Measure Fantasia4x rendering and frame-time performance on the desktop machine's real GPU — zoom and pan stutters, frame drops, FPS or TPS that feel worse, "is this build slower than that one". Use whenever a perf complaint needs numbers from a real browser with a real GPU, before blaming or fixing a renderer change, and to compare two builds or bisect a regression across commits.
---

# Benchmarking on the desktop

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
  The desktop holds 60 FPS at its vsync cap, so it shows a cost only when it breaks that cap.
- Both share `tools/gpu/session.mjs`, which starts the nested compositor and the browser.
- `tools/gpu/stall.mjs <file.cpuprofile>...` prints the longest busy stretch of a profile with
  its self and inclusive time per function.
- The steady-state shell bench (frame times per zoom level at 1x, 4x and paused pan, Electron
  against Tauri) lives on branch `test/shell-and-renderer-bench` in `tools/dev-shell/bench/`
  (`run.mjs`, `recorder.js`). Its recorder clicks the old HUD; check its selectors against the
  build before using it.

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
  -E F4X_QUERY='?painted=1&blend=1' \
  systemd-inhibit --what=idle:sleep --why=zoom-bench \
  node $T/tools/gpu/zoom-out.mjs $T <label> /tmp/f4x-zoom 3
```

- Run it under `systemd-run`: a process started over ssh dies with the ssh session.
- `systemd-inhibit` keeps the session from idling or sleeping mid-run.
- `F4X_QUERY='?painted=1&blend=1'` is the painted renderer, which `F4X_PAINTED=1 ./launch.sh`
  opens; leave it out to measure the glyph renderer.
- Alternate the builds (A B A B) and run three rounds each, so a slow minute on the machine shows
  up as spread rather than as a difference.
- Read `ROW` lines from the log: `maxMs` is the longest frame, `stallMs` the sum of frames over
  50 ms, `over100` the count over 100 ms.

## Reporting

State the machine, GPU, browser build, renderer, fixture, the commits compared and the rounds,
and give each build's range, not one number. A CPU profile whose longest busy stretch is far
shorter than the longest frame means the rest is native or GPU time, which needs a trace rather
than a CPU profile.
