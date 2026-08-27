---
id: s01-game-services
status: open
branch: fix/s01-game-services
created: 2026-08-27
updated: 2026-08-27
issue: s01-game-services
base: main
verified: pass
---
# fix: Hand-maintained roster restates a declared set — game/services

> **Related:** [issue](../issues/s01-game-services.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/s01-game-services` is committed and green. Nothing has been pushed anywhere.

## What it reports doing

Waiting for the background `pnpm test:related` run to finish — I'll pick this back up once it notifies.

## Review it

```bash
git diff main...fix/s01-game-services          # the whole change
git log --oneline main..fix/s01-game-services  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/s01-game-services     # take it
git branch -D fix/s01-game-services          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/s01-game-services.md`](../issues/s01-game-services.md) |
| severity | high |
| raised by | the audit (S01) |
| files changed | 1 |
| verified | `check` + `test:related` green |

<details><summary>files</summary>

- `rc/lib/game/services/PawnStatService.ts`

</details>

_Written unattended by `tools/audit/fix.mjs`. The branch is local; nothing was pushed._
