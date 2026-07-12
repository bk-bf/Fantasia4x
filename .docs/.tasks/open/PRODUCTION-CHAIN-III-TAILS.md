<!-- LOC cap: 120 (created: 2026-07-10) -->

# PRODUCTION-CHAIN-III — Remaining Tails (drink-use action + famed craft display)

> **Related:** [ROADMAP](ROADMAP.md) · [PRODUCTION-CHAIN-III (archived — full Pass III record)](../archive/PRODUCTION-CHAIN-III-2026-07-10.md) · [CREATURE-COMBAT-OVERHAUL §4](../archive/CREATURE-COMBAT-OVERHAUL-2026-07-12.md) (the combat tails — §H traps/turrets + §I boss-drop — moved there) · [game/DESIGN](../../game/DESIGN.md)

## Status

**Not started (ROADMAP Phase 3 #6).** Slim successor to the archived
[PRODUCTION-CHAIN-III](../archive/PRODUCTION-CHAIN-III-2026-07-10.md): all 8 chapters' **data +
foundations shipped** (2026-06-21). Only the **non-combat interaction/display tails** remain here; the
**combat tails** (§H combat traps + auto-fire turrets, §I boss-drop hook) moved to
[CREATURE-COMBAT-OVERHAUL §4](../archive/CREATURE-COMBAT-OVERHAUL-2026-07-12.md). Everything below is small, data + a thin
interaction/UI layer — no new subsystems.

---

## §G — the active drink-use action

The alchemy_lab, potion items (`potion_of_might`/`draught_of_vigor`/`elixir_of_grace`/
`tonic_of_fortitude`), their `grantsConditions` (the §M buff pool), the new `Item.conditionDurationTurns`
field, and `alchemy_quality` (`stats.jsonc`) are **all already shipped**. What's missing is the
player-triggered **use-action** that actually drinks a potion.

- [ ] A player-triggered item-use interaction: **drink → push the potion's timed condition into
      `conditionTimers`** (mirrors the on-hit `envenomed`/`disoriented` timed-condition path). A new
      interaction surface — a use-item job/FSM step + a UI affordance to trigger it.
- [ ] Scale duration/strength by `alchemy_quality` (the stat already exists; wire it into the push).
- [ ] Tone: imply, don't instruct — potion descriptions describe the draught, not the buff math.

## §I — famed craft-roll stamp + display

The `famed` rarity tier, the `ItemInstance` fields (`famed`/`famedName`/`famedHistory`/`famedStatMult`/
`famedEnchants`), the `core/famedNames.ts` generator, the roll/stat/enchant math, and the
**allocation-neutral per-hit combat scaling** (`combinedQualityMultiplier`) are **all already shipped +
tested** (`famedNames.test.ts`). Missing: the craft-side stamp and the display.

- [ ] **Craft-roll stamp** — call `rollFamed` on equipment craft completion in `jobs/craft.ts` (the
      vanishingly-small, skill/station-scaled tail above Legendary; not targetable). Stamp
      `famed`/`famedName`/`famedHistory`/`famedStatMult`/`famedEnchants` onto the output `DroppedItem`.
- [ ] **Famed-name display** — `getItemDisplayName` override so a famed item shows its generated name
      (e.g. *"Bittermourn, the Widow's Answer"*) instead of the base item name.
- [ ] **Surface identity in the item card** — famed name + generated history + the 1–3 `grantsConditions`
      enchants (the resolution math is done; only the card rendering is missing).
- [ ] Apply `famedEnchants` (`grantsConditions`) while equipped — reuses the existing `grantsConditions`
      pipeline; confirm it flows for famed instances.

> The **boss-drop** path (the other way to obtain a famed item) is a combat concern and lives with the
> elite/miniboss ladder in [CREATURE-COMBAT-OVERHAUL §4](../archive/CREATURE-COMBAT-OVERHAUL-2026-07-12.md).

---

## Open Questions

- [ ] **Prestige stat home** (carried over from Pass III): `Item.prestige` flat field vs derived from
      material+quality+enchants? Decided by SOCIAL-LAYER; capture either way.
