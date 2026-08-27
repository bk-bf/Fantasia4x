---
id: armour-resistance-fields-dead
status: open
branch: fix/armour-resistance-fields-dead
created: 2026-08-27
updated: 2026-08-27
issue: armour-resistance-fields-dead
base: main
verified: pass
---
# fix: slashResistance, pierceResistance and crushResistance are authored on armour and read by nothing

> **Related:** [issue](../issues/armour-resistance-fields-dead.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/armour-resistance-fields-dead` is committed and green. Nothing has been pushed anywhere.

## What it reports doing

I'll wait for the Monitor notification with the test results before continuing.

## Review it

```bash
git diff main...fix/armour-resistance-fields-dead          # the whole change
git log --oneline main..fix/armour-resistance-fields-dead  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/armour-resistance-fields-dead     # take it
git branch -D fix/armour-resistance-fields-dead          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/armour-resistance-fields-dead.md`](../issues/armour-resistance-fields-dead.md) |
| severity | medium |
| raised by | a person |
| files changed | 3 |
| verified | `check` + `test:related` green |

<details><summary>files</summary>

- `ocs/game/ITEM-RULES.md`
- `src/lib/game/systems/Combat.ts`
- `src/tests/game/systems/combatSim.test.ts`

</details>

_Written unattended by `tools/audit/fix.mjs`. The branch is local; nothing was pushed._
