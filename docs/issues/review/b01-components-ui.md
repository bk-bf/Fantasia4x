---
id: b01-components-ui
title: Raw data id rendered in the UI — components/UI
status: in-review
kind: boundary
severity: medium
ready: true
origin: audit
rules:
  - B01
files:
  - src/lib/components/UI/GameCanvas.svelte
symbols:
  - src/lib/components/UI/GameCanvas.svelte::<markup>#0
branch: fix/b01-components-ui
pr: b01-components-ui
created: 2026-08-24
updated: 2026-08-27
---

# Raw data id rendered in the UI — components/UI

> **Related:** [issues/README](README.md) · [tools/audit](../../tools/audit/README.md) · [rule source](../../AGENTS.md)

## What breaks

Rule `B01` — raw data id rendered in the UI — holds in 1 place under `components/UI`. Each one is listed below with the evidence the audit required before it would record a fail.

The clearest case: The similar-selection HUD renders the raw resource id by hand-replacing underscores and upper-casing it instead of looking up its display name.

## Evidence

- [`src/lib/components/UI/GameCanvas.svelte:5345`](../../src/lib/components/UI/GameCanvas.svelte#L5345) — The similar-selection HUD renders the raw resource id by hand-replacing underscores and upper-casing it instead of looking up its display name.
  - src/lib/components/UI/GameCanvas.svelte:5423
  - similarDragResourceId is a snake_case/kebab-case resource id (assigned from selectedResourceTile.resourceId at line 4773) rendered as similarDragResourceId.replace(/_/g, ' ').toUpperCase()
  - resourceObjectService.getById(id)?.displayName — already used elsewhere in this same component (e.g. the hoverDisplayResource lookup) — should be used instead of hand-rolling the id transform

## Why nothing caught it

Nothing below the judgment tier can decide this one: it is why `B01` exists at T2 rather than as a lint rule or a test. The invariant is stated in `AGENTS.md#never-leak-ids-in-the-ui`. If the fix makes the class mechanically checkable, add that check and demote the rule — `node tools/audit/audit.mjs demote` tracks which rules have earned it.

## Remediation

- [x] Confirm each citation above still holds; drop any whose evidence does not.
- [ ] Fix every remaining site under `components/UI` — this is one class, one PR.
- [x] Add the check that would have caught it, or record why it stays a judgment call.
- [x] `pnpm check` and `pnpm test:related` on the changed files are green.

## Out of scope

Sites outside `components/UI`, and any other rule's findings — they are their own issues. Widening this PR past the citations above makes it unreviewable.
