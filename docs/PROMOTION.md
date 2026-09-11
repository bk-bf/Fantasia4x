# Playtest before promoting

What is on `dev` and not in the build you play, ranked by priority and then by number.
Regenerate with `pnpm audit:promote --list`; this one is stamped after #43.

## P1

- [ ] **#3 — Caught error is discarded, components/screens**
      Errors that were caught and swallowed are now reported instead of vanishing.
      *Watch: nothing new and noisy appears in the log during ordinary play.*

- [ ] **#12 — A fractional recipe quantity rounds back up to a whole unit**
      Stockpile comparisons gained an epsilon, and a partial take is now taken as a partial
      instead of `Math.ceil` rounding it up to a whole unit.
      *Watch: inputs deplete by the amount you expect and no order sticks queued.*

- [ ] **#26 — Hand-maintained roster restates a declared set, audio**
      The ambient layer roster is derived rather than hand-listed.
      *Watch: ambience plays, and changes between day and night.*

- [ ] **#27 — Hand-maintained roster restates a declared set, components/pawn**
      The pawn panels derive their rosters from the declaration instead of restating them.
      *Watch: traits, attributes, relations, stance, and the rest and medicine policies.*

- [ ] **#28 — Hand-maintained roster restates a declared set, components/screens**
      Same derivation across the screens, and `KNOWLEDGE_TIERS` now holds the labels beside the
      thresholds that produce them.
      *Watch: the kingdom screen's knowledge wording — strangers, acquainted, familiar, well
      known, deeply known.*

- [ ] **#29 — Hand-maintained roster restates a declared set, components/UI**
      Same derivation across the canvas and HUD components.
      *Watch: zone panel, building storage, stockpile zone and chronicle entries all label
      correctly.*

- [ ] **#30 — Hand-maintained roster restates a declared set, components/util**
      Same derivation in the shared helpers; `core/types/buildings.ts` now declares the set once.
      *Watch: the item category tree and the work list render with real names.*

- [ ] **#31 — Hand-maintained roster restates a declared set, dev**
      The gear-db audit tables dropped a duplicated `ARM_ORDER` and made the tab list exhaustive
      by type, so a missing tab is now a compile error.
      *Watch: `/gear-db` opens and every tab renders.*

## P2

- [ ] **#32 — Display label mapped by hand where a lookup exists, components/util**
      Condition labels are spread from `CORE_STAT_ABBR` instead of a retyped copy.
      *Watch: condition and trait tooltips show abbreviations, not raw ids.*

- [ ] **#43 — DB-PASS-QUEUE, the four remaining data passes**
      Fourteen alchemy recipes moved off `distilled_spirit: 0.3` onto a whole `grape_wine: 1` or
      `hopped_ale: 1` — salves, tinctures, antidotes, the woundwort line, the ichor and bile
      potions. Every one of them now depends on the brewing chain instead of distilling.
      *Watch: that a potion is still craftable from what a colony has, and that wine and ale
      supply keeps up.*

## P3

- [ ] **#4 — Branch no caller can reach, audio**
      The ambient fallback had an `isNight ? 0 : 0.15` arm that could never take the `0`, since
      the night case returns earlier. Now a plain `0.15`.
      *Watch: night ambience still differs from day.*

- [ ] **#5 — Branch no caller can reach, components/pawn**
      A dead `*Penalty` arm in the trait effects loop removed; no trait ever carried that key.
      *Watch: trait cards still list their effects.*

- [ ] **#6 — Branch no caller can reach, components/screens**
      Unreachable branch removed.
      *Watch: the screens it touched still open.*

- [ ] **#7 — Branch no caller can reach, components/UI**
      Unreachable branch removed.
      *Watch: the canvas draws.*

- [ ] **#8 — Branch no caller can reach, components/util**
      Unreachable branch removed.
      *Watch: nothing that reads a pawn's utils renders blank.*

- [ ] **#38 — Combat balance 4f, loose ends left by the two-axis rebuild**
      Tidies left over from the two-axis rebuild across combat narration, work utils, stat view
      and tile storage.
      *Watch: the combat log reads correctly through a fight.*
