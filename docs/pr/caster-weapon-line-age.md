---
id: caster-weapon-line-age
status: open
branch: fix/caster-weapon-line-age
created: 2026-08-27
updated: 2026-08-27
issue: caster-weapon-line-age
base: main
verified: pass
---
# fix: Every staff, rod and scepter is carved on a runed bench while claiming tier 1-3, so the caster has no progression

> **Related:** [issue](../issues/caster-weapon-line-age.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/caster-weapon-line-age` is committed and green. Nothing has been pushed anywhere.

## What it reports doing

I'll pause here and wait for the background test run to finish rather than polling further.

## Review it

```bash
git diff main...fix/caster-weapon-line-age          # the whole change
git log --oneline main..fix/caster-weapon-line-age  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/caster-weapon-line-age     # take it
git branch -D fix/caster-weapon-line-age          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/caster-weapon-line-age.md`](../issues/caster-weapon-line-age.md) |
| severity | high |
| raised by | a person |
| files changed | 4 |
| verified | `check` + `test:related` green |

<details><summary>files</summary>

- `rc/lib/game/database/items/items.jsonc`
- `src/lib/game/database/items/recipes.jsonc`
- `src/tests/game/database/itemRules.test.ts`
- `src/tests/game/services/casterRodChain.test.ts`

</details>

_Written unattended by `tools/audit/fix.mjs`. The branch is local; nothing was pushed._
