<!-- LOC cap: 520 (created: 2026-06-03; fully rewritten 2026-06-12) -->

# EQUIPMENT, INVENTORY & COMBAT LOADOUT

> **Related:** [ROADMAP](ROADMAP.md) · [COMBAT-SYSTEM](COMBAT-SYSTEM.md) · [MAGIC-SKILLS](MAGIC-SKILLS.md) · [PRODUCTION-CHAIN-EXPANSION](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) (✅ archived) · [SEASONS_WEATHER](SEASONS_WEATHER.md) · [game/DESIGN](../../game/DESIGN.md)

## Status

Not started. Inventory weight/volume (Phase A) can begin independently. Equipment
slot expansion (Phase B) requires COMBAT-SYSTEM ability types to exist. Magic-attuned
items (`staff`, `focus`, `grimoire`) and spell-granting gear are fully spec'd in
[MAGIC-SKILLS](MAGIC-SKILLS.md) and deliberately excluded here.

---

## Goals

1. Replace the slot-count inventory model with **weight + volume budgets**; add
   `weightKg` and `volumeL` to every item in `items.jsonc`.
2. Expand equipment slots to cover the full historical body (head layers, torso
   layers, gauntlets, boots, gorget, ring, belt, back) and **remove the `tool` slot**
   — tools live in the inventory, constrained by weight/volume.
3. Introduce a **layered armour model** (gambeson → mail/brigandine → plate outer,
   inspired by Battle Brothers Legends) where layers stack protection but each adds
   fatigue cost, and damage cascades inward through the layers.
4. Assign historically grounded names to all weapons and armour; add complex
   multi-step crafting recipes, especially for improvised primitive gear.
5. Keep the `Item` interface extensible: new climate fields from
   [SEASONS_WEATHER](SEASONS_WEATHER.md) (`weatherResistance`, `coldProtection`,
   `heatProtection`) drop in as flat optional fields — no schema migration needed.

---

## Part I — Pawn Inventory: Weight & Volume

### Model change (`types.ts`)

```typescript
export interface PawnInventory {
  items: Record<string, number>; // itemId → quantity (unchanged)
  weightKg: number;              // current carried weight
  maxWeightKg: number;           // BASE_CARRY_WEIGHT + Σ inventoryBonus.weightKg
  volumeL: number;               // current carried volume
  maxVolumeL: number;            // BASE_CARRY_VOLUME + Σ inventoryBonus.volumeL
}
// Constants: BASE_CARRY_WEIGHT = 15, BASE_CARRY_VOLUME = 20
```

`maxWeightKg` and `maxVolumeL` are **derived** at access time from the base constant
plus any equipped carry containers (belt, back slot). The old `maxSlots`/`currentSlots`
fields are removed.

### New item fields (required on all `items.jsonc` entries)

```jsonc
"weightKg" : 0.8,   // physical mass — constrains inventory
"volumeL"  : 1.2    // packing volume — constrains inventory
```

Representative values:

| Item               | weightKg | volumeL | Notes                               |
| ------------------ | -------- | ------- | ----------------------------------- |
| Flint shard        | 0.1      | 0.15    |                                     |
| Branch             | 0.4      | 1.5     | bulky                               |
| Pine log           | 8.0      | 12.0    | hauled, rarely carried              |
| Copper bar         | 4.0      | 0.5     | dense                               |
| Stone axe          | 1.5      | 2.0     | carried in inventory (no tool slot) |
| Linen gambeson     | 4.0      | 8.0     | compressible when packed            |
| Riveted mail hauberk | 10.0  | 6.0     | dense rings                         |
| Iron nasal helm    | 2.5      | 4.0     |                                     |
| Round shield       | 4.5      | 12.0    | large volume footprint              |

### Carry containers (`belt` / `back` slot items)

Equipped carry containers grant `inventoryBonus`. A pawn without either starts at
15 kg / 20 L; a full kit reaches ~40 kg / 50 L.

```jsonc
"inventoryBonus": { "weightKg": 20.0, "volumeL": 25.0 }
```

| id               | Name               | Slot | +weightKg | +volumeL | Recipe                                         |
| ---------------- | ------------------ | ---- | --------- | -------- | ---------------------------------------------- |
| `leather_satchel`| Leather Satchel    | belt | +8        | +10      | 2× light_leather + 1× linen_strip              |
| `canvas_pack`    | Canvas Field Pack  | back | +20       | +25      | 2× linen_cloth + 1× sturdy_leather + 2× cordage |
| `tool_holster`   | Tool Holster       | belt | +5        | +8       | 1× sturdy_leather + 1× cordage                 |
| `basket_frame`   | Wicker Frame Pack  | back | +12       | +30      | 4× branch + 3× plant_fiber + 2× cordage        |

The `back` slot is separate from torso armour. A pawn auto-drops their pack when
entering melee (COMBAT-SYSTEM defines the exact trigger); the dropped pack stays on
the tile as a loose item for haulers.

---

## Part II — Equipment Slots

### Full slot model

```typescript
export interface PawnEquipment {
  // Hands
  mainHand? : EquippedItem;   // primary weapon (one-handed or two-handed)
  offHand?  : EquippedItem;   // shield, off-hand weapon, or empty; locked by two-handers

  // Head — two layers
  headBase? : EquippedItem;   // arming cap, padded coif, leather coif, mail coif
  headOuter?: EquippedItem;   // nasal helm, spangenhelm, great helm

  // Body — three layers (core of the layered system)
  bodyBase? : EquippedItem;   // gambeson / padded arming doublet
  bodyMid?  : EquippedItem;   // mail hauberk / brigandine / scale hauberk
  bodyOuter?: EquippedItem;   // plate cuirass / coat of plates / lamellar

  // Extremities
  gloves?   : EquippedItem;   // leather gloves → riveted iron gauntlets
  boots?    : EquippedItem;   // hide boots → iron-shod boots

  // Accessories
  gorget?   : EquippedItem;   // neck/throat guard; chain gorget
  ring?     : EquippedItem;   // one ring slot (Phase 1); second deferred
  belt?     : EquippedItem;   // belt / baldric; grants carry bonus (see Part I)
  back?     : EquippedItem;   // backpack / frame pack; grants carry bonus
}

export type EquipmentSlot =
  | 'mainHand' | 'offHand'
  | 'headBase' | 'headOuter'
  | 'bodyBase' | 'bodyMid' | 'bodyOuter'
  | 'gloves' | 'boots' | 'gorget' | 'ring'
  | 'belt' | 'back';
```

The old `tool` and `accessory` slots are removed. Rings of power and focus items
are `ring`/`gorget` — spec'd in [MAGIC-SKILLS](MAGIC-SKILLS.md) and not designed here.

---

## Part III — Layered Armour

### `armorProperties` field additions

```jsonc
"armorProperties": {
  "armorValue"      : 22,       // damage points absorbed per hit from this layer
  "fatiguePerTurn"  : 0.6,      // fatigue drain per turn while worn
  "armorLayer"      : "mail",   // "gambeson" | "mail" | "plate"
  "slot"            : "bodyMid" // which PawnEquipment slot this item fills
}
```

`armorLayer` controls rendering order and damage cascade routing; `slot` controls
which field it occupies in `PawnEquipment`.

### Damage cascade (torso hit)

```
incoming damage
  → bodyOuter absorbs min(armorValue × durabilityFraction, remainder)
  → bodyMid  absorbs min(armorValue × durabilityFraction, remainder)
  → bodyBase absorbs min(armorValue × durabilityFraction, remainder)
  → body HP receives remainder
```

Head hits cascade identically (headOuter → headBase → head HP). Blunt weapons and
high `armorPenetration` bypass a fraction of each layer — COMBAT-SYSTEM owns that
formula. On each absorbed hit the absorbing layer loses `durabilityLossPerCombatHit`
durability.

### Fatigue cost

Total fatigue drain per turn from armour = Σ `fatiguePerTurn` across all worn layers.
A full kit (gambeson + mail hauberk + brigandine outer + mail coif + nasal helm +
gauntlets) drains roughly 1.5–2× base fatigue rate — enough to make heavy infantry a
meaningful endurance trade-off.

### Layer mixing

Any combination is valid. Wearing mail with no gambeson beneath is painful but legal;
wearing a gambeson alone is the "unarmoured fighter" path. No enforced dressing order
beyond one item per slot.

---

## Part IV — Item Field Extensibility

All new fields are **flat optional** on `Item`. Nested objects (`weaponProperties`,
`armorProperties`) expand their own field lists only; top-level `Item` stays flat:

```typescript
// Already live
weightKg?                  : number;
volumeL?                   : number;
durabilityLossPerCombatHit?: number; // new; separate from durabilityLossPerAction

// Stubs — wired when SEASONS_WEATHER Phase B ships
weatherResistance?  : number; // 0–1; reduces rain/blizzard fatigue multiplier
coldProtection?     : number; // °C-equivalent offset; shifts pawn comfort range
heatProtection?     : number; // negative °C offset; shifts comfort under heat waves

// inventoryBonus — carry containers only
inventoryBonus?: { weightKg: number; volumeL: number };
```

Items simply omit fields they don't use (treated as 0). No migration required when
new fields are added.

---

## Part V — Weapons by Tier

### Durability model

`durabilityLossPerCombatHit` is separate from `durabilityLossPerAction` (work tools).
Improvised weapons shatter after one or two fights by design — the player must keep
knapping stone until metal arrives.

| Tier             | durabilityLossPerCombatHit | Approx. engagements before broken |
| ---------------- | -------------------------- | ---------------------------------- |
| Tier 0 Improvised | 40–50                     | 1–2                                |
| Tier 1 Bronze    | 10–15                      | 4–8                                |
| Tier 2 Iron      | 4–7                        | 12–25                              |
| Tier 3 Steel     | 1–3                        | 40+                                |

At 0 durability the item is **unusable but not destroyed** — it sits in the slot
providing nothing until repaired. See Part VII.

### Tier 0 — Improvised (Maker's Bench; no research)

| id                 | Historical name         | Dam  | maxDur | Recipe                                                                   |
| ------------------ | ----------------------- | ---- | ------ | ------------------------------------------------------------------------ |
| `flint_knife`      | Knapped Flint Knife     | 2–5  | 20     | 2× flint_shard + 1× plant_fiber (binding) — mainHand or offHand         |
| `stone_spear`      | Fire-Hardened Spear     | 4–8  | 30     | 1× pine_log (straightened) + 1× flint_shard + 2× plant_fiber; fire-harden at hearth |
| `flint_handaxe`    | Flint Handaxe           | 3–7  | 20     | 2× flint_shard + 1× branch + 1× plant_fiber                             |
| `knucklebone_club` | Knucklebone Club        | 3–6  | 25     | 1× bone_fragment + 1× branch + 1× cordage                               |
| `wattle_buckler`   | Wattle Buckler (shield) | —    | 15     | 4× branch + 3× plant_fiber — offHand only                               |

`durabilityLossPerCombatHit: 40`. Expected: 1–2 engagements before needing repair.
Repair at Maker's Bench costs half the original materials. Flint knife and stone spear
already exist in `items.jsonc`; flint handaxe and knucklebone club are new.

**New prerequisite items** needed in `items.jsonc`: `bone_fragment` (butchery
by-product, already partially spec'd under butcher output), `sinew` (butchery
by-product — needed for bowstrings), `linen_cloth`/`linen_strip` (from flax/hemp
plant fiber processing, new mid-game textile chain).

### Tier 1 — Bronze Age (Stone Forge; requires research: Basic Metallurgy)

| id                    | Historical name              | Dam   | maxDur | Recipe                                                                         |
| --------------------- | ---------------------------- | ----- | ------ | ------------------------------------------------------------------------------ |
| `leaf_blade_spear`    | Leaf-Blade Spear             | 7–13  | 70     | 1× bronze_bar + 1× clay_mold (worn) + 1× ash_log (shaft) + 2× linen_strip     |
| `bronze_punch_dagger` | Bronze Punch Dagger          | 5–9   | 60     | 1× copper_bar + 1× clay_mold (worn) + 1× bone_fragment (grip scales)          |
| `cast_bronze_hatchet` | Cast Bronze Hatchet          | 8–14  | 65     | 1× bronze_bar + 1× clay_mold (worn) + 1× birch_log (haft) + 1× cordage        |
| `self_bow`            | Self Bow (ranged, range: 6)  | 5–10  | 80     | 1× yew_log (stave) + 1× sinew + 1× cordage; Maker's Bench                     |
| `rawhide_round_shield`| Rawhide-Faced Round Shield   | —     | 60     | 2× oak_plank + 1× heavy_leather + 1× cordage (rim binding); offHand           |

`durabilityLossPerCombatHit: 12`. Expected: 5–8 engagements.

### Tier 2 — Iron Age (Bloomery + Smithy Anvil; requires research: Advanced Metallurgy)

| id                  | Historical name                  | Dam   | maxDur | Recipe                                                                        |
| ------------------- | -------------------------------- | ----- | ------ | ----------------------------------------------------------------------------- |
| `short_seax`        | Short Seax                       | 9–14  | 100    | 1× iron_bar + 1× clay_mold + 1× oak_plank (grip scales) + 1× linen_strip     |
| `spatha`            | Spatha                           | 13–20 | 120    | 2× iron_bar + 1× clay_mold + 1× ash_log (grip) + 2× light_leather + 1× linen_strip |
| `bearded_axe`       | Bearded Axe                      | 14–21 | 110    | 2× iron_bar + 1× clay_mold + 1× ash_log (haft) + 1× cordage                  |
| `framea`            | Framea (thrusting spear)         | 11–17 | 100    | 1× iron_bar + 1× clay_mold + 1× ash_log (shaft) + 2× linen_strip             |
| `war_bow`           | War Bow (ranged, range: 10)      | 10–17 | 100    | 1× yew_log (long stave) + 2× sinew + 1× cordage; Maker's Bench               |
| `iron_boss_shield`  | Iron-Bossed Kite Shield          | —     | 150    | 2× oak_plank + 1× iron_bar + 1× clay_mold + 1× heavy_leather + 2× cordage   |

`durabilityLossPerCombatHit: 5`. Expected: 20–25 engagements.

### Tier 3 — Steel / Enchanted (Deferred)

Steel weapons, enchanted items, staves and foci. Design deferred until Tiers 0–2
are balanced. Magic-attuned gear is [MAGIC-SKILLS](MAGIC-SKILLS.md)'s scope.

---

## Part VI — Armour by Tier

### Tier 0 — Improvised protection

| id              | Name                  | Layer    | Slot     | armorValue | fatiguePerTurn | Recipe                              |
| --------------- | --------------------- | -------- | -------- | ---------- | -------------- | ----------------------------------- |
| `raw_hide_vest` | Raw Hide Vest         | gambeson | bodyBase | 4          | 0.10           | 2× deer_hide + 2× cordage           |
| `padded_cap`    | Padded Linen Cap      | gambeson | headBase | 2          | 0.05           | 2× linen_strip + 1× plant_fiber     |

### Tier 1 — Bronze Age cloth & leather

| id                      | Name                       | Layer    | Slot      | armorValue | fatiguePerTurn | Recipe                                         |
| ----------------------- | -------------------------- | -------- | --------- | ---------- | -------------- | ---------------------------------------------- |
| `linen_gambeson`        | Linen Gambeson             | gambeson | bodyBase  | 8          | 0.20           | 6× linen_cloth + 2× plant_fiber (quilting)     |
| `boiled_leather_jerkin` | Boiled Leather Jerkin      | mail     | bodyMid   | 10         | 0.25           | 3× sturdy_leather + 1× cordage; hide_rack      |
| `leather_coif`          | Leather Coif               | gambeson | headBase  | 4          | 0.10           | 2× light_leather + 1× cordage                  |
| `cast_bronze_cap`       | Cast Bronze Skullcap       | plate    | headOuter | 12         | 0.20           | 1× bronze_bar + 1× clay_mold (worn)            |
| `leather_gauntlets`     | Stitched Leather Gauntlets | —        | gloves    | 3          | 0.05           | 1× light_leather + 1× linen_strip              |
| `tallow_boots`          | Tallow-Dressed Hide Boots  | —        | boots     | 2          | 0.05           | 2× light_leather + 1× cordage                  |

### Tier 2 — Iron Age mail & plate

| id                 | Name                      | Layer    | Slot      | armorValue | fatiguePerTurn | Recipe                                                        |
| ------------------ | ------------------------- | -------- | --------- | ---------- | -------------- | ------------------------------------------------------------- |
| `mail_coif`        | Riveted Mail Coif         | mail     | headBase  | 10         | 0.25           | 6× iron_bar (wire-drawn) + 1× linen_gambeson (liner)         |
| `iron_nasal_helm`  | Iron Nasal Helm           | plate    | headOuter | 16         | 0.30           | 2× iron_bar + 1× clay_mold + 1× light_leather (cheek pads)  |
| `mail_hauberk`     | Riveted Mail Hauberk      | mail     | bodyMid   | 22         | 0.60           | 12× iron_bar (wire-drawn rings) + 1× linen_gambeson (worn under) |
| `brigandine_coat`  | Brigandine Coat           | plate    | bodyOuter | 20         | 0.50           | 6× iron_bar (plates) + 4× sturdy_leather + 2× linen_cloth    |
| `iron_gauntlets`   | Riveted Iron Gauntlets    | —        | gloves    | 8          | 0.20           | 2× iron_bar + 1× clay_mold + 1× light_leather (palm lining)  |
| `iron_shod_boots`  | Iron-Shod Boots           | —        | boots     | 6          | 0.15           | 2× iron_bar (plates) + 2× sturdy_leather                     |
| `iron_gorget`      | Riveted Iron Gorget       | —        | gorget    | 8          | 0.10           | 1× iron_bar + 1× clay_mold + 1× light_leather (lining)       |

---

## Part VII — Combat Durability & Repair

Each combat hit (dealt or received) drains both the wielded weapon and the struck
armour layer by `durabilityLossPerCombatHit`. Durability tracks on the `EquippedItem`
record (`EquippedItem.durability`), not on the stockpile item.

**Protection efficiency**: `effectiveArmor = armorValue × clamp(dur/maxDur, 0.3, 1.0)` —
a battered piece still offers 30% at near-zero durability. At 0 it grants nothing.

**Repair** station: Smithy for iron/bronze; Maker's Bench for primitive gear.
Cost = `ceil((maxDurability – currentDurability) / 20)` × original crafting material
fraction (nearest integer). Work category: `metalworking` for metal; `crafting` for
organic/wood.

---

## Part VIII — Implementation Plan

### Phase A — Inventory weight & volume

1. Add `weightKg` and `volumeL` to every entry in `items.jsonc`.
2. Rewrite `PawnInventory` in `types.ts` (replace slot fields with weight/volume budgets).
3. Add `inventoryBonus` to `Item` interface; add carry-container items to `items.jsonc`
   and their recipes to `recipes.jsonc`.
4. `ItemService.getCarryBudget(pawn)` — derives limits from equipped belt/back.
5. `ItemService.canAddToInventory(pawn, itemId, qty)` — weight + volume check.
6. Update all `PawnInventory` reads across services and UI.

### Phase B — Equipment slot expansion

1. Replace `PawnEquipment` and `EquipmentSlot` in `types.ts` with the expanded model.
2. Extend `Item.armorProperties` with `armorLayer` and `slot`; add `durabilityLossPerCombatHit`.
3. Add stub fields `weatherResistance?`, `coldProtection?`, `heatProtection?` to `Item`
   interface (typed optional, wired when SEASONS_WEATHER Phase B ships).
4. Add all Tier 0–2 weapon + armour entries to `items.jsonc` and `recipes.jsonc`.
5. Add new prerequisite items: `bone_fragment` (butchery by-product), `sinew` (butchery
   by-product), `linen_cloth` / `linen_strip` (plant fiber → textile chain, new recipes).

### Phase C — Service wiring (requires COMBAT-SYSTEM)

1. `ItemService.getArmorLayers(pawn)` — returns ordered layers for damage cascade.
2. `ItemService.applyDurabilityDecay(equippedItem, hits)` — per-hit drain.
3. `ItemService.getRepairCost(equippedItem)` — material fraction calculation.
4. Wire layered damage cascade into COMBAT-SYSTEM hit resolution.
5. Wire repair into post-combat Smithy work queue.

---

## Open Questions

- [ ] Two-handed weapons locking offHand — COMBAT-SYSTEM resolves; flag at equip time if needed.
- [ ] Leg slots (`legMid`, `legOuter` for iron chausses/greaves) — deferred; add when iron greaves enter the build.
- [ ] Second ring slot — deferred to Phase 2.
- [ ] Auto-drop pack on combat entry — yes; COMBAT-SYSTEM defines the exact trigger; pack drops as loose item on current tile.
- [ ] Linen textile chain (flax → linen_cloth → linen_strip) — prerequisite for gambeson and some weapon wraps; needs a dedicated entry in recipes.jsonc and a flax resource node.
