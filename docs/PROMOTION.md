# Promoting dev to main

`main` is the branch you play and build from. Nothing automated writes to it. Everything the
audit and the resolver produce lands on `dev`, and it arrives on `main` only when you run:

```bash
pnpm audit:promote --list      # what is on dev that main does not have
pnpm audit:promote             # merge it in a throwaway worktree, run the whole suite, stop
pnpm audit:promote --push      # the same, then push main and move the cards to Done
```

Without `--push` it merges `dev` into `main` in `.claude/worktrees/promote`, runs `pnpm check`
and the **entire** vitest suite there — 191 files, 1,383 tests, about seven minutes — and then
prints that worktree so you can play the merge before it exists anywhere else:

```bash
cd .claude/worktrees/promote && ./dev.sh
```

It has its own `.devport`, so it runs beside whatever is already on 5173, and `dev.sh` prints
the branch and commit it is serving. A promotion that is not green leaves `main` untouched.

## What to look at first

Most of what lands is label and roster derivation with no intended behaviour change. These are
the ones that change what the game does, so spend the spin here.

**Alchemy inputs changed across fourteen recipes.** `distilled_spirit: 0.3` became a whole
`grape_wine: 1` or `hopped_ale: 1` — salves, tinctures, antidotes, the woundwort line, the ichor
and bile potions. Every one of them now depends on the brewing chain instead of distilling, and
on whole units instead of a third. Check a potion is still craftable from what a colony has, and
that the wine and ale supply can keep up.

**Equipping consumes stock.** `equipPawnItem` now refuses when the item is not in the stockpile
and consumes it when it is; unequipping returns it. This is the largest behavioural change on the
branch. Equip and unequip a few pieces and watch the count move. Anything that refuses to equip
when it should not is this.

**Bow recipes changed.** War bow and hunting recurve take 5 and 4 `branch` instead of 1 `log`.
Confirm they are satisfiable from what an early colony actually gathers.

**Fractional recipe quantities no longer round up.** A partial take is taken as a partial, with
an epsilon on the stockpile comparisons. Watch inputs deplete by the amount you expect, and that
nothing sticks queued.

## Then sweep the panels

Ten cards rewrote how labels are produced. A wrong lookup shows as a blank label or a raw id,
not as a crash, so it needs eyes rather than tests.

- Pawn screen — attributes, traits, relations, equipment doll, stance, rest and medicine policies
- Kingdom screen — the knowledge tier wording: `strangers`, `acquainted`, `familiar`,
  `well known`, `deeply known`
- Canvas HUD — zone panel, building storage, stockpile zone, chronicle entries
- Combat log — the narration strings
- Ambience — that it plays, and that it changes between day and night
- `/gear-db` — the audit tables

## What is on dev

As of `origin/dev` after `#43`. Regenerate with `pnpm audit:promote --list`.

| # | what it does |
|---|---|
| 3 | `components/screens` — caught errors were swallowed; they are reported |
| 4 | `audio` — unreachable `isNight ? 0 : 0.15` arm removed from the ambient fallback |
| 5 | `components/pawn` — dead `*Penalty` branch in the trait effects loop removed |
| 6 | `components/screens` — unreachable branch removed |
| 7 | `components/UI` — unreachable branch removed |
| 8 | `components/util` — unreachable branch removed |
| 10 | **war bow and hunting recurve cost 5 and 4 `branch` instead of 1 `log`**, plus a rule test |
| 11 | **`equipPawnItem` refuses on empty stock and consumes the item**; scenario setup uses a separate `devEquipPawnItem` bypass |
| 12 | **fractional recipe quantities** — epsilon comparisons, partial take instead of rounding up |
| 26 | `audio` — ambient roster derived instead of hand-listed |
| 27 | `components/pawn` — roster derived across the pawn panels |
| 28 | `components/screens` — roster derived; `KNOWLEDGE_TIERS` added so labels sit beside thresholds |
| 29 | `components/UI` — roster derived across canvas and HUD |
| 30 | `components/util` — roster derived; `core/types/buildings.ts` declares the set once |
| 31 | `dev` — gear-db tables: duplicate `ARM_ORDER` dropped, `TABS` made exhaustive by type |
| 32 | `components/util` — condition labels spread from `CORE_STAT_ABBR` |
| 38 | combat balance loose ends — narration, work utils, stat view, tile storage |
| 43 | **fourteen alchemy recipes moved off `distilled_spirit` onto whole `grape_wine` / `hopped_ale`** |

## What is not on dev

**#9, heavy armour stiffness.** Its headless review measured the fix working — bare 9.14 hits
taken per 8000-tick trial against 15.31 for a full bone kit, over 16 seeds — but failed it,
because a remediation item claimed `movementPenalty` would become a load error and it did not.
`items.ts` still declares it optional and `defs/items.ts` loads the database with a raw cast, so
a new armour piece omitting the field still ships with zero stiffness. Heavy armour dodge cost is
unchanged on `dev`.

**#13, the gear grid age match.** Could not be made green; the card is back in `Ready`.
