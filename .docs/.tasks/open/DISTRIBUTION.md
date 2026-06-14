<!-- LOC cap: 300 (created: 2026-05-30) -->

# TAURI DISTRIBUTION

> **Related:** [ROADMAP](ROADMAP.md) · [game/ARCHITECTURE](../../game/ARCHITECTURE.md) · [ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md) (the shipped WebView is the perf-measurement target) · [game/DECISIONS](../../game/DECISIONS.md) ADR-020

## Goal

Ship Fantasia4x as a standalone desktop application (Linux AppImage/deb, Windows
NSIS/MSI, macOS dmg) using Tauri 2. The SvelteKit frontend is unchanged; Tauri
wraps the Vite-built output. Save files migrate from `localStorage` to the native
filesystem so they survive browser-data clears. WASM spatial core must load
correctly inside the bundled WebView.

---

## Phase A — Viability Spike (do now)

Minimum goal: one complete turn cycle runs inside a Tauri window with saves
working and WASM loaded. Gate further investment on this passing.

### A1 — Tauri scaffold

- Add Tauri v2 to the project: `pnpm add -D @tauri-apps/cli@next` +
  `pnpm add @tauri-apps/api@next`.
- Run `pnpm tauri init` to generate `src-tauri/` scaffold.
- Set `tauri.conf.json` → `build.frontendDist` to `../build` (matches
  `@sveltejs/adapter-static` output).
- Switch SvelteKit adapter from `adapter-auto` to `adapter-static` with
  `fallback: 'index.html'` so Tauri can serve the app without a Node server.
- Add `"tauri": "tauri dev"` and `"tauri:build": "tauri build"` to
  `package.json` scripts.

### A2 — WASM loading in WebView

- Confirm `vite-plugin-wasm` works inside `tauri dev` (it should; Tauri uses
  Vite as the dev server in dev mode).
- In production builds, verify `spatial_core_bg.wasm` is included in the Vite
  output and the asset path resolves correctly from the bundled WebView.
- If asset paths break: set `tauri.conf.json` → `app.withGlobalTauri: true` and
  use the `convertFileSrc` helper to construct the WASM URL at runtime.

### A3 — Save migration

Current saves live in `localStorage['fantasia4x-save']`. Desktop builds must
persist to the native filesystem (survives profile wipes, is findable by users).

**Strategy**: keep `localStorage` as the in-memory working buffer during a
session; flush to disk via the Tauri `fs` plugin on save, and read from disk on
load. Detect environment with `window.__TAURI_INTERNALS__` to branch code paths.

- Add `@tauri-apps/plugin-fs` to dependencies.
- Wrap the existing `saveManager.ts` with an adapter interface:

```typescript
// src/lib/stores/persistence.ts
export interface SaveAdapter {
  load(): Promise<string | null>;
  save(data: string): Promise<void>;
}
```

- Implement `LocalStorageAdapter` (current behaviour) and `TauriAdapter` (reads/
  writes `$APPDATA/fantasia4x/save.json`).
- `saveManager.ts` picks the adapter at startup based on
  `window.__TAURI_INTERNALS__ !== undefined`.

### A4 — Spike acceptance criteria

- [ ] `pnpm tauri dev` launches a window; the game loads without console errors.
- [ ] Spatial WASM initialises (no "failed to load WASM" errors in WebView devtools).
- [ ] New game → play two turns → quit → relaunch → game state loaded correctly.
- [ ] Save file visible at expected path (`~/.local/share/fantasia4x/save.json`
      on Linux).
- [ ] **Perf baseline on the real engine** — run the `--profiler` sandbox inside
      `tauri dev` and capture `.debug/perf.log`. The dev browser is Firefox
      (SpiderMonkey); the shipped Linux WebView is **WebKitGTK (JavaScriptCore)**, which
      can be materially slower on hot numeric JS, so Firefox tick numbers do **not**
      transfer. This is the WebKitGTK confirmation that [ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md)
      §6 is gated on — the Tauri scaffold is its prerequisite.

---

## Phase B — Configuration & Permissions (before first release)

### B1 — `tauri.conf.json` hardening

```jsonc
{
  "productName": "Fantasia4x",
  "version": "0.1.0",
  "identifier": "dev.fantasia4x.app",
  "app": {
    "windows": [
      {
        "title": "Fantasia4x",
        "width": 1280,
        "height": 800,
        "minWidth": 1024,
        "minHeight": 640,
        "resizable": true
      }
    ],
    "security": { "csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'" }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- `'wasm-unsafe-eval'` in CSP is required for WASM instantiation in strict
  WebViews (Chromium-based on Linux/Windows; WebKit on macOS).
- Restrict `fs` plugin scope to `$APPDATA/fantasia4x/**` only — no broader
  filesystem access.

### B2 — AI endpoints

The Gemini API calls live in `src/routes/api/` (SvelteKit server routes).
Those server routes **do not exist** in a static Tauri build — they are removed
by `adapter-static`.

Options (pick one before Phase B is complete):

| Option                                           | Approach                                                                | Trade-off                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A — Keep server routes, add a Tauri sidecar      | Bundle a small Node/Bun sidecar that runs the SvelteKit API routes      | Most faithful; adds binary size and complexity                       |
| B — Move Gemini calls to a hosted backend        | Deploy `src/routes/api/` to a cloud function; client fetches over HTTPS | Clean separation; requires network; key management moves server-side |
| C — Call Gemini directly from the Tauri frontend | Use `@google/generative-ai` in client code with a user-supplied API key | Simplest; key exposed in app storage; acceptable for a hobbyist game |

**Recommended for now**: Option C with the key stored via
`@tauri-apps/plugin-store` (encrypted on disk). Revisit before any public
release.

### B3 — Updater (optional for v0.1)

Tauri's built-in updater can pull a JSON endpoint for patch releases. Skip for
v0.1; add when the game reaches a stable feature baseline.

---

## Phase C — Distribution Targets

| Platform | Format               | Toolchain requirement                                       |
| -------- | -------------------- | ----------------------------------------------------------- |
| Linux    | AppImage + `.deb`    | Any Linux x86_64 with Tauri deps installed                  |
| Windows  | NSIS installer + MSI | Cross-compile via GitHub Actions `windows-latest` runner    |
| macOS    | `.dmg` + `.app`      | macOS runner; code signing requires Apple Developer account |

### C1 — Build command

```bash
pnpm tauri build          # builds for host platform
pnpm tauri build --target x86_64-pc-windows-msvc   # cross (CI only)
```

### C2 — GitHub Actions matrix (sketch)

```yaml
strategy:
  matrix:
    include:
      - os: ubuntu-22.04
      - os: windows-latest
      - os: macos-latest
```

Each runner: install Rust stable → install WASM target → `pnpm add:wasm` →
`pnpm build` → `pnpm tauri build` → upload artifact.

### C3 — WASM cross-compile note

`spatial-core` must be compiled for `wasm32-unknown-unknown` on every runner.
The `pnpm add:wasm` script already does this; just ensure `wasm-pack` is
available in the CI environment (`cargo install wasm-pack` step).

### C4 — CI caching

Cargo/wasm-pack builds are the slow part of the matrix. Use
[`Swatinem/rust-cache`](https://github.com/Swatinem/rust-cache) (free GitHub
Action) to cache `~/.cargo` and `target/` per-OS — covers Linux, Windows, and
macOS runners alike. A paid runner service (e.g. Blacksmith) was considered but
doesn't support macOS runners, so it wouldn't help the full matrix; revisit
only if release-build CI time becomes a real pain point.

---

## Engine & Performance Notes (cross-ref ENGINE-PERFORMANCE / ADR-020)

The shipped runtime is **not** the dev browser. Per platform: Linux = **WebKitGTK**
(JavaScriptCore), Windows = **WebView2** (V8), macOS = **WKWebView** (JavaScriptCore);
dev = Firefox (SpiderMonkey). Consequences this spec must respect:

- **Wrapper choice (Tauri vs Electron) is OPEN — this milestone is where it gets decided**,
  with full information, not before. This spec is named for Tauri because Tauri is the
  default working assumption (ADR-007), but Electron is a live alternative and must be
  evaluated here, not pre-rejected. The trade (per ADR-020):

  | | Tauri | Electron |
  | --- | --- | --- |
  | JS engine(s) | **three** (WebKitGTK/JSC, WebView2/V8, WKWebView/JSC) | **one** (Chromium/V8) everywhere |
  | Threading | Workers yes; SAB fragmented | Workers + **Node OS-thread multicore** |
  | Bundle / RAM | tiny (~3–40 MB) | large (+150–250 MB) |
  | Rust synergy | native (`spatial-core`, sidecar) | via napi-rs/neon addon |

  **Decision input:** if the ENGINE-PERFORMANCE algorithmic fix (step 1) makes the sim
  comfortably fast on WebKitGTK, the perf axis is moot and the choice tilts to Tauri on
  size/feel. If the sim is *still* CPU-bound on WebKitGTK after the ladder (algorithms →
  WASM → one worker), Electron's uniform V8 + real threads becomes a serious contender.
  **So the WebKitGTK perf baseline (added to A4 above) is the data this decision waits on.**
  *Only* forking Electron/Chromium and embedding SpiderMonkey are rejected outright.
- **WASM is the portable performance lever regardless of wrapper** — it runs ~identically
  on every engine, unlike JS. The A2 WASM-loading gate is therefore also a *performance*
  gate: the more hot compute lives in `spatial-core`, the less the wrapper choice matters
  for perf.
- **Threading portability**: Web Workers are universal; **SharedArrayBuffer is fragmented**
  (reliable on V8-based runtimes, spotty on WebKitGTK/WKWebView). A future "sim → one
  worker" step is portable either way; SAB-based multicore is not — defer it
  (ENGINE-PERFORMANCE §5/§8).

## Open Questions

- [ ] Will `adapter-static` break any existing SvelteKit route that is not `api/`?
      (Check for any non-static `load()` functions that hit a DB or environment
      variable only available server-side.)
- [ ] What minimum WebView version do target platforms ship with? (WASM +
      `wasm-unsafe-eval` requires Chromium 91+ / WebKit 615+.)
- [ ] Should the save file be a single JSON blob or split per-colony for
      multi-save support?
- [ ] If "sim → one Web Worker" (ENGINE-PERFORMANCE §5) is pursued, does it need
      cross-origin isolation headers under Tauri's custom protocol, and do all three
      webviews honour them? (Only relevant once that step is on the table.)

---

## Status

Spec written. No implementation started.
