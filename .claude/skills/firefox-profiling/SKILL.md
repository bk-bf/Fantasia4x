---
name: firefox-profiling
description: Firefox/Gecko runtime profiling for Fantasia4x — firefox-devtools-mcp (live Firefox DevTools) and pq (Firefox Profiler CLI). Use when profiling the running app in Firefox rather than the Electron/V8 shell.
---

# Firefox profiling

Two complementary tools for diagnosing runtime cost (e.g. the per-tick sim hot
path — see `.docs/.tasks/open/ENGINE-PERFORMANCE.md`):

- **`firefox-devtools-mcp`** — MCP server giving agents live Firefox DevTools
  access (navigate, inspect DOM/network/console, drive the running app at
  http://localhost:5173). Registered at **local scope** (private per-user), so it
  is **not** committed — enable it once from the repo root:
  `claude mcp add firefox-devtools-mcp -- npx -y firefox-devtools-mcp`
  (verify with `claude mcp list`; tools surface in-session via `/mcp`).
- **`pq`** (`@firefox-devtools/profiler-cli`, a devDependency — available after
  `pnpm install`) — query a captured Firefox Profiler profile from the terminal
  via a persistent daemon session. pnpm doesn't put bins on `PATH`, so prefix
  `pnpm exec`:

  ```bash
  pnpm exec pq load profile.json     # start a daemon session for a profile
  pnpm exec pq status                # what's loaded (thread, zoom ranges, filters)
  pnpm exec pq thread functions --search GC --min-self 1
  pnpm exec pq guide                 # full command reference
  pnpm exec pq stop --all            # tear down session(s) when done
  ```

  Workflow: profile the running app in Firefox → export the `.json`/`.json.gz`
  profile → `pq load` it → drill into threads/markers/functions. Daemon sessions
  **persist between profiles**, so `pq stop --all` when finished.
