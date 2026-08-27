---
id: armour-coverage-holes
status: open
branch: fix/armour-coverage-holes
created: 2026-08-27
updated: 2026-08-27
issue: armour-coverage-holes
base: main
verified: pass
---
# fix: Medium armour has no stiffness identity and no neck, hands or feet line at any age, and the shield ladder stops at steel

> **Related:** [issue](../issues/armour-coverage-holes.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/armour-coverage-holes` is committed and green. Nothing has been pushed anywhere.

## What it reports doing

Both green. Here's the account of the work.

## What I found before touching anything

I verified (by parsing `items.jsonc`/`recipes.jsonc` directly and replicating the coverage test's exact reachability logic, not by trusting the issue's prose) that two of the three Remediation items were **already fixed** in this worktree, by work landed after the issue was filed on 2026-08-25:

- **Medium neck/hands/feet line**: `copper_scale_gloves/shoes`, `boar_gloves/boots`, `iron_gauntlets/shod_boots`, `munition_half_plate_gloves/boots`, `rune_stitched_gloves/boots` all exist, are craftable, and are correctly gated. A script computing per-class, per-region reachability by age confirms medium has zero gaps from the copper age onward (only stone age is short, which is correct — medium and heavy don't exist pre-metal by design). "Neck" was never a real slot; `head` already covers it and that's separately tested and passing.
- **Runed shield**: `rune_graven_kite` (tier 4) with recipe `make_rune_graven_kite` already sits immediately after `make_steel_heater_shield` in `recipes.jsonc` (current lines 7263–7285). The issue's citation of line 7504 for the steel recipe is stale — line numbers shifted from unrelated edits, and the runed successor was added in that same pass.

I skipped these two per the harness instructions ("if a citation no longer holds, say so and skip it").

## What was still real, and what I changed

**Iron-age medium stiffness collision (confirmed).** `mail_coif`, `iron_bracers`, `iron_gauntlets`, and `iron_greaves` all had `movementPenalty: 0.0`, identical to their light equivalents (`wolf_head`/`elk_head`, `wolf_bracers`, `wolf_gloves`, `wolf_greaves`) at the same age. Every other age's medium glove sits at `0.02` (bronze `boar_gloves`, steel `munition_half_plate_gloves`, runed `rune_stitched_gloves` all `0.02`) and iron was the sole outlier at `0.0`; the iron-age head, bracers and greaves showed the same flat collision. `iron_shod_boots` (`0.06`) already distinguished from light boots, so I left it alone.

I set `movementPenalty: 0.02` on those four `iron_mail` pieces — a value that sits between light (`0.0`) and heavy `iron_plate` (`0.05` on bracers/greaves/bodyOuter), and matches the `0.02` medium-glove band used at every other age.

**Coverage test strengthened (`armourCoverage.test.ts`).** Added a new `describe` block, `every tech age dresses each weight class in its own gear`, that checks light and medium separately against six regions (head/torso/arms/hands/legs/feet, using each class's own torso slot — `bodyBase` for light, `bodyMid` for medium) instead of the old any-class-satisfies-the-region check. Heavy is intentionally excluded: ITEM-RULES documents heavy sets as "deliberately incomplete" (no gloves/boots before steel, padded from light/medium), so a strict 6-region requirement would be a false failure for heavy, not a real hole. `AGE_BY_RESEARCH`/`AGE_NAMES`/`gateOf` were hoisted to module scope so both describe blocks share one definition. Result: 22 tests now (11 original + 11 new), all green — a future PR that reintroduces a medium- or light-specific hole and lets it be papered over by a borrowed fallback will now fail here.

## Remediation items not done, and why

- **Author medium neck/hands/feet line** — already exists; nothing to author.
- **Author a runed-tier shield** — already exists; nothing to author.
- **Headless-verify one new piece per line** — no new pieces were authored (both lines above were already closed), so there's no "new piece" to run through the headless sim. The existing `armourChain.test.ts` (unchanged by me, still green) already headless-verifies the two limb pieces I did touch: `pawns craft the iron limb line at an anvil` drives real ticks through `HeadlessSession` and reports `turn=1200 bracers=1 greaves=1 (iron_bar 27/30)` — confirming `iron_bracers` and `iron_greaves` still craft and equip correctly with the new `movementPenalty`.

## Verification run

```
npx vitest run src/tests/game/database/itemRules.test.ts \
                src/tests/game/database/armourCoverage.test.ts \
                src/tests/game/database/gearSorting.test.ts \
                src/tests/game/services/armourChain.test.ts
→ 4 files, 87 tests, all passed

pnpm check
→ svelte-check: 890 files, 0 errors, 10 pre-existing warnings (unrelated files)

pnpm test:related src/lib/game/database/items/items.jsonc src/tests/game/database/armourCoverage.test.ts
→ 162 files, 1206 tests, all passed
```

Files changed: `src/lib/game/database/items/items.jsonc` (4 `movementPenalty` values), `src/tests/game/database/armourCoverage.test.ts` (new per-class coverage check). Nothing under `docs/issues/` was touched.

## Review it

```bash
git diff main...fix/armour-coverage-holes          # the whole change
git log --oneline main..fix/armour-coverage-holes  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/armour-coverage-holes     # take it
git branch -D fix/armour-coverage-holes          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/armour-coverage-holes.md`](../issues/armour-coverage-holes.md) |
| severity | medium |
| raised by | a person |
| files changed | 2 |
| verified | `check` + `test:related` green |

<details><summary>files</summary>

- `rc/lib/game/database/items/items.jsonc`
- `src/tests/game/database/armourCoverage.test.ts`

</details>

_Written unattended by `tools/audit/fix.mjs`. The branch is local; nothing was pushed._
