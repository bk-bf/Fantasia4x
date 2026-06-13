# Codebase Graph

An interactive call-graph explorer for the Fantasia4x TypeScript codebase.
Built to make architectural problems (god services, hub functions, circular
deps, layer violations) visible at a glance.

## Use it

**Live mode (recommended).** `./launch.sh` starts the graph server automatically
alongside the dev servers:

```
[codegraph] http://localhost:5180
```

Open that URL. It rebuilds the graph on any `src/lib/**.ts` change (or edit to
`template.html` / `descriptions.json`) and hot-reloads every open tab — no manual
step. Run it on its own with `pnpm graph:serve`. Override the port with
`CODEGRAPH_PORT`.

**One-off static build.**

```bash
pnpm graph        # extract + build
```

Then open `tools/codegraph/codegraph.html` directly. The file is fully
self-contained (Mermaid is vendored and inlined) — it works offline (`file://`)
and can be moved or shared anywhere. The live server serves this same file with a
small reload script injected on the fly.

## What you get

- **Architecture view** — every module as a node, clustered by layer
  (core / services / systems / stores / …), with cross-module dependency edges.
  Thick edges = 6+ call sites between two modules.
- **Module view** — click a module (or use the sidebar) to drill into its
  functions: solid edges are internal calls, dotted edges reach into other
  modules (1 hop of neighbours, toggleable).

### Interaction

- **Hover** any node or edge — the whole connected flow lights up and everything
  else dims, so a call chain is easy to trace visually.
- **Click** a node or edge — the right-hand panel shows details: what it does,
  signature, callers/callees, and a `vscode://` jump-to-source link. Click
  callers/callees to walk the graph.
- **Plain-English labels** toggle — flip every node between its function name and
  a description of what it does in the game.
- Drag to pan, scroll to zoom, `+ / − / ⤢` controls, search box to filter.

## Query API (for agents)

When the server is running (`pnpm graph:serve` or `launch.sh --debug`) it also
exposes a JSON API at `http://localhost:5180/api`, giving an LLM agent the same
information the browser shows. Responses are JSON (CORS-open); add `?format=md`
to function/module/search/path for a prose summary. `GET /api` is self-documenting.

| Endpoint | Purpose |
| -------- | ------- |
| `/api/stats` | counts (functions, edges, modules, files) |
| `/api/graph` | full dump: nodes (with descriptions), edges, modules, moduleEdges |
| `/api/modules` · `/api/module?name=` | module summaries / one module (deps + function list) |
| `/api/functions?module=&q=&kind=&exported=&limit=` | list / filter functions |
| `/api/function?name=\|id=` | one function: description, signature, callers, callees |
| `/api/search?q=&limit=` | search functions + modules by name and description |
| `/api/callers?name=` · `/api/callees?name=` | direct callers / callees |
| `/api/path?from=&to=&max=` | shortest call path between two functions |
| `/api/hubs?limit=` | most-called functions, most-depended-on modules |
| `/api/port-candidates?limit=` | modules ranked as TS→Rust port candidates (compute-heavy, low coupling) |
| `/api/orphans` | standalone private functions with no callers (dead-code candidates) |

Functions resolve by exact id, `Class.method`, or bare method name; ambiguous
names return all matches. Modules resolve by full path, short path, or basename.
Function rows include `loc`, `numeric` (compute heaviness), and `tested`.
The API is refreshed automatically on every rebuild.

```bash
curl localhost:5180/api/function?name=tickPawn
curl 'localhost:5180/api/path?from=processGameTurn&to=tickPawn'
curl 'localhost:5180/api/port-candidates?limit=10'
```

## Analysis & guardrails

```bash
pnpm graph:check       # enforce architecture rules (exit 1 on violations)
pnpm graph:snapshot    # save current graph as a baseline (e.g. on main)
pnpm graph:diff        # show how the graph changed since the snapshot
```

**`graph:check`** turns the graph into an enforced contract — run it in CI. Rules:

- **ADR-008** — nothing may call `WasmPathfinderService` directly (only the `PathfinderService` interface). *Error.*
- **cycles** — circular module dependencies (Tarjan SCC). *Error.*
- **layers** — a lower layer must not depend on a higher one (`core→services`, `services→systems`, …). *Warning.*
- **god-module** — modules with > 40 functions. *Warning.*
- **orphans** — standalone private functions nothing calls. *Warning.*

Exit code is non-zero on errors; `--strict` also fails on warnings.

**`graph:diff`** compares the current graph against a saved baseline and reports
new/removed modules, function-count changes (flags new god-modules), and
new/removed module dependencies — so a refactor's effect, or a regression
forming, is visible immediately.

### In the viewer

- **Plain-English** toggle, **Test coverage** toggle (outline untested code red,
  tested green; module nodes tinted by tested fraction), cross-module toggle —
  all persisted across reload.
- Svelte components show edges to the stores/services they call, including
  reactive `$store` reads (so a store's "used by" reflects real UI consumption).

## How it works

| File                | Role                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `extract.mjs`       | Walks `src/lib/**/*.ts` with the TypeScript compiler API, resolves calls through the type checker, emits `graph.json` (nodes, edges, per-module rollup, degree stats). Generates a description for every function (JSDoc, else inferred from the name). |
| `descriptions.json` | Curated plain-English overrides for groups, modules, and specific functions.                |
| `template.html`     | The viewer (CSS + Mermaid generation + interactivity). Edit this for UI changes.            |
| `build-html.mjs`    | Inlines `graph.json` + `descriptions.json` + vendored Mermaid into `codegraph.html`.        |
| `rust.mjs`          | Syntactic Rust extractor (fns, intra-crate edges, wasm-bindgen exports) merged into the graph by `extract.mjs`. |
| `serve.mjs`         | Live server: rebuild-on-change, hot-reload, and the `/api` query endpoints.                 |
| `api.mjs`           | The JSON query API over `graph.json` (descriptions, call edges, search, paths, hubs, port-candidates). |
| `check.mjs`         | Architecture rule engine (`pnpm graph:check`) — ADR-008, layers, cycles, god-modules, orphans. |
| `diff.mjs`          | Snapshot + diff (`pnpm graph:snapshot` / `graph:diff`) for tracking structural change.      |
| `vendor/mermaid.min.js` | Pinned Mermaid 10.9.1 UMD build (downloaded once).                                       |

### Description resolution (per function)

1. curated entry in `descriptions.json` → 2. the function's JSDoc/leading comment
→ 3. a humanized version of its name. So the plain-English toggle always shows
*something* meaningful; enrich `descriptions.json` to improve it.

### Regenerating

`graph.json` and `codegraph.html` are build artefacts — re-run `pnpm graph`
after code changes. The vendored Mermaid only needs downloading once:

```bash
curl -s -o tools/codegraph/vendor/mermaid.min.js \
  https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js
```

## Language coverage

| Language | What's covered | How |
| --- | --- | --- |
| **TypeScript** (`src/lib/**.ts`) | every fn/method, call edges | TS compiler API + type checker |
| **Svelte** (`src/**/*.svelte`) | one node per component; edges to the stores/services/webgl it calls | each `<script>` is extracted into a line-preserving virtual TS twin fed to the same program (`extract.mjs`) |
| **Rust** (`spatial-core/**.rs`) | fn/method nodes, intra-crate edges, `#[wasm_bindgen]` exports, **TS→Rust boundary edge** | `rust.mjs` (syntactic parse) |

The graph is one connected map across all three: e.g. `/api/path?from=<a TS
function>&to=<a Rust function>` traces a UI/engine call through the WASM
boundary into Rust internals — useful for deciding what to port.

### Notes / limits

- **Svelte:** components that only read stores reactively (`$store`) and compose
  child components produce no *call* edges — that's accurate (they make no calls).
  Only explicit function calls are edges; reactive subscriptions are not.
- **Rust** parsing is syntactic (name-based), not type-resolved — fine for the
  small, self-contained spatial crates. If a crate grows, swap `rust.mjs` for a
  `syn`-based cargo tool or tree-sitter-rust (same output shape). The TS↔Rust
  edge is matched by wasm-bindgen export name (the boundary is opaque to the TS
  type checker because the wrapper casts the dynamic import).
- Edges come from statically resolvable calls. Dynamic dispatch through an
  interface resolves to the interface method where the checker can see it;
  fully dynamic indirection (e.g. calls off a `Record` of handlers) may be missed.
