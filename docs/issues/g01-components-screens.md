---
id: g01-components-screens
title: Branch no caller can reach — components/screens
status: open
kind: correctness
severity: low
ready: false
origin: audit
rules:
  - G01
files:
  - src/lib/components/screens/BuildingMenu.svelte
  - src/lib/components/screens/ResearchScreen.svelte
symbols:
  - src/lib/components/screens/BuildingMenu.svelte::getBuildingSpecialProperties#0
  - src/lib/components/screens/ResearchScreen.svelte::getCategoryIcon#0
created: 2026-09-04
updated: 2026-09-04
---

# Branch no caller can reach — components/screens

> **Related:** [issues/README](README.md) · [tools/audit](../../tools/audit/README.md) · [rule source](../../docs/game/ARCHITECTURE.md)

## What breaks

Rule `G01` — branch no caller can reach — holds in 2 places under `components/screens`. Each one is listed below with the evidence the audit required before it would record a fail.

The clearest case: `getBuildingSpecialProperties` has no call site anywhere in the repository, so every one of its seven property branches is unreachable, and the seven fields it guards on are also never set by any building data entry.

## Evidence

- [`src/lib/components/screens/BuildingMenu.svelte:225`](../../src/lib/components/screens/BuildingMenu.svelte#L225) — `getBuildingSpecialProperties` has no call site anywhere in the repository, so every one of its seven property branches is unreachable, and the seven fields it guards on are also never set by any building data entry.
  - All seven push branches: `props.populationCapacity` (src/lib/components/screens/BuildingMenu.svelte:231), `props.knowledgeGeneration` (:232), `props.foodProduction` (:234), `props.defensiveStrength` (:235), `props.craftingSpeed` (:236), `props.tradeBonus` (:238), `props.magicalPower` (:240) — plus the enclosing `if (building.buildingProperties)` at :228.
  - The guards cannot hold because the function body never executes: it is a plain `function` declaration inside the `<script>` block of src/lib/components/screens/BuildingMenu.svelte, not exported, and it is never invoked from that script or referenced in that component's markup. Independently, no building in the data file ever sets any of the seven fields — every `buildingProperties` object in src/lib/game/database/world/buildings.jsonc uses only `gathering`/`gatheringLevel` (lines 22, 51, 876, 1704) or `seat` (lines 896, 1546, 1566, 1586, 1606, 1626, 1646, 1666), so even a hypothetical caller passing a database building would satisfy none of the seven guards, while the type at src/lib/game/core/types/buildings.ts:152-179 does declare all of them as optional.
  - Call sites checked: none exist. Searches run: `grep -rn "getBuildingSpecialProperties" . --exclude-dir=node_modules --exclude-dir=.git` → one hit, the definition itself at src/lib/components/screens/BuildingMenu.svelte:225; `grep -rni "SpecialProperties" src` (case-insensitive, catches a differently-cased string key or re-export) → the same single hit; `grep -rn "buildingProperties" . --exclude-dir=node_modules --exclude-dir=.git` → readers of the field elsewhere (src/lib/game/systems/ModifierSystem.ts:339-340, src/lib/components/UI/tooltip/BuildingStatTooltip.svelte:86, src/lib/game/core/defs/amenities.ts:19,53, src/lib/game/systems/pawn/pawnHelpers.ts:392, src/lib/game/systems/pawn/handlers/needs.ts:322), none of which call this function; `grep -rn "BuildingMenu" src docs` → the component is mounted at src/routes/+page.svelte:8,348, which reaches the component but not this function. No hit in src/tests, no dev route, no string-key or re-export reference.
- [`src/lib/components/screens/ResearchScreen.svelte:40`](../../src/lib/components/screens/ResearchScreen.svelte#L40) — getCategoryIcon has no call sites anywhere in the repository, so every branch of its switch — including the `default` — is unreachable.
  - The branch: all seven branches at src/lib/components/screens/ResearchScreen.svelte:41-56 — `case 'knowledge'` (line 42-43), `case 'crafting'` (44-45), `case 'building'` (46-47), `case 'military'` (48-49), `case 'exploration'` (50-51), `case 'social'` (52-53) and `default` (54-55).
  - The guard that cannot hold: the switch discriminant `category` (src/lib/components/screens/ResearchScreen.svelte:41). No value of `category` is ever supplied, because the function is never invoked; the switch is never entered.
  - Call sites checked: none exist. Searches run: `grep -rn "getCategoryIcon" . --exclude-dir=node_modules --exclude-dir=.git` returned exactly one line, the declaration itself at src/lib/components/screens/ResearchScreen.svelte:40 — no call, no string key, no re-export. `grep -rn "CategoryIcon\|categoryIcon" . --exclude-dir=node_modules --exclude-dir=.git` returned only that same declaration plus an unrelated local map `categoryIcons` in src/lib/game/services/BuildingService.ts:593 and its use at src/lib/game/services/BuildingService.ts:603, which reference a different symbol. Within the owning file, `grep -n "getCategoryIcon\|Icon(" src/lib/components/screens/ResearchScreen.svelte` over all 408 lines returned only line 40, and `grep -n` for each returned emoji (📚 ⚒️ 🏗️ ⚔️ 🗺️ 👥 🔬) matched only lines 43, 45, 47, 49, 51, 53 and 55 inside the function body — the template never renders any of them. The symbol is declared in an instance `<script lang="ts">` block without `export`, so it is module-local and has no import path; the component's only consumer imports the component, not the function (src/routes/+page.svelte:9, rendered at src/routes/+page.svelte:358). No test, headless scenario or dev route reaches it: the repo-wide grep above covered src/tests and tools as well and produced no other hit.

## Why nothing caught it

Nothing below the judgment tier can decide this one: it is why `G01` exists at T2 rather than as a lint rule or a test. The invariant is stated in `docs/game/ARCHITECTURE.md`. If the fix makes the class mechanically checkable, add that check and demote the rule — `node tools/audit/audit.mjs demote` tracks which rules have earned it.

## Remediation

- [ ] Confirm each citation above still holds; drop any whose evidence does not.
- [ ] Fix every remaining site under `components/screens` — this is one class, one PR.
- [ ] Add the check that would have caught it, or record why it stays a judgment call.
- [ ] `pnpm check` and `pnpm test:related` on the changed files are green.

## Out of scope

Sites outside `components/screens`, and any other rule's findings — they are their own issues. Widening this PR past the citations above makes it unreviewable.
