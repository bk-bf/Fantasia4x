---
id: b01-components-ui
status: open
branch: fix/b01-components-ui
created: 2026-08-27
updated: 2026-08-27
issue: b01-components-ui
base: main
verified: pass
---
# fix: Raw data id rendered in the UI — components/UI

> **Related:** [issue](../issues/b01-components-ui.md) · [pr/README](README.md) · [issues/README](../issues/README.md)

`fix/b01-components-ui` is committed and green. Nothing has been pushed anywhere.

## What it reports doing

No test files reference `GameCanvas.svelte` directly (expected — it's a UI component). Both `pnpm check` and `pnpm test:related` are green.

## Summary

**Change:** `src/lib/components/UI/canvas/GameCanvas.svelte` (line ~4451, the similar-selection HUD). Replaced the hand-rolled `similarDragResourceId.replace(/_/g, ' ').toUpperCase()` with a `resourceObjectService.getById(similarDragResourceId)?.displayName` lookup, falling back to the raw id only if the lookup fails, uppercased — consistent with the `hoverDisplayResource` and other lookups already used elsewhere in this same file (e.g. lines 857, 3625).

**Citation check:** The file has since moved from `src/lib/components/UI/GameCanvas.svelte` to `src/lib/components/UI/canvas/GameCanvas.svelte` and line numbers shifted (5345/5423 → 4451), but the cited defect — the raw resource id rendered via string manipulation instead of a display-name lookup — still holds exactly as described. Fixed as the single citation.

**Scope note:** I swept `components/UI` for other `.replace(/_/g, ...)` id-humanizing patterns (found in `selectionCard.ts`, `BuildingInfo.svelte`, `BuildingStatTooltip.svelte`, `ItemStatTooltip.svelte`, other spots in `GameCanvas.svelte`). All of those already call a display-name lookup (`itemService.getItemById(id)?.name`, `getMaterialProperty(id)?.label`, etc.) and only fall back to the raw-id transform when the lookup misses — a different, defensible pattern, not "hand-rolling instead of looking up." Since the issue's evidence lists exactly one site and scopes out "any other rule's findings," I left these untouched.

**Mechanical check:** Not added. The rule's own comment proposes an ast-grep/regex detector for `id.replace('_',' ')`, and that detector (`handRolledHumanizer` flag) already exists in `tools/audit/lib/extract.mjs` — it's what routes candidates into this T2 rule for judgment. It can't be promoted to an auto-fail because the same regex matches the legitimate fallback-after-lookup pattern used throughout the other files above; distinguishing "sole source of the label" (a bug) from "fallback when the lookup misses" (fine) requires reading the surrounding expression. Recording this as staying a judgment call rather than running the demote tool.

**Verification:**
- `pnpm check` — 890 files, 0 errors, 10 warnings (all pre-existing, unrelated to this change)
- `pnpm test:related src/lib/components/UI/canvas/GameCanvas.svelte` — no test files target this component directly; exits clean (code 0)

## Review it

```bash
git diff main...fix/b01-components-ui          # the whole change
git log --oneline main..fix/b01-components-ui  # what it committed
```

Take it, or drop it:

```bash
git merge --no-ff fix/b01-components-ui     # take it
git branch -D fix/b01-components-ui          # drop it
```

## Facts

| | |
|---|---|
| issue | [`docs/issues/b01-components-ui.md`](../issues/b01-components-ui.md) |
| severity | medium |
| raised by | the audit (B01) |
| files changed | 1 |
| verified | `check` + `test:related` green |

<details><summary>files</summary>

- `rc/lib/components/UI/canvas/GameCanvas.svelte`

</details>

_Written unattended by `tools/audit/fix.mjs`. The branch is local; nothing was pushed._
