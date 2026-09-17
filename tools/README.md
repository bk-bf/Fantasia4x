# Tools

Every developer tool for Fantasia4x lives in this directory. Only five launchers stay at the
repository root, listed at the end.

Tests, checks, benchmarks and work pins never run on the laptop. Their `pnpm` scripts send them
to ubuntuserver through `remote/run.mjs`.

| Path | What it does | How to run it |
|---|---|---|
| `issue.mjs` | Writes GitHub issues, pull requests, board lanes, labels, blockers and milestones in the shape the repo checks. | `pnpm issue <command>` |
| `chain.mjs` | Pushes the branch, starts or follows the CI chain for it on GitHub, and streams the run to its result. | `pnpm chain`, `pnpm chain --pre` |
| `remote/run.mjs` | Runs a test or check command on ubuntuserver against the committed `HEAD`, for work in progress. | the `pnpm` test, check and bench scripts |
| `remote/guard.mjs` | Refuses a test runner, linter or harness started on the laptop. | Claude Code hook |
| `remote/prepare.sh` | Puts the pinned Node, pnpm and Rust on the path on ubuntuserver. | loaded by `remote/run.mjs` |
| `audit/` | The code audit: symbol ledger, rules, overnight runs, fixer, reviewer, resolver and promotion. `audit/README.md` describes it. | `pnpm audit`, `audit:run`, `audit:fix`, `audit:review`, `audit:resolve`, `audit:promote` |
| `audit/deploy/` | The ubuntuserver units for the nightly audit, and their installer. | `tools/audit/deploy/install.sh` |
| `audit/hooks/inflight.mjs` | Lists open pull requests with every prompt and flags the first edit of a file they touch. | Claude Code hook |
| `audit/warnings.mjs` | Runs `svelte-check`, `eslint`, or `tsc` over the files in `tools/` that `svelte-check` does not reach; fails on an error or on a count past `audit/warning-budget.json`, and in CI lists every finding on the run page, annotates the changed files and feeds the pull request's Check notes. | `pnpm check:types`, `pnpm check:tools`, `pnpm lint` |
| `bench/` | CodSpeed benchmarks of whole ticks and one entity phase, and ticks per second. | `pnpm bench`, `pnpm bench:tps` |
| `bench/counts.mjs` | Reads the exact instruction and cache-miss counts per benchmark out of CodSpeed's profiles. | `node tools/bench/counts.mjs <dir> --out <file>`, run by the `codspeed` job |
| `bench/codspeed-gate.mjs` | Waits for CodSpeed's verdict on the head commit and fails on a regression unless the pull request carries `perf change accepted`. The wait lives in `bench/codspeed-check.mjs`, which the Check notes share. | run by the `codspeed` job |
| `work-pins/` | Call counts of the simulation tick and the browser frame, base against head. | `pnpm work-pins`, `pnpm work-pins:gate` |
| `gungraun/gate.mjs` | Instruction counts for `sim-core` and `spatial-core`, base against head. | `node tools/gungraun/gate.mjs --base <ref>` |
| `gpu/` | Frame measurement on a rented GPU: `vast.mjs` rents the machine, `probe.mjs` tries Chromium's GPU flags, `frames.mjs` times frames. | `node tools/gpu/<script>.mjs` |
| `hooks/` | Git hooks: commit message shape, private words, branch names, branches of blocked issues, and the card of a pushed branch. | `pnpm hooks:install` |
| `dev-tools/` | Standalone dev pages packed into one HTML file, such as the gear database. | `pnpm tools:pack` |
| `profile-self.mjs`, `profile-window.mjs` | Read the newest Firefox Profiler recording in `.debug/` and report the simulation's functions in it. | `node tools/profile-self.mjs` |
| `threat-model.mjs` | Rates creature threat from the creature, item and loot data. | `pnpm threat`, `pnpm threat:check` |

## Launchers at the root

| Path | What it does |
|---|---|
| `dev.sh` | Starts the dev server, on the port in `.devport` when there is one; flags add debug logging, the profiler, HMR, a browser or headless mode. |
| `launch.sh` | Starts the game from this checkout. |
| `build.sh` | Packages the desktop app for Linux or Windows. |
| `install.sh` | Sets up a fresh checkout. |
| `audit.sh` | Runs the long combat audits (`RUN_AUDITS=1`) in the background on the host in `AUDIT_HOST`, `aspect` by default. |
