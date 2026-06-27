# Fantasia4x Build Distance — VS Code status bar badge

> **Related:** [`scripts/build-distance.sh`](../../scripts/build-distance.sh) · [`scripts/hooks/pre-commit`](../../scripts/hooks/pre-commit) · [`build.sh`](../../build.sh)

A bottom-right status bar item showing how many commits have landed since the last release build
(the most recent `v*` tag — see [`.github/workflows/build.yml`](../../.github/workflows/build.yml)).
Keeps each build within 100 commits of the previous one.

- `$(git-commit) Build 49/100` — dim, under the cap.
- `$(git-commit) Build 92/100` — yellow, ≥ 90% of the cap; release soon.
- `$(warning) BUILD OVERDUE 101/100` — red; the pre-commit hook is now blocking commits.

Click the badge to refresh and (when overdue) get the exact tag command. It refreshes automatically on
every commit (watches `.git/logs/HEAD`), the instant a release is cut (`build.sh --push` touches
`.git/build-distance-refresh` once the new `v*` tag exists, so the count resets to ~0 without waiting on
the poll), when the window regains focus, and on a 30s fallback poll.

## Install

```bash
tools/vscode-build-distance/install.sh        # symlinks into ~/.vscode/extensions
# VSCodium/Cursor: pass the target dir, e.g. install.sh ~/.vscodium/extensions
```

Then run **Developer: Reload Window** in VS Code. Re-run after editing `extension.js`.

## Settings

- `fantasia4x.buildDistance.max` (default `100`) — the commit cap.
- `fantasia4x.buildDistance.pollSeconds` (default `30`) — fallback poll interval.

The badge reads `scripts/build-distance.sh --json`; that script is the single source of truth shared
with `dev.sh` and the pre-commit hook.
