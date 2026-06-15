# desktop-spike — cross-engine TPS reading (DISTRIBUTION Phase A)

Throwaway wrappers to answer one question the ENGINE-PERFORMANCE work can't answer from Zen alone:
**does the ~200 TPS @4× survive the JS engine the game actually ships on?**

You optimise in Zen (Firefox / **SpiderMonkey**), but distribution is Electron or Tauri:

| Wrapper     | Engine on Linux        | Engine on Windows     | Engine on macOS       |
| ----------- | ---------------------- | --------------------- | --------------------- |
| **Electron**| V8 (Chromium)          | V8 (Chromium)         | V8 (Chromium)         |
| **Tauri**   | **WebKitGTK / JSC**    | V8 (WebView2)         | **WKWebView / JSC**   |

So Electron = one predictable engine everywhere; Tauri = the system webview, which means **JSC on
Linux/Mac** — the wildcard nobody profiles on. These two shells let you read TPS on both.

Both shells load the **running dev server** (`http://localhost:5173`) — the webview runs the sim in
its own engine regardless of where the HTML came from, so this is a valid reading **without** the
adapter-static migration (that's DISTRIBUTION Phase B, kept separate on purpose).

## Read-out

The header controls bar shows a permanent **`NNFPS · NNTPS`** counter (measured from the turn
counter — engine-agnostic). Just read it. No flags, no console.

> Numbers are **dev-mode** (unminified) — conservative; a production build will be ≥ this. What
> matters here is the **relative** engine comparison and whether any engine hits a cliff, not the
> absolute value. Compare against your Zen dev-server number for the same `--profiler-autorun` scene.

## Run

One command from the repo root — `launch.sh` starts a single main dev server and opens the chosen
webview against it (closing the window stops the server). Combine with `--debug` or `--profiler`:

```bash
./launch.sh --profiler --electron   # heavy scene, V8 / Chromium
./launch.sh --profiler --tauri      # heavy scene, WebKitGTK / JSC  (first run compiles the shell)
./launch.sh --debug --electron      # normal debug session in V8, etc.
```

Let each window settle ~5–10 s (the warmup ramp), then read `NNTPS`. For the cleanest reading use
`--profiler-autorun` (auto-unpaused at 4×) instead of `--profiler`.

> Manual equivalent (server + shell in separate terminals): `./dev.sh --profiler-autorun`, then
> `cd desktop-spike/electron && pnpm start` (or `cd desktop-spike/tauri && pnpm tauri dev`).

## Results (fill in)

| Engine                         | TPS @4× (heavy scene) | FPS | Notes (cliffs, WebGL/worker glitches) |
| ------------------------------ | --------------------- | --- | ------------------------------------- |
| Zen / SpiderMonkey (baseline)  | ~200                  |     | the number the doc reports            |
| Electron / V8                  |                       |     |                                       |
| Tauri / WebKitGTK (JSC)        |                       |     |                                       |

**What to watch for on WebKitGTK specifically:** worker startup, WASM (spatial-core) init, WebGL
context creation, and the worker↔main snapshot bridge (the §0 "multi-instance visuals glitching"
symptom). If JSC holds 60+ TPS with no render glitches, Tauri is viable; if it cliffs, that's a
distribution decision (lean Electron) made *now* instead of at the milestone.
