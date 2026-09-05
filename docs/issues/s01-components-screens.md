---
id: s01-components-screens
title: Hand-maintained roster restates a declared set — components/screens
status: open
kind: drift
severity: high
ready: false
origin: audit
rules:
  - S01
files:
  - src/lib/components/screens/DebugGodmode.svelte
  - src/lib/components/screens/DebugLogScreen.svelte
  - src/lib/components/screens/DebugScreen.svelte
  - src/lib/components/screens/KingdomScreen.svelte
  - src/lib/components/screens/PawnScreen.svelte
  - src/lib/components/screens/culture/CultureDetail.svelte
symbols:
  - src/lib/components/screens/DebugGodmode.svelte::NEEDS#0
  - src/lib/components/screens/DebugGodmode.svelte::STAT_KEYS#0
  - src/lib/components/screens/DebugLogScreen.svelte::SEVERITIES#0
  - src/lib/components/screens/DebugScreen.svelte::TABS#0
  - src/lib/components/screens/KingdomScreen.svelte::ACQUAINTANCE#0
  - src/lib/components/screens/PawnScreen.svelte::TABS#0
  - src/lib/components/screens/culture/CultureDetail.svelte::STAT_ORDER#0
created: 2026-09-04
updated: 2026-09-05
---

# Hand-maintained roster restates a declared set — components/screens

> **Related:** [issues/README](README.md) · [tools/audit](../../tools/audit/README.md) · [rule source](../../docs/issues/core-stat-single-source.md)

## What breaks

Rule `S01` — hand-maintained roster restates a declared set — holds in 7 places under `components/screens`. Each one is listed below with the evidence the audit required before it would record a fail.

The clearest case: NEEDS hand-writes 7 of the 8 members of the `DisableableNeed` union, omitting 'comfort', so the godmode panel offers no toggle for a need the sim already honours and any new union member stays invisible.

## Evidence

- [`src/lib/components/screens/DebugGodmode.svelte:10`](../../src/lib/components/screens/DebugGodmode.svelte#L10) — NEEDS hand-writes 7 of the 8 members of the `DisableableNeed` union, omitting 'comfort', so the godmode panel offers no toggle for a need the sim already honours and any new union member stays invisible.
  - src/lib/components/screens/DebugGodmode.svelte:10-18 — hand-written list of 7 entries typed `Array<{ key: DisableableNeed; label: string }>`, rendered by `{#each NEEDS as n (n.key)}` at src/lib/components/screens/DebugGodmode.svelte:70; no test names it (`grep -rn "Godmode\|godmode" src/tests` returns nothing, `grep -rn "NEEDS\b"` hits only lines 10 and 70 of this file).
  - The set is declared at src/lib/game/core/types/gamestate.ts:25-32 as `export type DisableableNeed = 'hunger' | 'fatigue' | 'thirst' | 'hygiene' | 'wetness' | 'relaxation' | 'comfort' | 'mobHunger'` — 8 members. NEEDS lists all but 'comfort'.
  - 'comfort' is a working toggle everywhere else: `devToggleNeed` writes any `DisableableNeed` key into `_needsDisabled` (src/lib/game/sim/commands.ts:1435-1440), and the per-tick needs update reads it as `const disComfort = dis?.comfort === true` (src/lib/game/services/PawnService.ts:350). Because NEEDS omits it, the debug screen never emits `devToggleNeed` with `need: 'comfort'`, so comfort decay cannot be switched off from the UI even though the sim supports it — reachable only through a headless scenario's `needsDisabled` (src/lib/game/headless/Scenario.ts:53). Adding a ninth member to the union compiles clean and adds no checkbox.
- [`src/lib/components/screens/DebugGodmode.svelte:20`](../../src/lib/components/screens/DebugGodmode.svelte#L20) — STAT_KEYS hand-writes all six members of the EntityStats interface, so a seventh stat added to EntityStats would silently be missing from the godmode stat dropdown.
  - src/lib/components/screens/DebugGodmode.svelte:19-26 — `const STAT_KEYS: StatKey[] = ['strength','dexterity','intelligence','perception','charisma','constitution']`, consumed only at src/lib/components/screens/DebugGodmode.svelte:86 `{#each STAT_KEYS as k (k)}<option value={k}>{k}</option>{/each}`
  - The set is declared at src/lib/game/core/types/culture.ts:3-10 (`export interface EntityStats` with fields strength, dexterity, intelligence, perception, charisma, constitution) and aliased at src/lib/game/core/types/culture.ts:12 (`export type StatKey = keyof EntityStats`); the list restates all six by hand rather than deriving them. Grep `STAT_KEYS` over src/tests returned only src/tests/game/core/traitRegistry.test.ts:12, which builds its own unrelated local Set and asserts nothing about this array, so no test asserts completeness. Grep `EntityStats` over src/tests returned only Partial<EntityStats> fixtures (e.g. src/tests/game/systems/weaponMetaHarness.ts:9), no exhaustiveness check.
  - Adding a seventh field to EntityStats (the same edit that widens StatKey) leaves DebugGodmode.svelte:19-26 six-long. `StatKey[]` accepts a short array, so tsc reports nothing. The dropdown at DebugGodmode.svelte:86 then renders six options and the `devSetPawnStats` command wired at DebugGodmode.svelte:47 (`cmd('devSetPawnStats', { pawnId, stats: { [statKey]: statValue } })`) can never be issued for the new stat. src/lib/game/services/PawnGrowthService.ts:14-21 and src/lib/game/entities/Pawns.ts:711 repeat the same hand-written roster, so the same edit desynchronises three copies at once.
- [`src/lib/components/screens/DebugLogScreen.svelte:13`](../../src/lib/components/screens/DebugLogScreen.svelte#L13) — SEVERITIES hand-writes every member of the ActivityLogEntry['severity'] union, so a new severity added to the type gets no filter option in the debug log screen.
  - src/lib/components/screens/DebugLogScreen.svelte:13 — `const SEVERITIES = ['ALL', 'critical', 'error', 'warning', 'success', 'info'] as const;`, passed to the controls at src/lib/components/screens/DebugLogScreen.svelte:86 (`severities={SEVERITIES}`); grep for `SEVERITIES` across `src` returns only these two lines, and grep for it in `src/tests` returns nothing, so no test asserts completeness.
  - The set is declared as the union `severity: 'info' | 'success' | 'warning' | 'error' | 'critical';` on `ActivityLogEntry` at src/lib/game/core/defs/events.ts:69; the entries rendered here come from that type (src/lib/stores/Log.ts:3 imports `ActivityLogEntry`, src/lib/stores/Log.ts:128 `export const debugLog = writable<ActivityLogEntry[]>([])`). The five non-`ALL` strings are exactly the five union members in reverse order, and the list is not derived from the source — contrast `knownTags` on src/lib/components/screens/DebugLogScreen.svelte:28, which is computed at runtime from the entries.
  - Add a sixth member to the union at src/lib/game/core/defs/events.ts:69 (say `'debug'`) and emit entries with it: the filter at src/lib/components/screens/DebugLogScreen.svelte:35 (`if (filterSeverity !== 'ALL') out = out.filter((e) => e.severity === filterSeverity)`) still works, but the dropdown fed by SEVERITIES never offers `debug`, so those entries are only ever visible under `ALL` and can never be isolated. TypeScript does not flag it — the array is a literal of strings, not typed against the union — and the `$effect` at src/lib/components/screens/DebugLogScreen.svelte:45 that resets a stale filter covers `filterTag` only, not `filterSeverity`.
- [`src/lib/components/screens/DebugScreen.svelte:9`](../../src/lib/components/screens/DebugScreen.svelte#L9) — `TABS` hand-writes the two members of the `DebugTab` union declared three lines above, and nothing makes the array exhaustive, so a third tab id would compile with no button rendered for it.
  - src/lib/components/screens/DebugScreen.svelte:9-12 — `const TABS: { id: DebugTab; label: string }[] = [{ id: 'menu', label: 'MENU' }, { id: 'log', label: 'LOG' }]`, an array literal typed as a list of `DebugTab`, not as a total mapping over it.
  - The set is declared at src/lib/components/screens/DebugScreen.svelte:6 — `type DebugTab = 'menu' | 'log';`. That union is the canonical membership list; it is used at src/lib/components/screens/DebugScreen.svelte:7 for `activeTab` and at :9 for `TABS[].id`. Greps run: `grep -rn "DebugTab" src/` returns hits only inside this file (the only other `DebugScreen` hits are the import and usage at src/routes/+page.svelte:14 and src/routes/+page.svelte:362); `grep -rn "DebugScreen|debug.tab" src/tests/` returns nothing, so no test asserts the list is complete.
  - Adding a member, e.g. `type DebugTab = 'menu' | 'log' | 'perf'`, still type-checks: an array of `{id: DebugTab}` has no exhaustiveness requirement. `{#each TABS as tab}` at src/lib/components/screens/DebugScreen.svelte:17 then renders only MENU and LOG, so no button ever sets `activeTab` to `'perf'`; and because src/lib/components/screens/DebugScreen.svelte:27-31 branches `{#if activeTab === 'menu'} <DebugMenu /> {:else} <DebugLogScreen />`, a `'perf'` value restored from the persisted key `'debug.tab'` (src/lib/components/screens/DebugScreen.svelte:7) would silently show the log screen with no tab highlighted. A `Record<DebugTab, string>` label map, or a `satisfies` check tying the array to every union member, would make the compiler catch it.
- [`src/lib/components/screens/KingdomScreen.svelte:16`](../../src/lib/components/screens/KingdomScreen.svelte#L16) — ACQUAINTANCE is a hand-written 5-entry label list positionally tied to KNOWLEDGE_TIER_THRESHOLDS in another file, with no type or test linking their lengths.
  - src/lib/components/screens/KingdomScreen.svelte:16 — `const ACQUAINTANCE = ['strangers', 'acquainted', 'familiar', 'well known', 'deeply known'];`, an untyped `string[]` of 5 entries, indexed at src/lib/components/screens/KingdomScreen.svelte:87 by `ACQUAINTANCE[knowledgeTier(kingdom.knowledge)]`.
  - The set of tiers is declared at src/lib/game/core/gen/kingdom.ts:91 — `export const KNOWLEDGE_TIER_THRESHOLDS = [0, 25, 60, 110, 180];` — and `knowledgeTier` (src/lib/game/core/gen/kingdom.ts:93-102) returns an index into that array, so its range is 0..KNOWLEDGE_TIER_THRESHOLDS.length-1. Nothing derives ACQUAINTANCE from it: `grep -rn "ACQUAINTANCE" src` returns only src/lib/components/screens/KingdomScreen.svelte:16 and :87. `grep -rn "ACQUAINTANCE" src/tests/` returns nothing, so no test asserts the two are the same length; src/tests/game/core/Kingdom.test.ts:86-92 only checks that `knowledgeTier` walks 0→4 and never names the label list. The repo's own pattern for a label per member is WEALTH_BAND_LABEL at src/lib/game/core/gen/kingdom.ts:112, a `Record<WealthBand, string>` the compiler checks for exhaustiveness; ACQUAINTANCE has no such tie.
  - Add a sixth threshold to KNOWLEDGE_TIER_THRESHOLDS (e.g. `[0, 25, 60, 110, 180, 260]`) and `knowledgeTier` starts returning 5. `ACQUAINTANCE[5]` is `undefined`, and TypeScript raises nothing because indexing a `string[]` with a `number` is typed `string`. The kingdom list row at src/lib/components/screens/KingdomScreen.svelte:87 then renders the literal text `undefined` in the `.ki-tier` span for every kingdom at the top tier. Removing a threshold is silent in the other direction: the last label becomes unreachable dead text.
- [`src/lib/components/screens/PawnScreen.svelte:31`](../../src/lib/components/screens/PawnScreen.svelte#L31) — TABS hand-writes all four members of the `PawnTab` union with no exhaustiveness link, so a fifth tab id added to the union (and to uiState's copy of it) renders no tab button.
  - src/lib/components/screens/PawnScreen.svelte:31-36 — `const TABS: { id: PawnTab; label: string }[]` lists 'status', 'attributes', 'relations', 'gear' literally; the array type is `PawnTab[]`-element, not a `Record<PawnTab, string>`, so TypeScript never checks that every union member appears.
  - The set is declared as a union type: src/lib/components/screens/PawnScreen.svelte:27 `type PawnTab = 'status' | 'attributes' | 'relations' | 'gear';`, restated a third time in src/lib/stores/uiState.ts:31 (`pawnScreenTab: 'status' | 'attributes' | 'relations' | 'gear' | null`) and src/lib/stores/uiState.ts:130 (`setPawnTab` parameter). No test asserts TABS is complete — `grep -rln "PawnScreen\|PawnTab\|'attributes'" src/tests` returned nothing.
  - Add a fifth id, e.g. 'skills', to the union at PawnScreen.svelte:27 and to uiState.ts:31/130 and the build stays green while TABS still has four entries. The `{#each TABS as tab}` nav at src/lib/components/screens/PawnScreen.svelte:103-111 then renders no button for it, so the tab is unreachable by clicking. It is still reachable programmatically — src/lib/components/UI/canvas/selectionCard.ts:579,610 set `pawnScreenTab` and src/lib/components/screens/PawnScreen.svelte:60-64 assigns it to `activeTab` — at which point every branch of the content chain at PawnScreen.svelte:114-131 is false, so the panel body is blank and no tab in the bar shows as active, with no way back except selecting another tab that does exist.
- [`src/lib/components/screens/culture/CultureDetail.svelte:11`](../../src/lib/components/screens/culture/CultureDetail.svelte#L11) — STAT_ORDER hand-writes all six keys of the EntityStats interface, so a seventh stat added there would never appear in the culture stat panel.
  - src/lib/components/screens/culture/CultureDetail.svelte:11-18 — const STAT_ORDER = ['strength','dexterity','constitution','intelligence','perception','charisma']; it is not a subset, it is every member, reordered.
  - The set is declared at src/lib/game/core/types/culture.ts:3-10 as `interface EntityStats { strength; dexterity; intelligence; perception; charisma; constitution }`, with the key union exported at src/lib/game/core/types/culture.ts:12 as `export type StatKey = keyof EntityStats`. The value this list indexes, `Culture.statRanges`, is declared at src/lib/game/core/types/culture.ts:167 as `Record<string, [number, number]>`, so TypeScript cannot flag a missing key here.
  - The template iterates only STAT_ORDER: src/lib/components/screens/culture/CultureDetail.svelte:100-116 renders one StatBar per entry, guarded by `{#if culture.statRanges[stat]}`. Add a seventh stat to EntityStats and populate its range in the culture generator (src/lib/game/core/gen/culture.ts:39 keeps its own parallel hand-list of the same six), and the culture panel silently drops that stat's range — no type error, no runtime error, just a missing row, while the same culture's generated stat range exists in the data. Nothing asserts the list's completeness: `grep -rn "CultureDetail" src` returns one hit, the import at src/lib/components/screens/CultureScreen.svelte:5, and `grep -rn "keyof EntityStats|StatKey" src/tests` returns only weaponPawnFitHarness.ts:39 and creatureMatchupHarness.ts:84, neither of which checks a roster.

## Why nothing caught it

Nothing below the judgment tier can decide this one: it is why `S01` exists at T2 rather than as a lint rule or a test. The invariant is stated in `docs/issues/core-stat-single-source.md`. If the fix makes the class mechanically checkable, add that check and demote the rule — `node tools/audit/audit.mjs demote` tracks which rules have earned it.

## Remediation

- [ ] Confirm each citation above still holds; drop any whose evidence does not.
- [ ] Fix every remaining site under `components/screens` — this is one class, one PR.
- [ ] Add the check that would have caught it, or record why it stays a judgment call.
- [ ] `pnpm check` and `pnpm test:related` on the changed files are green.

## Out of scope

Sites outside `components/screens`, and any other rule's findings — they are their own issues. Widening this PR past the citations above makes it unreviewable.
