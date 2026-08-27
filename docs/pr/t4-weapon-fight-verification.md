---
id: t4-weapon-fight-verification
status: open
branch: fix/t4-weapon-fight-verification
created: 2026-08-27
updated: 2026-08-27
issue: t4-weapon-fight-verification
base: main
verified: pass
---
# fix: Twenty tier-4 weapons and the wieldRequirement condition have never been driven through a real fight

> **Related:** [issue](../issues/t4-weapon-fight-verification.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/t4-weapon-fight-verification` is committed and green. Nothing has been pushed anywhere.

## What it reports doing

I'll wait for the test run to finish rather than poll further.

## Review it

```bash
git diff main...fix/t4-weapon-fight-verification          # the whole change
git log --oneline main..fix/t4-weapon-fight-verification  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/t4-weapon-fight-verification     # take it
git branch -D fix/t4-weapon-fight-verification          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/t4-weapon-fight-verification.md`](../issues/t4-weapon-fight-verification.md) |
| severity | medium |
| raised by | a person |
| files changed | 1 |
| verified | `check` + `test:related` green |

<details><summary>files</summary>

- `src/tests/game/systems/t4WeaponFight.test.ts`

</details>

_Written unattended by `tools/audit/fix.mjs`. The branch is local; nothing was pushed._
