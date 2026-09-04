---
id: g01-components-ui
title: Branch no caller can reach — components/UI
status: open
kind: correctness
severity: low
ready: false
origin: audit
rules:
  - G01
files:
  - src/lib/components/UI/canvas/GameCanvas.svelte
symbols:
  - src/lib/components/UI/canvas/GameCanvas.svelte::handleContextMenu#0
created: 2026-09-04
updated: 2026-09-04
---

# Branch no caller can reach — components/UI

> **Related:** [issues/README](README.md) · [tools/audit](../../tools/audit/README.md) · [rule source](../../docs/game/ARCHITECTURE.md)

## What breaks

Rule `G01` — branch no caller can reach — holds in 1 place under `components/UI`. Each one is listed below with the evidence the audit required before it would record a fail.

The clearest case: The trailing `if (isDrafted) { issueMove(); return; }` at lines 4351-4354 can never execute, because when `isDrafted` is true line 4345 has already pushed a 'Move here' entry, so the preceding `if (entries.length > 0)` at line 4347 always returns first.

## Evidence

- [`src/lib/components/UI/canvas/GameCanvas.svelte:4044`](../../src/lib/components/UI/canvas/GameCanvas.svelte#L4044) — The trailing `if (isDrafted) { issueMove(); return; }` at lines 4351-4354 can never execute, because when `isDrafted` is true line 4345 has already pushed a 'Move here' entry, so the preceding `if (entries.length > 0)` at line 4347 always returns first.
  - Branch: src/lib/components/UI/canvas/GameCanvas.svelte:4351-4354 — `if (isDrafted) { issueMove(); return; }`, the fallback that issues a bare move order when the right-click menu would be empty.
  - Guard that cannot hold: `isDrafted` (declared `const isDrafted = !!selectedPawn.drafted;` at src/lib/components/UI/canvas/GameCanvas.svelte:4097 and never reassigned inside the block). Control flow reaching line 4351 must first pass src/lib/components/UI/canvas/GameCanvas.svelte:4345 (`if (isDrafted) entries.push({ label: 'Move here', run: issueMove });`) and then src/lib/components/UI/canvas/GameCanvas.svelte:4347-4350 (`if (entries.length > 0) { equipMenu = ...; return; }`). If `isDrafted` is true at 4345 the array has at least one entry, so 4347 returns; if it is false at 4345 it is still false at 4351. Neither value of the const reaches the body at 4352.
  - Call sites: exactly one — src/lib/components/UI/canvas/GameCanvas.svelte:4392, `on:contextmenu={handleContextMenu}` on the `.canvas-wrap` div (src/lib/components/UI/canvas/GameCanvas.svelte:4375-4392). Searches run: `grep -rn "handleContextMenu|contextmenu|oncontextmenu" src/` (hits: definition at 4044, binding at 4392, plus unrelated handlers in src/routes/+page.svelte:286 and src/lib/components/screens/work/WorkPriorities.svelte:184,197,229,260) and `grep -rn "handleContextMenu" . --exclude-dir=node_modules --exclude-dir=.git` (only the definition, the binding, and prose in docs/tasks/archive/DRAFTED-JOB-ORDERS.md:44,67,95,160). `grep -rn "GameCanvas" src/tests` returned no matches, so no test invokes it. The function is not exported and appears under no string key. The sole caller is the DOM, which passes a real `MouseEvent`; the branch is unreachable for every possible event and every component state, so no caller reaches it.

## Why nothing caught it

Nothing below the judgment tier can decide this one: it is why `G01` exists at T2 rather than as a lint rule or a test. The invariant is stated in `docs/game/ARCHITECTURE.md`. If the fix makes the class mechanically checkable, add that check and demote the rule — `node tools/audit/audit.mjs demote` tracks which rules have earned it.

## Remediation

- [ ] Confirm each citation above still holds; drop any whose evidence does not.
- [ ] Fix every remaining site under `components/UI` — this is one class, one PR.
- [ ] Add the check that would have caught it, or record why it stays a judgment call.
- [ ] `pnpm check` and `pnpm test:related` on the changed files are green.

## Out of scope

Sites outside `components/UI`, and any other rule's findings — they are their own issues. Widening this PR past the citations above makes it unreviewable.
