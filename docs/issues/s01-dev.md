---
id: s01-dev
title: Hand-maintained roster restates a declared set — dev
status: open
kind: drift
severity: high
ready: false
origin: audit
rules:
  - S01
files:
  - src/lib/dev/AuditTables.svelte
symbols:
  - src/lib/dev/AuditTables.svelte::ARM_ORDER#0
  - src/lib/dev/AuditTables.svelte::TABS#0
created: 2026-09-04
updated: 2026-09-04
---

# Hand-maintained roster restates a declared set — dev

> **Related:** [issues/README](README.md) · [tools/audit](../../tools/audit/README.md) · [rule source](../../docs/issues/core-stat-single-source.md)

## What breaks

Rule `S01` — hand-maintained roster restates a declared set — holds in 2 places under `dev`. Each one is listed below with the evidence the audit required before it would record a fail.

The clearest case: ARM_ORDER hand-writes the four armour-bucket keys that are declared canonically as the keys of the ARMOUR record in the creature-matchup harness, so a fifth bucket added there would sort as -1 here.

## Evidence

- [`src/lib/dev/AuditTables.svelte:170`](../../src/lib/dev/AuditTables.svelte#L170) — ARM_ORDER hand-writes the four armour-bucket keys that are declared canonically as the keys of the ARMOUR record in the creature-matchup harness, so a fifth bucket added there would sort as -1 here.
  - src/lib/dev/AuditTables.svelte:170 — `const ARM_ORDER = ['none', 'light', 'medium', 'heavy'];`, used only at src/lib/dev/AuditTables.svelte:185 as the sort key `get: (r) => ARM_ORDER.indexOf(r.armour)` for the 'pawn wearing' column of `matchupCols` (`grep -rn "ARM_ORDER" src/ tools/` returns exactly these two lines plus audit-ledger scratch files).
  - The set is declared at src/tests/game/systems/creatureMatchupHarness.ts:32-43 as `export const ARMOUR: Record<string, string[]>` with keys `none`, `light`, `medium`, `heavy`, and derived at src/tests/game/systems/creatureMatchupHarness.ts:44 as `export const ARMOUR_KEYS = Object.keys(ARMOUR)`. Those keys are what lands in the row field: src/tests/game/systems/creatureMatchupHarness.ts:240 loops `for (const a of ARMOUR_KEYS)` and src/tests/game/systems/creatureMatchupHarness.ts:216 writes `armour: armourKey` into each `Matchup`; those rows reach the component through the `kind === 'creatures'` branch at src/routes/gear-db/+page.server.ts:57-59 into `audit.creatures` (src/routes/gear-db/+page.server.ts:66), typed `CreatureRow.armour: string` at src/lib/dev/AuditTables.svelte:25. The same four strings are also hand-written a second time in this file at src/lib/dev/AuditTables.svelte:45 (`ARMOUR_ORDER`).
  - Adding a bucket to `ARMOUR` — say `shield: ['wooden_buckler']` at src/tests/game/systems/creatureMatchupHarness.ts:43 — makes the harness emit rows with `armour: 'shield'`. `ARM_ORDER.indexOf('shield')` returns -1, so every shield row sorts as -1, ahead of `none` (0), and the whole shield group collapses into one indistinguishable sort position in the 'pawn wearing' column while still displaying its own label via `disp: (r) => r.armour`. No test asserts the list's completeness: `grep -rn "ARM_ORDER" src/tests` returns nothing, and `grep -rn "AuditTables\|dev/Audit" src static tools` returns no importer of the component at all, so nothing currently renders or exercises this list — the breakage is latent until it is mounted.
- [`src/lib/dev/AuditTables.svelte:402`](../../src/lib/dev/AuditTables.svelte#L402) — TABS hand-writes all five members of the `Tab` union declared at src/lib/dev/AuditTables.svelte:52, and its array type only rejects unknown keys — it never requires the list to be complete, so a sixth union member leaves the tab bar short with no compile error.
  - src/lib/dev/AuditTables.svelte:402-408 — `const TABS: { key: Tab; label: string }[] = [...]` lists 'creatures', 'byCreature', 'fit', 'styles', 'move' by hand.
  - The set is declared at src/lib/dev/AuditTables.svelte:52 — `type Tab = 'creatures' | 'byCreature' | 'fit' | 'styles' | 'move';`. `grep -rn "byCreature" src tools` returns only three hits in this file: :52 (the union), :404 (the TABS entry) and :443 (the `{:else if tab === 'byCreature'}` render branch); `grep -rn "AuditTables\|'byCreature'" src/tests` returns nothing, so no test asserts the roster is complete, and the list is not derived from the union at runtime.
  - Concretely: add a sixth member (say 'ranges') to the union at :52 and TypeScript still accepts TABS at :402-408 with five entries, because `{ key: Tab; label: string }[]` constrains each key to be a member but never demands every member appear. The `{#each TABS as t}` loop at :419 then renders no button for 'ranges', so the tab is unreachable in the UI; and because the render chain at :437-473 ends in a bare `{:else}` at :467 rather than `{:else if tab === 'move'}`, if `tab` were ever set to 'ranges' the panel would silently show the 'move' movement table instead. A `Record<Tab, string>` (or `satisfies Record<Tab, ...>`) would turn both into compile errors.

## Why nothing caught it

Nothing below the judgment tier can decide this one: it is why `S01` exists at T2 rather than as a lint rule or a test. The invariant is stated in `docs/issues/core-stat-single-source.md`. If the fix makes the class mechanically checkable, add that check and demote the rule — `node tools/audit/audit.mjs demote` tracks which rules have earned it.

## Remediation

- [ ] Confirm each citation above still holds; drop any whose evidence does not.
- [ ] Fix every remaining site under `dev` — this is one class, one PR.
- [ ] Add the check that would have caught it, or record why it stays a judgment call.
- [ ] `pnpm check` and `pnpm test:related` on the changed files are green.

## Out of scope

Sites outside `dev`, and any other rule's findings — they are their own issues. Widening this PR past the citations above makes it unreviewable.
