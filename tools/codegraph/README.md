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

## How it works

| File                | Role                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `extract.mjs`       | Walks `src/lib/**/*.ts` with the TypeScript compiler API, resolves calls through the type checker, emits `graph.json` (nodes, edges, per-module rollup, degree stats). |
| `descriptions.json` | Curated plain-English descriptions for groups, modules, and key hub functions.              |
| `template.html`     | The viewer (CSS + Mermaid generation + interactivity). Edit this for UI changes.            |
| `build-html.mjs`    | Inlines `graph.json` + `descriptions.json` + vendored Mermaid into `codegraph.html`.        |
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

## Notes / limits

- Covers `.ts` under `src/lib` (game logic + stores). `.svelte` components are
  not parsed — they are the consumers above this graph.
- Edges come from statically resolvable calls. Dynamic dispatch through an
  interface resolves to the interface method where the checker can see it;
  fully dynamic indirection (e.g. calls off a `Record` of handlers) may be missed.
