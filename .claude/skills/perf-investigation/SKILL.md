---
name: perf-investigation
description: How to investigate a Fantasia4x performance complaint end to end — what the owner is actually running, the state of his laptop, his save, paused versus running, and finding the real cause by ablation before fixing anything. Use whenever he reports that the game feels slow, stutters, freezes, has low FPS or TPS, that a build got worse, or that a perf change did not help, and before posting any perf conclusion to an issue or pull request.
---

# Investigating a performance complaint

His report is the ground truth. A benchmark that disagrees with what he saw is measuring
something else; find out what before arguing with him. `desktop-bench` holds the commands for
the desktop and the laptop tracer, and the global `ablation` skill holds the method for finding
a cause. This skill is the order to work in and the traps found so far.

## 1. Establish what he is running

Before measuring anything, read his machine. All of this is read-only and allowed:

```bash
ssh laptop 'cd ~/Documents/local/Projects/Fantasia4x && git log -1 --format="%h %s" && git status -s | head \
  && ls -la src/lib/*-pkg/*.wasm && grep " session " .debug/perf.log | tail -3'
```

- **The `session` line in `.debug/perf.log`** opens every game load: branch and commit, the
  remote branch at that commit, uncommitted files, debug or play, renderer and its switches, GPU,
  window size and pixel ratio, cores, memory, map size, pawns, mobs, buildings, drops, jobs, turn,
  speed, and the host's battery state, power profile, CPU governor, load and free memory. Every
  line is timestamped, and a `host` line appears when power or profile changes mid-session.
  Match his complaint to its session before measuring anything.
- **Which branch.** A test branch can lag `dev` by dozens of commits. `test/look-overhaul` once
  missed six perf merges, so "perf did not improve" was true of what he ran.
- **Stale WASM.** A checkout whose `src/lib/*-pkg` is older than its Rust source runs with missing
  exports: the worker throws on its first path search and TPS sits at 0 after unpausing. `dev.sh`
  now rebuilds it when the source is newer; check the timestamps anyway when TPS is 0.
- **How he launches.** `F4X_PAINTED=1 ./launch.sh --electron` runs the dev server, so Svelte's
  dev-mode bookkeeping (a stack trace captured on every state write) is part of what he feels.
  A production build would not show it; do not discount it from his numbers.

## 2. Read the state of his laptop

The laptop is a Galaxy Book4 Pro with Intel Arc integrated graphics, 22 threads and 16 GB.

- **Battery and power profile.** On battery it drops to the `low-power` platform profile and
  `power-saver`, with the CPU governor on `powersave` and the GPU near its floor, which throttles
  both. Read `/sys/class/power_supply/BAT*/status`, `/sys/firmware/acpi/platform_profile` and
  `powerprofilesctl get`. A run on battery is not comparable with one plugged in; say which.
- **Background load.** `uptime`, `top -b -n1 -o %CPU | head -20`, `free -m`. Zen tabs, the bar
  and t3code take a few percent each; swap in use slows everything. Record it with the result.
- **Nothing test-related runs on the laptop.** Measure his own running game from ubuntuserver
  through the debug port (`desktop-bench`, "Measuring the owner's laptop"), and never relaunch
  his apps. Tell him before driving his camera, and that it takes about a minute.

## 3. Use his save, not the fixture

The CI fixture is 500x500 with 546 mobs; his save was 750x750 with about 1150 mobs and 124 lairs.
Costs that scale with the map or the creature count do not show on the fixture.

```bash
node tools/gpu/copy-save.mjs http://127.0.0.1:9333 /tmp/f4x-save.json.gz
```

It reads the save out of his running game's IndexedDB through the tunnel. Load it on the desktop
with `F4X_FIXTURE`; the probes serve it from the tree's `static/` because a save that large closes
the page when Playwright hands it over directly.

## 4. Pin the game state of every number

- **Paused or running.** Auto-pause on threat or death stops his game whenever his party is
  attacked, and he unpauses by hand. A "running" number taken from his game may contain pauses.
  The probes record `pausedShare` per round and whether the worst frame fell in a pause; for his
  own sessions, check the turn advance against the timestamps in `perf.log` (60 turns a second at
  1x). The desktop harness turns auto-pause off, so its running rows run.
- **Fresh or aged.** A fresh load can hide a cost that grows with play. Creatures asleep after
  about a minute of play dropped a fully zoomed-out map from 60 FPS to 7; a test started from a
  fresh load read 33 and pointed at the wrong cause.
- **Zoom and speed.** Name the zoom and the speed. Sim speedups only show at 4x when 1x already
  hits its 60 TPS target; he mostly plays at 1x.
- **Two probes that disagree measured different states.** Find the difference before trusting
  either.

## 5. Measure so the number can carry a conclusion

- The desktop is vsync-capped at 60 FPS, so costs under the cap are invisible in FPS; read the
  steady probe's `taskMs`, `scriptMs`, `layoutMs`, `styleMs` and `nodes` instead.
- Count what grows: DOM nodes and their classes, overlay list lengths, entities on screen. A count
  in the thousands is usually the answer before any profile is.
- One run is one data point. Repeat the baseline, alternate builds, and give ranges.
- The measuring tool can be the load: his TPS dipped to 17–30 while a 340 MB trace was pulled
  over the tunnel. Do not read the minute after a trace as his game's behaviour.
- To compare builds, use the same save, machine and probe on each; an old build without the
  harness borrows another tree's with `F4X_HARNESS`.

## 6. Find the cause by removal, not by reading

A profile shows where time went, not what removing something would save. Tonight's record:

- The zoom-out freeze was blamed on the shadow pass; the shadow fix halved it on the CI save,
  but on his save the remaining second was the terrain mesh rebuild, present since `main`.
- Full zoom-out at 5–8 FPS while running was blamed on the terrain, then on lair particles.
  Removing the lairs fixed a fresh load and nothing in his real state; the cause was about 1050
  sleep markers drawn for creatures too small to be drawn at that zoom.

So follow the global `ablation` skill: fork `debug/ablate-<area>` off the build he runs, add a
`src/lib/dev/ablate.ts` that reads `?ablate=a,b` and skip each named part where it runs, measure
each removal, everything off and the baseline twice with the steady probe, and fix only what
moved the number. Delete the debug branch, its worktree and its remote branch when done.

## 7. Before reporting

- Every number carries its unit and which way is better, in the table header or beside the
  number: "main-thread ms per second, lower is better, 1000 is fully busy", "FPS, higher is
  better", "TPS, target 60 per speed step". A bare number gets misread.
- Report what each part costs (baseline minus the number with it removed), not the remaining
  totals, and say how large the baseline's own spread is so a reader can tell noise from cost.
- State the build, machine, power state, load, save, zoom, speed, paused or running, fresh or
  aged, and the number of runs with every result.
- List every observation of his that disagrees with the conclusion and answer it, or drop the
  conclusion. A correction comment on an issue means this step was skipped.
- Put measurements on the pull request or issue they belong to, with the commands that made them.
- Roll a fix out to him by merging it into the test branch he launches, updating his laptop
  checkout only while the game is not running, and telling him the commit to expect in the
  session line.
