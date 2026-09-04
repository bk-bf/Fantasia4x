---
id: g01-components-pawn
title: Branch no caller can reach — components/pawn
status: open
kind: correctness
severity: low
ready: false
origin: audit
rules:
  - G01
files:
  - src/lib/components/pawn/TraitCards.svelte
symbols:
  - src/lib/components/pawn/TraitCards.svelte::getEffectTags#0
created: 2026-09-04
updated: 2026-09-04
---

# Branch no caller can reach — components/pawn

> **Related:** [issues/README](README.md) · [tools/audit](../../tools/audit/README.md) · [rule source](../../docs/game/ARCHITECTURE.md)

## What breaks

Rule `G01` — branch no caller can reach — holds in 1 place under `components/pawn`. Each one is listed below with the evidence the audit required before it would record a fail.

The clearest case: The `*Penalty` arm of the effects loop cannot fire: every Trait reaching `getEffectTags` is an object read from `traits.jsonc`, whose `effects` blocks contain no key ending in `Penalty`, and the `Trait['effects']` type declares none.

## Evidence

- [`src/lib/components/pawn/TraitCards.svelte:173`](../../src/lib/components/pawn/TraitCards.svelte#L173) — The `*Penalty` arm of the effects loop cannot fire: every Trait reaching `getEffectTags` is an object read from `traits.jsonc`, whose `effects` blocks contain no key ending in `Penalty`, and the `Trait['effects']` type declares none.
  - Branch: src/lib/components/pawn/TraitCards.svelte:259-268 — `} else if (name.endsWith('Penalty') && typeof value === 'number') { const stat = name.replace('Penalty',''); tags.push({label: STAT_ABBR[stat] ?? stat, value: `-${value}`, type: 'neg', kind: 'attr', statId: stat}); }`
  - Guard that cannot hold: `name.endsWith('Penalty') && typeof value === 'number'`, where `name` iterates `Object.entries(trait.effects || {})` (src/lib/components/pawn/TraitCards.svelte:249). No trait object in the repo carries an effects key ending in `Penalty`: `grep -o '"[A-Za-z_]*Penalty"' src/lib/game/database/pawns/traits.jsonc | sort | uniq -c` returns only `19 "carryPenalty"`, and `carryPenalty` is a top-level trait field, not inside `effects` (src/lib/game/database/pawns/traits.jsonc:525-526, where `"carryPenalty": 0.06` sits beside `"effects": {}`). The declared type has no such key either: `Trait['effects']` lists only `*Bonus`, `workSpeed`/`workYield`/`workQuality`, `combatMods`, the resistances, `healRate`, `nightVision`, `stealth` (src/lib/game/core/types/culture.ts:111-141). src/tests/game/systems/t4WeaponAudit.test.ts:149-153 asserts `expect(leftovers, 'no `*Penalty` key survives in traits.jsonc').toEqual([])`, so the data is held to that shape.
  - Call sites checked: `grep -rn "getEffectTags" src/ docs/` returns exactly two lines — the definition at src/lib/components/pawn/TraitCards.svelte:173 and the single call at src/lib/components/pawn/TraitCards.svelte:333 (`{@const tags = getEffectTags(trait)}`, `trait` from the `traits` prop). `grep -rn "TraitCards" src/` returns only two importers, both components, no test and no dev route: src/lib/components/pawn/PawnTraits.svelte:11 passes `pawn.traits`, and src/lib/components/screens/culture/CultureDetail.svelte:122-123 passes `[...culture.guaranteedTraits, ...culture.culturalTraitPool]`. Both are references into traits.jsonc: src/lib/game/core/gen/culture.ts:2,7 (`TRAIT_DATABASE: Trait[] = traitDbData`), src/lib/game/core/defs/lineages.ts:1,20-21,47 (`getTraitById` reads `TRAIT_BY_ID`, built from the same import), and the only runtime additions to `pawn.traits` push those same objects (src/lib/game/entities/Pawns.ts:339-341, src/lib/game/core/defs/lineages.ts:253,267). `grep -rn "effects: {" src/lib --include="*.ts" --include="*.svelte"` finds no code that builds a Trait with a fresh effects object — the two hits (src/lib/game/services/ResearchService.ts:244, src/lib/game/systems/ModifierSystem.ts:65) are research-unlock and building-effect results, not Traits. So no caller can pass a trait whose effects key ends in `Penalty`.

## Why nothing caught it

Nothing below the judgment tier can decide this one: it is why `G01` exists at T2 rather than as a lint rule or a test. The invariant is stated in `docs/game/ARCHITECTURE.md`. If the fix makes the class mechanically checkable, add that check and demote the rule — `node tools/audit/audit.mjs demote` tracks which rules have earned it.

## Remediation

- [ ] Confirm each citation above still holds; drop any whose evidence does not.
- [ ] Fix every remaining site under `components/pawn` — this is one class, one PR.
- [ ] Add the check that would have caught it, or record why it stays a judgment call.
- [ ] `pnpm check` and `pnpm test:related` on the changed files are green.

## Out of scope

Sites outside `components/pawn`, and any other rule's findings — they are their own issues. Widening this PR past the citations above makes it unreviewable.
