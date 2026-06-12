<!-- LOC cap: 560 (created: 2026-06-03; fully rewritten 2026-06-12) -->

# EQUIPMENT, INVENTORY & COMBAT LOADOUT

> **Related:** [ROADMAP](ROADMAP.md) · [COMBAT-SYSTEM](COMBAT-SYSTEM.md) · [RANGED-WEAPONS](RANGED-WEAPONS.md) · [MAGIC-SKILLS](MAGIC-SKILLS.md) · [PRODUCTION-CHAIN-EXPANSION](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) (✅ archived) · [SEASONS_WEATHER](SEASONS_WEATHER.md) · [game/DESIGN](../../game/DESIGN.md)

## Status

Not started. Inventory weight/volume (Phase A) can begin independently. Equipment
slot expansion (Phase B) requires COMBAT-SYSTEM ability types to exist. Magic-attuned
items (`staff`, `focus`, `grimoire`) and spell-granting gear belong to
[MAGIC-SKILLS](MAGIC-SKILLS.md) — excluded here.

---

## Goals

1. Replace slot-count inventory with **weight + volume budgets** derived from pawn
   body stats (`strength`, `bodySize`) in `stats.jsonc`; add `weightKg`/`volumeL`
   to every item.
2. Expand equipment slots to head layers, torso layers, gauntlets, boots, gorget,
   ring, belt, back. **Remove the `tool` slot** — tools live in inventory.
3. **Layered armour** (gambeson → mail/brigandine → plate outer, Battle Brothers
   Legends model): layers stack protection; each adds fatigue cost; damage cascades
   inward through layers.
4. Historically grounded item names; complex multi-material recipes; **dynamic
   material bonuses** so any wood/hide/bone type works but better choices give
   better results.
5. Flat optional item fields so climate attributes (`weatherResistance`,
   `coldProtection`, `heatProtection`) from [SEASONS_WEATHER](SEASONS_WEATHER.md)
   drop in without schema migration.

---

## Part I — Pawn Inventory: Weight & Volume

### Model change (`types.ts`)

```typescript
export interface PawnInventory {
  items: Record<string, number>; // itemId → quantity (unchanged)
  weightKg: number;              // current carried weight
  maxWeightKg: number;           // derived — see below
  volumeL: number;               // current carried volume
  maxVolumeL: number;            // derived — see below
}
```

`maxWeightKg` and `maxVolumeL` are **not constants** — they are derived at access
time from the pawn's physical stats (defined in `stats.jsonc`) plus carry-container
bonuses from equipped belt/back items:

```
maxWeightKg = pawn.stats.strength × 1.5 + pawn.bodySize × 3 + Σ inventoryBonus.weightKg
maxVolumeL  = pawn.bodySize × 4 + Σ inventoryBonus.volumeL
```

Exact coefficients live in `stats.jsonc` alongside hunger/fatigue rate definitions
(same pattern as `hungerRateMultiplier`). The old `maxSlots`/`currentSlots` are removed.

### New item fields (required on all `items.jsonc` entries)

```jsonc
"weightKg" : 0.8,
"volumeL"  : 1.2
```

| Item               | weightKg | volumeL | Notes                                |
| ------------------ | -------- | ------- | ------------------------------------ |
| Flint shard        | 0.1      | 0.15    |                                      |
| Branch             | 0.4      | 1.5     | bulky                                |
| Cordage            | 0.1      | 0.2     |                                      |
| Pine log           | 8.0      | 12.0    | hauled, not hand-carried             |
| Copper bar         | 4.0      | 0.5     | dense                                |
| Stone axe          | 1.5      | 2.0     | in inventory (no tool slot)          |
| Linen gambeson     | 4.0      | 8.0     | compressible when packed             |
| Riveted mail hauberk | 10.0  | 6.0     | dense rings                          |
| Iron nasal helm    | 2.5      | 4.0     |                                      |
| Round shield       | 4.5      | 12.0    | large footprint                      |

### Carry containers (`belt` / `back` slot items)

```jsonc
"inventoryBonus": { "weightKg": 20.0, "volumeL": 25.0 }
```

| id               | Name              | Slot | +weightKg | +volumeL | Recipe                                          |
| ---------------- | ----------------- | ---- | --------- | -------- | ----------------------------------------------- |
| `leather_satchel`| Leather Satchel   | belt | +8        | +10      | 2× light_leather + 1× cordage                  |
| `canvas_pack`    | Canvas Field Pack | back | +20       | +25      | 2× linen_cloth + 1× sturdy_leather + 2× cordage |
| `tool_holster`   | Tool Holster      | belt | +5        | +8       | 1× sturdy_leather + 1× cordage                  |
| `wicker_frame`   | Wicker Frame Pack | back | +12       | +30      | 4× branch + 3× plant_fiber + 2× cordage         |

Backpacks remain equipped during combat — they add weight (fatigue drain) and volume
(can carry field medicine) as an explicit player trade-off. No auto-drop.

---

## Part II — Equipment Slots

```typescript
export interface PawnEquipment {
  mainHand? : EquippedItem;   // primary weapon (one- or two-handed)
  offHand?  : EquippedItem;   // shield, off-hand weapon; locked when mainHand.twoHanded

  headBase? : EquippedItem;   // padded cap, leather coif, mail coif
  headOuter?: EquippedItem;   // nasal helm, spangenhelm, great helm

  bodyBase? : EquippedItem;   // gambeson / padded arming doublet
  bodyMid?  : EquippedItem;   // mail hauberk / brigandine / scale
  bodyOuter?: EquippedItem;   // plate cuirass / coat of plates / lamellar

  gloves?   : EquippedItem;   // leather gloves → iron gauntlets
  boots?    : EquippedItem;   // hide boots → iron-shod boots
  gorget?   : EquippedItem;   // neck/throat guard
  ring?     : EquippedItem;   // one ring slot (Phase 1; second deferred)
  belt?     : EquippedItem;   // belt / baldric → carry bonus
  back?     : EquippedItem;   // backpack → carry bonus
}

export type EquipmentSlot =
  | 'mainHand' | 'offHand'
  | 'headBase' | 'headOuter'
  | 'bodyBase' | 'bodyMid' | 'bodyOuter'
  | 'gloves' | 'boots' | 'gorget' | 'ring' | 'belt' | 'back';
```

`twoHanded: true` on a weapon's `weaponProperties` locks `offHand` at equip time —
this is an item field, not a COMBAT-SYSTEM concern. Old `tool` and `accessory` slots removed.

---

## Part III — Layered Armour

### `armorProperties` additions

```jsonc
"armorProperties": {
  "armorValue"    : 22,       // damage absorbed per hit from this layer
  "fatiguePerTurn": 0.6,      // fatigue drain per turn while worn
  "armorLayer"    : "mail",   // "gambeson" | "mail" | "plate"
  "slot"          : "bodyMid"
}
```

### Damage cascade

```
incoming damage
  → bodyOuter absorbs min( armorValue × (dur/maxDur), remainder )  → drains bodyOuter durability
  → bodyMid   absorbs min( armorValue × (dur/maxDur), remainder )  → drains bodyMid durability
  → bodyBase  absorbs min( armorValue × (dur/maxDur), remainder )  → drains bodyBase durability
  → body HP receives remainder
```

Head cascades identically (headOuter → headBase → head HP). Blunt weapons and high
`armorPenetration` bypass a fraction of each layer's absorption — COMBAT-SYSTEM owns
that formula. Each absorbed hit drains that layer's durability by
`durabilityLossPerCombatHit`. At 0 the layer is **destroyed**.

### Fatigue cost

Σ `fatiguePerTurn` across all worn layers. Full kit (gambeson + mail + brigandine +
coif + nasal helm + gauntlets) ≈ 1.5–2× base fatigue rate — a meaningful endurance
trade-off for heavy fighters.

---

## Part IV — Item Field Extensibility

All new fields are **flat optional** on `Item`. Nested objects (`weaponProperties`,
`armorProperties`) grow their own keys; the top-level `Item` stays flat:

```typescript
// Inventory
weightKg?                   : number;
volumeL?                     : number;
inventoryBonus?              : { weightKg: number; volumeL: number };

// Combat wear — separate from durabilityLossPerAction (work tools)
durabilityLossPerCombatHit?  : number;

// SEASONS_WEATHER stubs — wired when Phase B ships, ignored until then
weatherResistance?  : number;   // 0–1; reduces rain/blizzard fatigue multiplier
coldProtection?     : number;   // °C offset; expands pawn comfort range downward
heatProtection?     : number;   // °C offset; expands comfort range upward
```

### Dynamic material bonuses (`Recipe` extension)

Recipes that accept a category slot (e.g. `acceptsCategory: wood_log`) can carry an
optional `materialBonuses` map. The crafting service reads which specific item was
used for that slot and applies the delta to the output item's `weaponProperties` or
`armorProperties`:

```jsonc
"materialBonuses": {
  "shaft": {
    "ash_log" : { "accuracy": 3, "damMax": 1 },
    "oak_log" : { "maxDurability": 15 },
    "yew_log" : { "damMax": 2, "critMod": 0.02 },
    "pine_log" : {}
  },
  "hide": {
    "thick_leather"  : { "armorValue": 4, "fatiguePerTurn": 0.1 },
    "heavy_leather"  : { "armorValue": 2 },
    "sturdy_leather" : { "armorValue": 1 },
    "light_leather"  : {},
    "thin_leather"   : { "armorValue": -1 }
  }
}
```

This means every weapon/armour recipe using wood or leather is craftable with *any*
valid material from that category. Suboptimal choices still produce a usable item —
pine spear gets the job done; ash spear is simply better. No single-use ingredients.

---

## Part V — Weapons

### `weaponProperties` schema

```jsonc
"weaponProperties": {
  "damMin"          : 2,
  "damMax"          : 5,
  "attackSpeed"     : 1.0,     // multiplier on base attack speed
  "range"           : 0,       // 0 = melee; tiles for ranged
  "reach"           : 1,       // melee tiles (1 = adjacent, 2 = pole-arm)
  "damageType"      : "slash", // "slash" | "pierce" | "blunt"
  "armorPenetration": 0.0,     // 0–1 fraction of armor bypassed
  "accuracy"        : 0,       // flat % hit modifier
  "staminaCost"     : 2,       // stamina per swing
  "critMod"         : 0.0,     // added to crit_chance
  "bluntMod"        : 0.0,     // knockdown multiplier (blunt only)
  "twoHanded"       : false,   // locks offHand slot when true
  "tags"            : []       // ability grants from COMBAT-SYSTEM
}
```

### Durability model

There is no sync pipeline. An equipped item is the **same `ItemInstance` record**
that was previously in inventory or on the ground — it moves locations, it does not
get copied. `PawnEquipment` slots hold an `ItemInstance` directly:

```typescript
export interface ItemInstance {
  instanceId: string;   // unique; stable across location changes
  itemId    : string;   // references the Item definition
  durability: number;   // current (shared field — same record everywhere)
}
```

Equipping = remove the `ItemInstance` from `PawnInventory.instances` (or from a
`DroppedItem` on the tile) and place it in the `PawnEquipment` slot. Unequipping =
move it back. One record, one durability value, no copying.

`DroppedItem` gains an optional `instance?: ItemInstance` for trackable items
(weapons, armour, tools with `maxDurability`). Bulk materials (logs, bars, hides)
stay as aggregate `quantity` counts — they never need individual identity.

At **0 durability the item is destroyed** — the `ItemInstance` is removed. No floor.

`effectiveWeaponDam = damMax × (dur / maxDur)` — worn weapons hit at a fraction.

| Tier              | durabilityLossPerCombatHit | Approx. fights before destroyed |
| ----------------- | -------------------------- | -------------------------------- |
| Tier 0 Improvised | 40–50                      | 1–2                              |
| Tier 0.5 Bone     | 25–35                      | 2–4                              |
| Tier 1 Bronze     | 10–15                      | 5–8                              |
| Tier 2 Iron       | 4–7                        | 15–25                            |
| Tier 3 Steel      | 1–3                        | 40+                              |

### Tier 0 — Knapped Stone (Maker's Bench; no research, no hunting needed)

Crafted from foraged stone and fiber — the very first weapons, available before the
first hunt.

| id               | Name                    | damType | dam  | reach | AP | stam | maxDur | Recipe                                          |
| ---------------- | ----------------------- | ------- | ---- | ----- | -- | ---- | ------ | ----------------------------------------------- |
| `flint_knife`    | Knapped Flint Knife     | slash   | 2–5  | 1     | 1.1| 1    | 20     | 2× flint_shard (no binding — raw grip)         |
| `stone_spear`    | Fire-Hardened Spear     | pierce  | 4–8  | 2     | 0.9| 3    | 30     | 1× branch + 1× flint_shard + 1× cordage; fire-harden at hearth |
| `flint_handaxe`  | Flint Handaxe           | slash   | 3–7  | 1     | 1.0| 2    | 20     | 2× flint_shard + 1× branch + 1× cordage        |
| `wattle_buckler` | Wattle Buckler (shield) | —       | —    | —     | —  | —    | 15     | 4× branch + 2× cordage — offHand               |

`durabilityLossPerCombatHit: 45`. The flint knife uses no binding by design: the
absolute first thing craftable with bare hands and a found flint. Cordage (from
plant_fiber) is required for everything else — that one processing step is the floor
of primitive industry.

### Tier 0.5 — Bone & Hide (Maker's Bench; after first hunt)

Uses `small_bones`, `medium_bones`, `large_bones` (already in `items.jsonc` as
butchery by-products) and unprocessed hides. The hunt → loot → upgrade loop:
kill something with stone, use its bones to make better weapons.

| id                  | Name                      | damType | dam  | reach | AP   | stam | bluntMod | maxDur | Recipe                                              |
| ------------------- | ------------------------- | ------- | ---- | ----- | ---- | ---- | -------- | ------ | --------------------------------------------------- |
| `bone_knife`        | Bone Splinter Knife       | pierce  | 3–6  | 1     | 1.1  | 1    | —        | 30     | 1× medium_bones + 1× cordage                       |
| `antler_club`       | Antler War Club           | blunt   | 4–8  | 1     | 0.9  | 3    | 0.6      | 45     | 1× large_bones + 1× cordage                        |
| `bone_tipped_spear` | Bone-Tipped Thrusting Spear | pierce | 5–9  | 2     | 0.9  | 3    | —        | 35     | 1× branch (`acceptsCategory: wood_log`) + 1× medium_bones + 1× cordage; `materialBonuses` on shaft |

`durabilityLossPerCombatHit: 30`. Bone weapons outperform stone in durability and
damage but require hunting first.

### Tier 1 — Bronze (Stone Forge; research: Basic Metallurgy)

| id                    | Name                    | damType | dam   | reach | AP   | stam | critMod | twoH | maxDur | Recipe                                                                    |
| --------------------- | ----------------------- | ------- | ----- | ----- | ---- | ---- | ------- | ---- | ------ | ------------------------------------------------------------------------- |
| `bronze_punch_dagger` | Bronze Punch Dagger     | pierce  | 5–9   | 1     | 1.2  | 1    | 0.04    | no   | 60     | 1× copper_bar + 1× clay_mold (worn) + 1× medium_bones (grip scales) + 1× cordage |
| `leaf_blade_spear`    | Leaf-Blade Spear        | pierce  | 7–13  | 2     | 0.9  | 3    | 0.02    | yes  | 70     | 1× bronze_bar + 1× clay_mold + 1× any_log (shaft) + 1× cordage; `materialBonuses` on shaft |
| `cast_bronze_hatchet` | Cast Bronze Hatchet     | slash   | 8–14  | 1     | 1.0  | 3    | —       | no   | 65     | 1× bronze_bar + 1× clay_mold + 1× any_log (haft) + 1× cordage            |
| `self_bow`            | Self Bow                | pierce  | 5–10  | —     | 1.0  | 2    | 0.03    | yes  | 80     | 1× yew_log (or ash/oak via `materialBonuses`) + 1× sinew + 1× cordage; range: 6 |
| `rawhide_round_shield`| Rawhide-Faced Round Shield | —    | —     | —     | —    | —    | —       | —    | 60     | 2× oak_plank + 1× any_hide (via `materialBonuses`) + 1× cordage; offHand  |

`durabilityLossPerCombatHit: 12`. `sinew` added as a new butchery by-product
(medium/large animals). `any_log` = `acceptsCategory: wood_log`.

### Tier 2 — Iron (Bloomery + Anvil; research: Advanced Metallurgy)

| id                 | Name                       | damType | dam   | reach | AP   | stam | AP%  | twoH | maxDur | Recipe                                                                  |
| ------------------ | -------------------------- | ------- | ----- | ----- | ---- | ---- | ---- | ---- | ------ | ----------------------------------------------------------------------- |
| `short_seax`       | Short Seax                 | slash   | 9–14  | 1     | 1.1  | 2    | 0.10 | no   | 100    | 1× iron_bar + 1× clay_mold + 1× any_log (grip) + 1× cordage            |
| `spatha`           | Spatha                     | slash   | 13–20 | 1     | 1.0  | 3    | 0.15 | no   | 120    | 2× iron_bar + 1× clay_mold + 1× any_log (grip) + 1× cordage + 1× any_leather (wrap) |
| `bearded_axe`      | Bearded Axe                | slash   | 14–21 | 1     | 0.9  | 4    | 0.20 | no   | 110    | 2× iron_bar + 1× clay_mold + 1× any_log (haft) + 1× cordage            |
| `framea`           | Framea (thrusting spear)   | pierce  | 11–17 | 2     | 0.9  | 3    | 0.25 | yes  | 100    | 1× iron_bar + 1× clay_mold + 1× any_log (shaft) + 1× cordage           |
| `war_bow`          | War Bow                    | pierce  | 10–17 | —     | 0.9  | 3    | 0.15 | yes  | 100    | 1× yew_log (or ash) + 2× sinew + 1× cordage; range: 10                 |
| `iron_boss_shield` | Iron-Bossed Kite Shield    | blunt   | 3–6   | 1     | —    | —    | —    | —    | 150    | 2× oak_plank + 1× iron_bar + 1× clay_mold + 1× any_leather + 1× cordage |

`durabilityLossPerCombatHit: 5`. AP% = `armorPenetration`.

### Tier 3 — Steel / Enchanted (Deferred)

Steel weapons and magic-attuned gear. See [MAGIC-SKILLS](MAGIC-SKILLS.md) for staff,
focus, and grimoire. Design deferred until Tiers 0–2 are balanced.

---

## Part VI — Armour by Tier

All armour recipes use `acceptsCategory` for hide/leather slots. Base `armorValue`
assumes `sturdy_leather` or equivalent; `materialBonuses` adjusts up/down from there.

### Tier 0 — Improvised (Maker's Bench; after first hunt)

| id              | Name             | Layer    | Slot     | armorVal | fatigue | maxDur | Recipe                                               |
| --------------- | ---------------- | -------- | -------- | -------- | ------- | ------ | ---------------------------------------------------- |
| `raw_hide_vest` | Raw Hide Vest    | gambeson | bodyBase | 4        | 0.10    | 40     | 2× any_hide + 2× cordage; `materialBonuses` on hide |
| `padded_cap`    | Padded Linen Cap | gambeson | headBase | 2        | 0.05    | 30     | 2× any_hide + 1× cordage                            |

### Tier 1 — Bronze Age

| id                      | Name                       | Layer    | Slot      | armorVal | fatigue | maxDur | Recipe                                               |
| ----------------------- | -------------------------- | -------- | --------- | -------- | ------- | ------ | ---------------------------------------------------- |
| `linen_gambeson`        | Linen Gambeson             | gambeson | bodyBase  | 8        | 0.20    | 80     | 6× linen_cloth + 2× cordage (quilted)                |
| `boiled_leather_jerkin` | Boiled Leather Jerkin      | mail     | bodyMid   | 10       | 0.25    | 70     | 3× any_leather + 1× cordage; `materialBonuses`       |
| `leather_coif`          | Leather Coif               | gambeson | headBase  | 4        | 0.10    | 60     | 2× any_leather + 1× cordage; `materialBonuses`       |
| `cast_bronze_skullcap`  | Cast Bronze Skullcap       | plate    | headOuter | 12       | 0.20    | 90     | 1× bronze_bar + 1× clay_mold (worn)                  |
| `stitched_gauntlets`    | Stitched Leather Gauntlets | —        | gloves    | 3        | 0.05    | 50     | 1× any_leather + 1× cordage                          |
| `tallow_boots`          | Tallow-Dressed Hide Boots  | —        | boots     | 2        | 0.05    | 50     | 2× any_leather + 1× cordage                          |

### Tier 2 — Iron Age

| id                 | Name                    | Layer    | Slot      | armorVal | fatigue | maxDur | Recipe                                                            |
| ------------------ | ----------------------- | -------- | --------- | -------- | ------- | ------ | ----------------------------------------------------------------- |
| `mail_coif`        | Riveted Mail Coif       | mail     | headBase  | 10       | 0.25    | 150    | 6× iron_bar (wire-drawn) + 1× linen_gambeson (liner)             |
| `iron_nasal_helm`  | Iron Nasal Helm         | plate    | headOuter | 16       | 0.30    | 170    | 2× iron_bar + 1× clay_mold + 1× any_leather (cheek pads)         |
| `mail_hauberk`     | Riveted Mail Hauberk    | mail     | bodyMid   | 22       | 0.60    | 250    | 12× iron_bar (wire rings) + 1× linen_gambeson (worn under)        |
| `brigandine_coat`  | Brigandine Coat         | plate    | bodyOuter | 20       | 0.50    | 200    | 6× iron_bar (plates) + 4× any_leather + 2× linen_cloth           |
| `iron_gauntlets`   | Riveted Iron Gauntlets  | —        | gloves    | 8        | 0.20    | 150    | 2× iron_bar + 1× clay_mold + 1× any_leather (palm lining)        |
| `iron_shod_boots`  | Iron-Shod Boots         | —        | boots     | 6        | 0.15    | 140    | 2× iron_bar (plates) + 2× any_leather                            |
| `iron_gorget`      | Riveted Iron Gorget     | —        | gorget    | 8        | 0.10    | 130    | 1× iron_bar + 1× clay_mold + 1× any_leather (lining)             |

---

## Part VII — Combat Durability & Repair

Durability lives on the `ItemInstance` record — the same object whether the item is
on the ground, in a pawn's inventory, or equipped. Elemental deterioration
(`deteriorationRate` × exposure) applies when loose/unsheltered, exactly as it does
for all other items. Combat wear applies `durabilityLossPerCombatHit` per hit to the
attacker's weapon and the struck armour layer.

**At 0 durability the item is destroyed** — `ItemInstance` removed. No floor; repair
prevents this.

**Repair** at Smithy (iron/bronze) or Maker's Bench (primitive/bone):
- Cost = `ceil((maxDurability – currentDurability) / 20)` × original material fraction
- Work category: `metalworking` for metal; `crafting` for bone/hide/wood

---

## Part VIII — New Prerequisites

Items and resources needed that don't yet exist:

| id              | Type     | Source                              | Used in                                            |
| --------------- | -------- | ----------------------------------- | -------------------------------------------------- |
| `sinew`         | material | Butchery by-product (med/large animals) | bowstrings, binding on bronze+ weapons          |
| `linen_cloth`   | material | Flax fiber → Weaving Frame          | gambeson, brigandine, mail liner                   |
| `flax_fiber`    | resource | Flax plant node (see below)         | → linen_cloth (Weaving Frame)                      |

**Flax node**: spawns in grassland/meadow biomes as a partial replacement for plain
grass nodes (reduce grass spawn weight slightly, add `flax` at ~15–20% of that weight).
Foraging yields `flax_fiber`. The `weaving_frame` building (branches + cordage,
Tier 0) processes `flax_fiber` → `linen_cloth`. Linen is reused across clothing,
bandaging, recipe wrapping — not a single-use ingredient.

`small_bones`, `medium_bones`, `large_bones` already exist in `items.jsonc`.
`sinew` is a new by-product from the `butcher_block` recipe (medium/large carcasses).

---

## Part IX — Implementation Plan

### Phase A — Inventory weight & volume

1. Add `weightKg`/`volumeL` to every `items.jsonc` entry.
2. Rewrite `PawnInventory` in `types.ts`; derive carry budget from pawn stats.
3. Add carry-capacity formula to `stats.jsonc` (alongside hunger/fatigue rates).
4. Add `inventoryBonus` field to `Item` type; add carry-container items + recipes.
5. `ItemService.getCarryBudget(pawn)` — derives weight/volume limits.
6. `ItemService.canAddToInventory(pawn, itemId, qty)` — weight + volume check.
7. Update all `PawnInventory` reads across services and UI.

### Phase B — Equipment slots + item data

1. Replace `PawnEquipment`/`EquipmentSlot` in `types.ts`.
2. Extend `Item` type: `armorProperties.armorLayer`, `armorProperties.slot`,
   `weaponProperties.twoHanded`, `durabilityLossPerCombatHit`.
3. Add climate stubs (`weatherResistance?`, `coldProtection?`, `heatProtection?`) as
   optional typed fields — values left null until SEASONS_WEATHER Phase B.
4. Add `materialBonuses` to `Recipe` type in `types.ts`; extend `RecipeService` to
   apply deltas during output assembly.
5. Add all Tier 0–2 weapon + armour entries to `items.jsonc` + `recipes.jsonc`.
6. Add `sinew` butchery by-product, `flax_fiber` resource node, `linen_cloth` recipe,
   `weaving_frame` building.

### Phase C — Service wiring (requires COMBAT-SYSTEM)

1. `ItemService.equipItem(pawn, instanceId, slot)` — moves `ItemInstance` from
   inventory/ground into `PawnEquipment` slot; no copy, no sync.
2. `ItemService.getArmorLayers(pawn)` — ordered layer list for damage cascade.
3. `ItemService.applyArmorHit(pawn, damage)` — cascades through layers, drains
   durability, destroys layer at 0.
4. `ItemService.applyWeaponWear(equippedItem, hits)` — drains `durabilityLossPerCombatHit`.
5. `ItemService.getRepairCost(equippedItem)` — material fraction calculation.
6. Wire repair into the Smithy / Maker's Bench work queue.

---

## Open Questions

- [ ] Two-handed weapons auto-lock offHand on equip — item field (`twoHanded`) drives
  the check; no COMBAT-SYSTEM concern.
- [ ] Leg slots (`legMid`/`legOuter` for chausses/greaves) — deferred; add when iron
  greaves enter the item database.
- [ ] Second ring slot — deferred to Phase 2.
- [ ] `materialBonuses` on shield hide facing — same `acceptsCategory: hide` pattern;
  thick leather gives +1 armorValue, thin gives −1.
