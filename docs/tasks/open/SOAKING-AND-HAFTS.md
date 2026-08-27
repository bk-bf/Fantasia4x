---
id: soaking-and-hafts
kind: proposal
status: awaiting-review
queue: false
blocked-on: decision
owner: kirill
created: 2026-08-27
updated: 2026-08-27
---
<!-- LOC cap: 175 (created: 2026-08-27) -->

# SOAKING AND HAFTS — one vat, and every shaft that should pass through it

> **Related:** [DB-PASS-QUEUE](DB-PASS-QUEUE.md) (T4) · [ITEM-RULES](../../game/ITEM-RULES.md) ·
> [ROADMAP](ROADMAP.md) · [AUDIT (archived)](../archive/AUDIT-2026-08-25.md)

Merge three soaking stations into one two-rung ladder, and route every tool haft, bow and staff
through it. 43 rows audited, 23 need changing.

## Decisions this needs before any edit

1. Do bow staves take `seasoned_haft`, or does a new cured stave item get authored?
2. Do the six arcane staffs get a runed soaking rung plus three cured arcane haft items, or stay
   as they are?
3. Does `soaking_trough` get deleted, or kept and re-scoped?

## Defects this turned up, which are their own tasks

- **42 heads are mounted on a haft with no fastener**, and the guard meant to catch it cannot —
  its `JOINT` regex accepts the head material itself. Ratcheted at 72 in `dbStructure.test.ts`;
  fixing the recipes is a separate pass.
- **Three runed rods carry a tier-2 `wooden_haft`** — the copper-age handle — at a runed bench.

## Status

**Proposal. Nothing has been changed.** No `.jsonc` was touched. Everything below was read out of
`buildings.jsonc`, `recipes.jsonc`, `items.jsonc` and `dbStructure.test.ts` on 2026-08-27 and
counted by script; every id in a table is a line that exists today.

**`seasoned_staff` does not exist** — `grep -rn "seasoned_staff"` over the repo returns nothing.
`seasoned_haft` is the only cured shaft in the game, `soak_seasoned_hafts` is the only recipe that
makes one, and it is also the only recipe `soaking_trough` hosts.

---

## 1 — The three stations

| id | age | passive | buildingCost | fluid | recipes |
|---|---|---|---|---|---|
| `tanning_bucket_station` "Oak Tanning Pit" | bronze:3 | yes | `wooden_bucket`×1 | 10 L | 11 |
| `beast_tanning_bucket` "Iron-Hooped Tanning Pit" | iron:1 | yes | `wooden_bucket`×2, `iron_nail`×4 | 10 L | 7 |
| `soaking_trough` "Soaking Trough" | iron:1 | yes | `category:plank`×4, `iron_nail`×4 | — | 1 |

All three are passive plank vessels holding liquid while something sits in it for days.
`wooden_bucket` is `{"category:plank":2,"category:fastener":4,"resin":1}` at the `sawtable`, so all
three are plank by cost — "Oak" in the first name is supported by nothing it is built from. The
strength gate between the two tanning pits is **not** in the building: it is in the input fluid
(`tanning_brine` vs `beast_brine`, both brewed at `brewing_barrel`). The buildings differ only in
cost and age.

### Proposal — one ladder of two rungs, named for the vessel

`effects.family` + `effects.rung` already exist and already do exactly this:
`BuildingService.stationFulfills` returns true when the station you own shares a family with the one
a recipe names and sits at an equal or higher rung. A higher rung runs every lower rung's recipes.
That is the "one bin" the brief asks for, and it is a data change.

- **rung 0 — `tanning_bucket_station`, bronze:3 → "Plank Soaking Vat"**
- **rung 1 — `beast_tanning_bucket`, iron:1 → "Iron-Bound Soaking Vat"**
- **`soaking_trough` is deleted.** `soak_seasoned_hafts` moves to rung 0.

Why *ladder* and not one building: the discipline a craft job files under is resolved from the
station's `effects` flags in the order they appear in `jobs.jsonc`, and `woodworkingEnabled` is
listed **before** `leatherworkingEnabled`. One building carrying both would file all eighteen
tanning recipes as woodwork, and `jobRegistry.test.ts:83` asserts
`statKey('tanning_bucket_station') === 'leatherworking'`. Two rungs keep the flags apart. Rung 0
keeps `leatherworkingEnabled`; `soak_seasoned_hafts` carries an explicit
`"discipline": "woodworking"`, the escape hatch `make_wooden_tongs` already uses.

Cost of the move: seasoned hafts become reachable at bronze:3 rather than iron:1. Every recipe that
consumes one is iron or later, so nothing arrives early.

**Name.** *Soaking Vat* covers all three jobs — hide soaks in brine, haft soaks in water, anything
soaks in lye — with one plain noun. It is a vessel, not a room: `dbStructure.test.ts:313` rejects
`house|works|shop|cellar|brewery|bakery|granary|lodge|walk|smithy|lab|apothecary|hall|barn|shed|room|hut|kitchen`,
and *vat* is already the word three other stations use (`brewing_barrel` "Steeping Vat",
`lagering_cellar` "Steel Lagering Vat", `runic_brewhouse` "Runed Brewing Vat"). The material prefix
follows `buildingCost`: planks for rung 0, planks and iron for rung 1. *Pit* goes, because a pit is
an excavation and neither of these is dug.

**Open, not decided:** a runed rung. The three arcane hafts below have no cured form and no vat
above iron to cure them in. Adding one is three new items plus a rung — an `items` skill question,
not this pass's.

---

## 2 — The haft audit

`sanded_haft`'s own description says it is *"ready to drink in a seasoning soak"* — the half-finished
stage, not a part. `wooden_haft` is tier 2 and reads *"sound enough for a copper or bronze head"*.

**43 rows: 12 hafted tools at iron and later, 14 bows and slings, 17 staffs and rods. 20 are already
right; 23 need changing.**

### Hafted tools, iron and later — 11 right, 1 wrong

| item | age | recipe id | station | shaft today | should be |
|---|---|---|---|---|---|
| Iron Axe | iron | `make_iron_axe` | `anvil` | `seasoned_haft`×1 | correct |
| Steel Axe | iron | `make_steel_axe` | `anvil` | `seasoned_haft`×1 | correct |
| Iron Pick | iron | `make_iron_pick` | `anvil` | `seasoned_haft`×1 | correct |
| Steel Pick | iron | `make_steel_pick` | `anvil` | `seasoned_haft`×1 | correct |
| Iron Hammer | iron | `make_iron_hammer` | `anvil` | `seasoned_haft`×1 | correct |
| Steel Hammer | iron | `make_steel_hammer` | `anvil` | `seasoned_haft`×1 | correct |
| Iron Shovel | iron | `make_iron_shovel` | `anvil` | `seasoned_haft`×1 | correct |
| Steel Shovel | iron | `make_steel_shovel` | `anvil` | `seasoned_haft`×1 | correct |
| Iron Hoe | iron | `make_iron_hoe` | `anvil` | `seasoned_haft`×1 | correct |
| Steel Hoe | iron | `make_steel_hoe` | `anvil` | `seasoned_haft`×1 | correct |
| Iron Fleshing Knife | iron | `make_iron_fleshing_knife` | `anvil` | `seasoned_haft`×1 | correct |
| Rune-Etched Pick | runed | `make_rune_etched_pick` | `runecarver_bench` | `sanded_haft`×1 | `seasoned_haft` |

The other iron-and-later tools carry no shaft and need none: the four kits (`iron_butchery_kit`,
`steel_butchery_kit`, `curriers_kit`, `steel_curriers_kit`, `sewing_kit`, `tailors_kit`) are rolls of
blades and needles, and `iron_tongs`/`steel_tongs` are one-piece forgings with a riveted pivot.
Below iron, `copper_axe`, `copper_pick` and `copper_knife` bind a head straight onto `branch`×1 —
out of this pass's scope, but the same defect one age down.

### Bows, crossbows and slings — 6 right, 8 wrong

| item | age | recipe id | station | shaft today | should be |
|---|---|---|---|---|---|
| Yew Longbow | primitive | `make_yew_longbow` | `makers_bench` | `seasoned_haft`×1 + `yew_log`×1 | correct |
| Steel-Prod Arbalest | iron | `make_steel_arbalest` | `anvil` | `seasoned_haft`×1 + `oak_plank`×2 | correct |
| Rune-Strung Warbow | runed | `make_rune_strung_warbow` | `runecarver_bench` | `seasoned_haft`×1 + `yew_log`×1 | correct |
| Rune-Cranked Arbalest | runed | `make_rune_cranked_arbalest` | `runecarver_bench` | `seasoned_haft`×1 | correct |
| Sling | primitive | `make_sling` | `makers_bench` | none | correct — pouch and cords, no shaft |
| Rune-Whistling Sling | runed | `make_rune_whistling_sling` | `runecarver_bench` | none | correct — no shaft |
| Self Bow | primitive | `make_self_bow` | `makers_bench` | `branch`×3 | seasoned stave |
| Hunting Recurve | primitive | `make_hunting_recurve` | `makers_bench` | `category:log`×1 | seasoned stave |
| War Bow | primitive | `make_war_bow` | `makers_bench` | `category:log`×1 | seasoned stave |
| Sinew-Backed Bow | primitive | `make_sinew_backed_bow` | `makers_bench` | `wooden_haft`×1 | seasoned stave |
| Horn Composite Bow | primitive | `make_horn_composite_bow` | `makers_bench` | `sanded_haft`×1 | seasoned stave |
| Composite-Prod Crossbow | primitive | `make_composite_crossbow` | `makers_bench` | `sanded_haft`×1 + `oak_plank`×1 | seasoned stave |
| Crossbow | iron | `make_crossbow` | `anvil` | `oak_plank`×2, no shaft at all | seasoned stock, as the arbalest has |
| Staff-Sling | primitive | `make_staff_sling` | `makers_bench` | `wooden_haft`×1 | `seasoned_haft` |

A bow stave is not a haft: whether these take `seasoned_haft` or a new cured stave item is the
decision this table asks for. `dbStructure.test.ts:239` exempts anything matching
`bow|recurve|sling|crossbow|arbalest` from the "no weapon out of a raw log" rule, which is why
`war_bow` and `hunting_recurve` still eat a whole log.

### Staffs, rods and scepters — 3 right, 14 wrong

| item | age | recipe id | station | shaft today | should be |
|---|---|---|---|---|---|
| Steel-Shod Longstaff | iron | `make_steel_shod_longstaff` | `anvil` | `seasoned_haft`×2 | correct |
| Rune-Banded Longstaff | runed | `make_rune_banded_longstaff` | `runecarver_bench` | `seasoned_haft`×2 | correct |
| Manaforge Greatstaff | runed | `make_manaforge_greatstaff` | `attunement_altar` | `seasoned_haft`×1 | correct |
| Bronze-Capped Staff | bronze | `make_bronze_capped_staff` | `casting_hearth` | `sanded_haft`×2 | `seasoned_haft` |
| Iron-Shod Quarterstaff | iron | `make_iron_shod_staff` | `anvil` | `sanded_haft`×2 | `seasoned_haft` |
| Cinder Rod | runed | `make_cinder_rod` | `runecarver_bench` | `wooden_haft`×1 | `seasoned_haft` |
| Hoarfrost Rod | runed | `make_hoarfrost_rod` | `runecarver_bench` | `wooden_haft`×1 | `seasoned_haft` |
| Storm Rod | runed | `make_storm_rod` | `runecarver_bench` | `wooden_haft`×1 | `seasoned_haft` |
| Emberglass Scepter | runed | `make_emberglass_scepter` | `attunement_altar` | `sanded_haft`×1 | `seasoned_haft` |
| Rimeglass Scepter | runed | `make_rimeglass_scepter` | `attunement_altar` | `sanded_haft`×1 | `seasoned_haft` |
| Stormglass Scepter | runed | `make_stormglass_scepter` | `attunement_altar` | `sanded_haft`×1 | `seasoned_haft` |
| Ember Staff | runed | `make_ember_staff` | `runecarver_bench` | `emberwood_haft`×1 | cured arcane haft |
| Pyre Staff | runed | `make_pyre_staff` | `attunement_altar` | `emberwood_haft`×1 | cured arcane haft |
| Frost Staff | runed | `make_frost_staff` | `runecarver_bench` | `moonwood_haft`×1 | cured arcane haft |
| Rime Staff | runed | `make_rime_staff` | `attunement_altar` | `moonwood_haft`×1 | cured arcane haft |
| Spark Staff | runed | `make_spark_staff` | `runecarver_bench` | `heartwood_haft`×1 | cured arcane haft |
| Tempest Staff | runed | `make_tempest_staff` | `attunement_altar` | `heartwood_haft`×1 | cured arcane haft |

Three rods carry a tier-2 `wooden_haft` — the copper-age handle — at a runed bench. The six arcane
staffs are blocked on the runed-rung decision above: `carve_emberwood_haft`, `carve_moonwood_haft`
and `carve_heartwood_haft` run at `heartwood_joiner` (runed:3) and never soak.

---

## 3 — Structural defect: heads held on by nothing

`dbStructure.test.ts:257` asserts *"a head joined to a haft is fastened, not merely tied on"*. It
does not hold, for two reasons:

1. It runs only over items of `type: "weapon"`. **All 12 hafted tools above are outside it.**
2. Its `JOINT` regex is `/fastener|nail|rivet|tack|mold|molten|_bar$|category:steel|category:iron/`.
   `iron_bar` matches `_bar$` and `category:steel` matches literally — so **the head material
   itself satisfies the fastener check**. `{"iron_bar":2,"seasoned_haft":1,"category:leather":1}`
   passes with no wedge, nail or rivet anywhere in it.

Counting only `fastener|nail|rivet|tack` as a real fastener, **53 of the 68 iron-and-later recipes
that consume a haft list none at all.** Excluding the bows, shod staffs and rods where a band or a
string is genuinely the joint, **42 heads are mounted on a shaft by a leather wrap or by nothing.**

Every one of the 12 hafted tools is in that set — the entire iron and steel tool line binds a head
to a haft with `category:leather`×1 and no fastener. `make_steel_halberd`, `make_steel_greatflail`
and `make_steel_arbalest` are the pattern to copy: they list `iron_nail` or `steel_rivet` by count.

Fixing it means widening the test to `type: "tool"` and dropping `_bar$`/`category:steel`/
`category:iron` from `JOINT` so the head stops paying for the joint — which fails 42 recipes the
moment it lands, so it is its own task, not a line in this one.
