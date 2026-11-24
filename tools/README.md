# Tools

Every developer tool for Fantasia4x lives in this directory. Only five launchers stay at the
repository root, listed at the end.

Tests, checks, benchmarks and work pins never run on the laptop. Their `pnpm` scripts send them
to ubuntuserver through `remote/run.mjs`.

| Path | What it does | How to run it |
|---|---|---|
| `issue.mjs` | Writes GitHub issues, pull requests, labels, blockers and milestones in the shape the repo checks. | `pnpm issue <command>` |
| `chain.mjs` | Pushes the branch, starts or follows the CI chain for it on GitHub, and streams the run to its result. | `pnpm chain`, `pnpm chain --pre` |
| `remote/run.mjs` | Runs a test or check command on ubuntuserver against the committed `HEAD`, for work in progress. | the `pnpm` test, check and bench scripts |
| `remote/guard.mjs` | Refuses a test runner, linter or harness started on the laptop. | Claude Code hook |
| `remote/prepare.sh` | Puts the pinned Node, pnpm and Rust on the path on ubuntuserver. | loaded by `remote/run.mjs` |
| `test-health/run.sh` | Starts the nightly `claude -p` session that runs the `test-health` skill; `test-health/install.sh` installs its systemd timer on ubuntuserver (04:00 UTC). | `tools/test-health/install.sh` |
| `lib/` | The GitHub wrapper's modules, the label, milestone and private-word lists, and `private-check.mjs`, which the git hooks run. | imported by `issue.mjs`, `promote.mjs` and the hooks |
| `promote.mjs` | Merges `dev` into `main` in a worktree and runs every check there; `--push` pushes `main`. | `pnpm promote` |
| `ci/ci-scope.mjs` | Decides which CI legs a change runs from `ci/scope.json`, and refuses a file no rule there matches. | run by `check.yml` and `hooks/pre-push` |
| `ci/ci-check.mjs` | Runs `pnpm check` and the related tests in CI. | run by `check.yml` |
| `ci/stats.mjs` | Prints how long CI runs take, how much of it was waited on, red-run time, each job's share and time to green per branch, from the history the dashboard records. | `pnpm ci:stats [--days N] [--workflow W] [--json]` |
| `ci/structure.mjs` | Checks the architecture seams in `ci/seams.json` and the component sizes in `ci/component-sizes.json`. | `node tools/ci/structure.mjs`, run by `check.yml` and `promote.yml` |
| `ci/warnings.mjs` | Runs `svelte-check`, `eslint`, or `tsc` over the files in `tools/` that `svelte-check` does not reach; fails on an error or on a count past `ci/warning-budget.json`, and in CI lists every finding on the run page, annotates the changed files and feeds the pull request's Check notes. | `pnpm check:types`, `pnpm check:tools`, `pnpm lint` |
| `dev-shell/` | The Electron shell `./launch.sh --electron` plays the dev server in; its own package, installed by `install.sh`. | `./launch.sh --electron` |
| `claude/inflight.mjs` | Lists open pull requests with every prompt and flags the first edit of a file they touch. | Claude Code hook |
| `bench/` | CodSpeed benchmarks of whole ticks, one entity phase and the exploration row build, and ticks per second. | `pnpm bench`, `pnpm bench:tps` |
| `bench/counts.mjs` | Reads the exact instruction and cache-miss counts per benchmark out of CodSpeed's profiles. | `node tools/bench/counts.mjs <dir> --out <file>`, run by the `codspeed` job |
| `bench/codspeed-gate.mjs` | Waits for CodSpeed's verdict on the head commit and fails on a regression unless the pull request carries `perf change accepted`. The wait lives in `bench/codspeed-check.mjs`, which the Check notes share. | run by the `codspeed` job |
| `gpu/zoom-out.mjs` | Zooms a loaded save from the closest tile size to the whole map on the desktop's real GPU and records every frame gap and a CPU profile per round. | `CHROME=<chromium> node tools/gpu/zoom-out.mjs <tree> <label> <out dir> [rounds]`, see the `desktop-bench` skill |
| `gpu/steady.mjs` | Holds a loaded save at three zoom levels, paused, 1x and 4x, on the desktop's real GPU and reports frames per second, frame-time percentiles and ticks per second for each. | `CHROME=<chromium> node tools/gpu/steady.mjs <tree> <label> <out dir> [seconds]`, see the `desktop-bench` skill |
| `gpu/attach-trace.mjs` | Attaches to a game that is already running with its debug port open, zooms it out a few times, and records a Chrome trace of every process plus a CPU profile per round. Runs on ubuntuserver against the laptop's game through an ssh tunnel. | `node tools/gpu/attach-trace.mjs http://127.0.0.1:9333 <out dir> [rounds]`, see the `desktop-bench` skill |
| `gpu/trace-stall.mjs` | Prints the worst frames of a trace with each thread's busy time and the events that filled it. | `node tools/gpu/trace-stall.mjs <trace.json> [frames]` |
| `gpu/copy-save.mjs` | Copies the save out of a running game's IndexedDB through its debug port into a gzipped fixture the gpu probes load with `F4X_FIXTURE`. | `node tools/gpu/copy-save.mjs http://127.0.0.1:9333 <out.json.gz> [save id]` |
| `gpu/stall.mjs` | Prints the longest busy stretch of a CPU profile with its time per function. | `node tools/gpu/stall.mjs <file.cpuprofile>...` |
| `coverage/gate.mjs` | Runs the whole test suite with line coverage of `src/lib/game` and writes the total and each changed file's coverage for the Check notes. | `pnpm test:coverage`, run by the `coverage` job |
| `mutants/pins.mjs` | Applies each mutant in `mutants/registry.json` (a file, an exact text to find, its replacement, and the tests expected to kill it) to a scratch copy of the tree, runs those tests, and fails naming every mutant that survives. In CI it runs the mutants a change reaches, and the whole registry nightly. A test that closes a mutation gap adds its killed mutant to the registry. | `pnpm test:mutants [--base <ref>] [--only <id,...>] [--jobs N]` |
| `work-pins/` | Call counts of the simulation tick and the browser frame, base against head. | `pnpm work-pins`, `pnpm work-pins:gate` |
| `gungraun/gate.mjs` | Instruction counts for `sim-core` and `spatial-core`, base against head. | `node tools/gungraun/gate.mjs --base <ref>` |
| `gpu/` | Frame measurement on a rented GPU: `vast.mjs` rents the machine, `probe.mjs` tries Chromium's GPU flags, `frames.mjs` times frames. | `node tools/gpu/<script>.mjs` |
| `hooks/` | Git hooks: commit message shape, private words, branch names, branches of blocked issues, and the card of a pushed branch. | `pnpm hooks:install` |
| `dev-tools/` | Standalone dev pages packed into one HTML file, such as the gear database. | `pnpm tools:pack` |
| `tileset/` | Bakes the painted map art in `tileset/art/` into `static/tilesets/painted/atlas.png` and its `manifest.json`, which maps database ids to sprites, and the rock top, rock veins, water field and ground field beside them; `rock.mjs`, `water.mjs` and `ground.mjs` hold the last four. | `pnpm tileset:bake` |
| `tileset/sync.mjs` | Copies the drawing code the bake loads from a mockup folder into `tileset/art/`, without comments; `sources.mjs` lists those files and the hand-ported ones it leaves alone. | `pnpm tileset:sync <folder>` |
| `tileset/colony.mjs` | Paints the main menu's colony scene from `colony.js` and `scene.js` in `tileset/art/` into `static/tilesets/painted/colony/`: a still and an animated png for each season and time of day. | `pnpm tileset:colony` |
| `tileset/weather.mjs` | Paints the rain, fog and snow sheets the weather layer tiles over the map and the main menu, from `src/lib/components/UI/weather/weatherSheets.json`, into `static/tilesets/painted/weather/`. | `pnpm tileset:weather` |
| `tileset/sway.mjs` | Reads how far each tree, plant and crop in the atlas bends in the wind, and which trees drop leaves, from the art in `tileset/art/`, into `static/tilesets/painted/sway.json`. | `pnpm tileset:sway` |
| `profile-self.mjs`, `profile-window.mjs` | Read the newest Firefox Profiler recording in `.debug/` and report the simulation's functions in it. | `node tools/profile-self.mjs` |
| `audio-loudness.mjs` | Measures the integrated loudness (EBU R128) of each ambient bed with ffmpeg; `--write` stores it in `src/lib/audio/bedLoudness.json`, which levels the beds against each other. | `node tools/audio-loudness.mjs [--write]` |
| `threat-model.mjs` | Rates creature threat from the creature, item and loot data. | `pnpm threat`, `pnpm threat:check` |
| `runner/` | Registers self-hosted GitHub Actions runners for this repo in `.ci/runners/<n>/` of the checkout it sits in, each as a `gha-fantasia4x@<n>` user unit behind `gate.sh`, which refuses anyone but the owner. CI falls back to them when the `RUNS_ON` repo variable is set. | `tools/runner/setup.sh [count]` on ubuntuserver |

## Launchers at the root

| Path | What it does |
|---|---|
| `dev.sh` | Starts the dev server, on the port in `.devport` when there is one; flags add debug logging, the profiler, HMR, a browser or headless mode. |
| `launch.sh` | Starts the game from this checkout; `./launch.sh <branch>` first switches the checkout detached to `origin/<branch>` and plays it painted in Electron. |
| `build.sh` | Packages the desktop app for Linux or Windows. |
| `install.sh` | Sets up a fresh checkout. |
| `audit.sh` | Runs the long combat audits (`RUN_AUDITS=1`) in the background on the host in `AUDIT_HOST`, `aspect` by default. |
