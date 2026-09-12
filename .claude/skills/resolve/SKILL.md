---
name: resolve
description: Start the Fantasia4x resolver on ubuntuserver and watch it work the board's Ready cards one after another through the fixer, paced by the audit's own schedule, and restart it if it dies. Use when asked to resolve or work the Ready cards, to "start the resolver", or to run the fixer over the board. It does not review, merge or judge the pull requests it opens.
---

# Running the resolver

`tools/audit/resolve.mjs` is the loop. It takes the cards in `Ready`, tests first, then
headless, then playtest, oldest first, and hands each to `tools/audit/fix.mjs --issue <n>`. It
tries each card once per run and stops when no untried card is left. Your job is to start it,
watch it and keep it alive. What happens to a card afterwards is not yours to judge: a pull
request that fails review or CI is the reviewer's run, and `board-sync.py` merges the ones that
pass.

## Where

Only on ubuntuserver. `uname -n` must print `ubuntuserver`; on the laptop, say so and stop,
because the fixer runs `pnpm check` and the tests, and nothing test-related runs there.

## Pace

Before every card the loop does what an audit worker does before a batch: it waits while the
audit is paused (`tools/audit/lib/pace.mjs` `pauseReason`), and holds while `schedule` says the
five-hour usage window is ahead of the ceiling's pro-rata line, polling every
`poll_seconds` of the audit's control file. It also waits for GitHub's GraphQL points to reset
while fewer than `RESOLVE_POINTS_FLOOR` (600) are left, because every board read costs 101 of
the account's hourly 5,000. Holding is normal and is logged once every ten minutes; do not
start a second resolver to get round it, and do not pass `--force` to the fixer.

## 1. Look before starting

```bash
uname -n
systemctl --user is-active fantasia-resolve
node tools/audit/resolve.mjs --dry-run
```

`active` means one is already running: watch it (step 3) instead of starting another. The dry
run prints the pace verdict, the GitHub points left and the cards in the order they would be
worked. An empty `Ready` means there is nothing to do; say so and stop.

## 2. Start it

```bash
systemd-run --user --unit=fantasia-resolve --collect \
  -p Restart=on-failure -p RestartSec=120 \
  -p WorkingDirectory=$HOME/Documents/Projects/Fantasia4x \
  /bin/bash -c '. tools/remote/prepare.sh && exec node tools/audit/resolve.mjs'
```

`prepare.sh` loads the pinned Node and pnpm and points `TMPDIR` at `~/test-runs/tmp`, so the
fixer's test runs do not fill `/tmp`. `Restart=on-failure` brings the loop back two minutes after
it dies. A fresh start forgets which cards it tried, so a card the fixer refused is tried once
more.

## 3. Watch it

Arm a persistent Monitor on its journal, filtered to what changes a card or the loop:

```bash
journalctl --user -u fantasia-resolve -f -n 0 -o cat | grep --line-buffered -E '^\[resolve|^--- (#|opened|pushed|not green|nothing changed)|^ABORT|Scheduled restart|Main process exited|Failed with result'
```

Report one line per card as it finishes: the card, what the fixer did with it (a pull request,
`PR ready`, `Failed`, nothing changed, or refused with its `ABORT:` reason) and how long it took.
Report a hold or a pause once, when it starts, not every time it is logged.

## 4. When it dies

A `Scheduled restart job` line means systemd is bringing it back; say so and keep watching. If
the unit is no longer active and the last `[resolve]` line is not `Ready has no untried card
left`, it gave up after repeated failures: read `journalctl --user -u fantasia-resolve -n 60
--no-pager`, then run the step 2 command once more. If it dies again within the hour, stop,
and report the journal lines that show why instead of starting it a third time.

## 5. Stopping and finishing

`systemctl --user stop fantasia-resolve` stops it. The fixer's own signal handler returns the
card it was working to `Ready` and keeps its worktree.

The run is finished when it logs `Ready has no untried card left; N card(s) worked this run` and
the unit exits. Stop the Monitor, then report the cards it worked and where each one landed,
from one board read. Cards it refused are still in `Ready` with their reason in the journal.
