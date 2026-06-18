<!-- LOC cap: 360 (created: 2026-06-12) -->

# RANGED COMBAT & AMMUNITION

> **Related:** [ROADMAP](ROADMAP.md) · [COMBAT-SYSTEM](COMBAT-SYSTEM.md) · [EQUIPMENT-EXPANSION](../archive/EQUIPMENT-EXPANSION.md) · [ENTITIES_SPAWNING](ENTITIES_SPAWNING.md) · [MAGIC-SKILLS](MAGIC-SKILLS.md) · [ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md) (LoS dep + hot-loop rules) · [game/DESIGN](../game/DESIGN.md)

## Status

Not started. **Hard-blocked by** COMBAT-SYSTEM (complete), EQUIPMENT-EXPANSION (the bow
items + `range`/`reach`/`twoHanded` weapon fields), **and line-of-sight** — the `blocksSight`
WASM raycast (ADR-019) is still **deferred/parked** in [ENGINE-PERFORMANCE §5](ENGINE-PERFORMANCE.md);
ranged resolution consumes it (§I) and cannot land before it. COMBAT-SYSTEM explicitly deferred
"ranged attacks" to a later spec — this is that spec. Magic-attuned ranged weapons
(`staff` bolts, enchanted ammunition) belong to [MAGIC-SKILLS](MAGIC-SKILLS.md) and are
excluded here.

---

## Goals

1. Make `weaponProperties.range > 0` mechanically real: a ranged attacker strikes a
   target up to `range` tiles away, gated by line-of-sight, **without** closing to melee.
2. Add **ammunition** as a consumed resource — bows need arrows, slings need stones,
   crossbows need bolts. No ammo → the weapon can't fire (falls back to melee/unarmed).
3. A clear **primitive → sophisticated** progression mirroring the rest of the game:
   thrown rock → sling → self bow → war bow → crossbow.
4. Tactical depth: range advantage vs. reload downtime, cover, and the kiting/closing
   dance against melee enemies — without a full turn-based positioning rewrite.

---

## Part I — Combat Resolution

Ranged resolution slots into the **existing** auto-combat FSM (COMBAT-SYSTEM Part: turn
loop). It is **not** a new mode. When a pawn/mob in Combat mode holds a weapon with
`range > 0` and has compatible ammunition, its attack each tick resolves as ranged:

```
target in melee reach (≤ reach tiles)?   → attacker may still melee (butt of bow), see §IV
target beyond reach but ≤ range tiles?    → ranged attack IF line-of-sight AND ammo > 0
target beyond range, or no LoS, or no ammo → close distance (move toward target) this tick
```

### Resolution model — abstracted hitscan, NOT a projectile entity (DF/RimWorld lineage)

**The key architectural fork.** RimWorld and Dwarf Fortress both model a shot as a **real
traveling projectile** — a spawned thing/item that advances tile-by-tile and resolves on
arrival. That buys emergent *wild shots* (a miss continues and may hit a wall/ally), trajectory,
knockback, and a bolt that physically lands where it can be recovered. We **deliberately do not**
copy that here: a projectile pool is a **new per-tick sim phase** advancing N flying entities, and
ENGINE-PERFORMANCE's whole arc was about *not* adding hot-loop work + entities to the snapshot
(§VI). Instead we **resolve the hit instantly on the firing tick** (hitscan) and reproduce only the
outcomes we want as cheap post-hoc effects: recovery = spawn the bolt as a `DroppedItem` on the
target tile (§II), "wild shot" friendly-fire = an *optional* roll along the sampled LoS line (Open
Questions), never a live projectile. This keeps ranged inside the existing FSM tick at ~zero added
allocation. *(Reconsider only if a projectile-physics layer is ever wanted for its own sake — it is
a feature, not a perf need.)*

### Hit chance

Reuse the COMBAT-SYSTEM hit formula, with ranged-specific modifiers folded in:

```
rangedHit = baseHit(attacker)                        // hit_chance stat (× sight × manipulation)
          + weaponProperties.accuracy
          − distancePenalty(dist, range)             // see below
          − coverPenalty(target)                     // 0.20 if target adjacent to wall/tree (existing rule)
          + flankingBonus                            // existing 0.15 — does not apply to ranged; set 0
```

`distancePenalty = clamp((dist − optimalRange) × 0.04, 0, 0.4)` where
`optimalRange = ceil(range × 0.5)`. Firing at the edge of your range is hard; mid-range
is the sweet spot; point-blank is fine. This makes `range` a real stat, not just reach.

### Line-of-sight

A straight Bresenham line from attacker to target; if any tile on it is a sight-blocker
(wall, full-canopy tree, cliff) the shot is blocked → attacker closes instead. **Reuse
the existing fog-of-war / visibility spatial service** (ADR-008) — do **not** inline a
new ray-cast in Combat.ts. If the visibility service does not yet expose a
`hasLineOfSight(a, b)` query, add it **to that service interface**, not to combat code.

### Damage & wounds

Damage uses `damMin..damMax` (EQUIPMENT-EXPANSION) rolled as normal, `damageType`
usually `piercing` → routes through the existing wound table (arrow = piercing, organ-
penetration chance). Armour layer cascade applies unchanged. STR scaling applies to
**bows** (draw weight) but **not** to crossbows or slings (mechanical advantage) — gated
by a `strScaled?: boolean` weapon flag (default true; crossbows/slings set false).

---

## Part II — Ammunition Model

Ammunition is a **bulk consumable**, tracked like other materials (not an `ItemInstance`).
A new flat optional field on `Item` links a weapon to its ammo category:

```typescript
// weaponProperties additions
ammoCategory? : string;   // e.g. "arrow" | "bolt" | "sling_stone"; omitted = no ammo needed (thrown weapons self-consume)
```

Ammo items carry a category tag so any matching ammo feeds any weapon of that category
(better ammo = better result, same dynamic-material philosophy as recipes):

```jsonc
"ammoProperties": {
  "ammoCategory" : "arrow",
  "damageBonus"  : 0,      // flat add to weapon damage roll
  "accuracyBonus": 0,      // flat add to hit
  "armorPen"     : 0.0,    // added to weapon armorPenetration
  "recoverable"  : 0.5     // 0–1 chance to recover the projectile from the ground/corpse after a fight
}
```

On each ranged attack: decrement the attacker's ammo stack by 1. When the stack hits 0,
the weapon stops firing and the pawn closes to melee. **Recovery** (post-combat): for each
spent projectile, roll `recoverable` → spawn it as a `DroppedItem` on the target's tile
(haulable like any drop). Cheap arrows shatter; good ones can be retrieved.

### Where ammo lives

Ammo is drawn from the pawn's **inventory** (weight/volume counted, per
EQUIPMENT-EXPANSION). A `quiver`/`bolt_case` could later be a `belt`-slot carry container
that boosts ammo capacity — deferred; ammo just rides normal inventory for now.

---

## Part III — Weapons & Ammunition by Tier

Damage/range/AP values are tuned against the EQUIPMENT-EXPANSION melee tiers so ranged is
a side-grade (range + safety) traded against ammo cost and reload, not a strict upgrade.

### Tier 0 — Thrown & Sling (Maker's Bench)

| id              | Name              | dam   | range | ammoCategory | reload | maxDur | Recipe                                    |
| --------------- | ----------------- | ----- | ----- | ------------ | ------ | ------ | ----------------------------------------- |
| `throwing_stone`| Throwing Stone    | 2–5   | 3     | — (self)     | —      | 1      | self: a `small_stone` thrown (consumed)   |
| `sling`         | Sling             | 4–8   | 5     | sling_stone  | 1      | 25     | 1× light_leather + 1× cordage             |
| `throwing_spear`| Throwing Spear    | 6–11  | 4     | — (self)     | —      | 20     | 1× stone_spear (the spear *is* the ammo)  |

`sling_stone`: ammo, `1× small_stone → 4× sling_stone` (knapped round), recoverable 0.3.
Thrown weapons (`throwing_stone`, `throwing_spear`) self-consume: the weapon item leaves
the hand and becomes a `DroppedItem` (recoverable by walking onto the tile).

### Tier 1 — Bow (Stone Forge / Maker's Bench; research: Basic Metallurgy for tips)

| id          | Name      | dam  | range | ammoCategory | reload | strScaled | maxDur | Recipe (from EQUIPMENT-EXPANSION)              |
| ----------- | --------- | ---- | ----- | ------------ | ------ | --------- | ------ | --------------------------------------------- |
| `self_bow`  | Self Bow  | 5–10 | 6     | arrow        | 1      | yes       | 80     | 1× yew_log (ash/oak via materialBonuses) + 1× sinew + 1× cordage |

Ammo:
| id              | Name            | dmg+ | acc+ | AP   | recover | Recipe                                          |
| --------------- | --------------- | ---- | ---- | ---- | ------- | ----------------------------------------------- |
| `flint_arrow`   | Flint-Tipped Arrow | 0 | 0    | 0.05 | 0.4     | 1× branch + 1× flint_shard + 1× cordage → 4×    |
| `bone_arrow`    | Bone-Tipped Arrow  | 1 | 0    | 0.0  | 0.5     | 1× branch + 1× medium_bones + 1× cordage → 4×   |

### Tier 2 — War Bow & Crossbow (Bloomery + Anvil; research: Advanced Metallurgy)

| id          | Name         | dam   | range | ammoCategory | reload | strScaled | maxDur | Recipe                                              |
| ----------- | ------------ | ----- | ----- | ------------ | ------ | --------- | ------ | --------------------------------------------------- |
| `war_bow`   | War Bow      | 10–17 | 10    | arrow        | 1      | yes       | 100    | 1× yew_log (or ash) + 2× sinew + 1× cordage         |
| `crossbow`  | Crossbow     | 14–22 | 8     | bolt         | 3      | no        | 130    | 2× oak_plank + 1× iron_bar + 1× clay_mold + 1× sinew + 1× cordage |

`crossbow`: high damage, ignores STR, but `reload: 3` (fires once every 3 attack ticks —
see §IV) and `armorPenetration` baked higher. The "point-and-click heavy hitter" vs. the
war bow's "fast but STR-gated" — a real choice.

Ammo:
| id            | Name          | dmg+ | acc+ | AP   | recover | Recipe                                       |
| ------------- | ------------- | ---- | ---- | ---- | ------- | -------------------------------------------- |
| `iron_arrow`  | Iron Bodkin Arrow | 2 | 0  | 0.20 | 0.6     | 1× branch + 1× iron_bar (→ 8 heads) + 1× cordage → 8× |
| `iron_bolt`   | Iron Crossbow Bolt | 3 | 1 | 0.25 | 0.65    | 1× branch + 1× iron_bar (→ 6 heads) + 1× cordage → 6× |

---

## Part IV — Reload & Cadence

`weaponProperties.reload` (new, optional; default 0) = attack ticks the weapon needs
between shots. Modeled with the **existing** `attackCooldown` field on Pawn/Mob
(COMBAT-SYSTEM) — a ranged weapon adds `reload` to the post-shot cooldown:

```
afterShot: attacker.attackCooldown += reload   // on top of the normal swing cooldown
```

So a crossbow (`reload 3`) genuinely fires a third as often as a sling. No new turn
structure — it rides the cooldown the FSM already ticks down.

### Aim warmup (RimWorld lineage, optional refinement)

RimWorld splits a ranged attack into **warmup (aim) → fire → cooldown**, not cooldown alone.
The warmup is what makes *target-switching* costly and rewards holding a bead on one enemy — real
tactical texture for ~one extra scalar. Optional `weaponProperties.warmup` (default 0): on first
acquiring/changing target, set `attacker.attackCooldown = warmup` **before** the shot resolves;
re-firing on the *same* target skips it. Rides the same cooldown the FSM ticks (zero new
structure), so it's a pure data knob — a sniper-y war bow can have a long warmup + long range, a
sling near-zero. Land it only if cadence feels flat with reload alone.

### Melee fallback (bow-butt)

A pawn cornered (enemy in melee reach) with a ranged weapon still defends: it makes a weak
`blunt` melee strike (`damMax × 0.4`, the bow stave / sling pommel) rather than firing into
contact. This reuses the unarmed-fallback path in `attackerProfile()` — gate it on
"enemy within reach and weapon is ranged."

---

## Architecture lineage — Dwarf Fortress / RimWorld

These two are the genre's reference implementations of colony-sim ranged combat; the spec borrows
their *proven* structure and consciously diverges only where our constraints differ (no positioning
layer; the per-tick worker budget, §VI). The matrix below records each borrowed/adapted/rejected
decision so it isn't re-litigated:

| Insight (source) | How this spec applies it |
| ---------------- | ------------------------ |
| **Unified attack abstraction** — RimWorld *Verbs* (one class spans melee+ranged: range, warmup, cooldown) | **Borrowed.** Ranged reuses `attackerProfile()` + the existing FSM, not a parallel system (Part I) — `range > 0` is the only branch. |
| **Shot = traveling projectile** — RimWorld `Projectile` things; DF physical bolts with trajectory/momentum | **Rejected (perf).** Abstracted hitscan + post-hoc effects instead — see "Resolution model", §I. A projectile pool is a new hot-loop phase (§VI). |
| **Wild/forced-miss shots hit something else** — RimWorld misses keep flying; DF bolts ricochet | **Adapted (deferred).** No live projectile to deflect → friendly-fire becomes an *optional* roll along the sampled LoS line (Open Questions), off by default. |
| **Range-banded accuracy** — RimWorld weapons author 4 accuracy values (touch/short/medium/long) | **Considered.** We ship a single continuous `distancePenalty` curve (§I) for now; per-weapon bands are the data-driven upgrade if weapons need stronger individual "personality". |
| **Aim warmup before fire** — RimWorld warmup → fire → cooldown | **Borrowed (optional).** `weaponProperties.warmup`, target-switch cost, rides `attackCooldown` — §IV. |
| **Ammo is hauled items + quiver assignment** — DF marksdwarf bolt logistics | **Adapted.** Ammo is bulk-consumable from inventory now (§II); the `quiver`/hauling supply-loop is the deferred DF-style layer (Open Questions) — fits the existing job/haul system. |
| **Directional / fractional cover** — RimWorld per-cell cover sampled near the target | **Simplified.** Binary 0.20 adjacency penalty (§I); RimWorld's directional model is the richer later version once positioning matters. |
| **Marksdwarf switches to melee in contact** — DF; RimWorld pawns melee when adjacent | **Borrowed.** The bow-butt fallback (§IV). |
| **Staggered threat AI; mutate live entities at 60 Hz, consumers read copies** — DF/RimWorld tick model | **Already in place** — ENGINE-PERFORMANCE's auto-defend throttle + the worker snapshot (§VI-1/2). Ranged AI re-uses it, doesn't add a 60 Hz scan. |

---

## Part V — Implementation Plan

### Phase A — Data & types (no behaviour change)

1. `types.ts`: add `ammoCategory?`, `reload?`, `strScaled?` to `weaponProperties`; add
   `ammoProperties?` block to `Item`.
2. `items.jsonc` + `recipes.jsonc`: add the weapons and ammo above. (`self_bow`/`war_bow`
   already exist from EQUIPMENT-EXPANSION — just add the new fields to them.)
3. New `arrow`/`bolt`/`sling_stone` item categories; ammo recipes (dynamic where they use
   `wood`/`metal` category slots).

### Phase B — Combat resolution (the meat)

4. `Combat.ts` `attackerProfile()`: branch on `range > 0` + ammo availability → build a
   ranged profile (distance penalty, no flanking, conditional STR scaling). **Perf (§VI-1):**
   this runs in the per-tick worker combat phase — compute scalars inline / into a reused
   scratch object; do **not** allocate a fresh profile object per attacker per tick.
5. FSM tick (COMBAT-SYSTEM turn loop): if target beyond `reach` but within `range` and LoS
   and ammo > 0 → ranged attack; else if beyond range/no LoS → move-to-close; else melee.
6. Ammo decrement + the bow-butt melee fallback. **Perf (§VI-1):** mutate the live pawn/ammo
   stack **in place** (pawns are already mutated in place — ADR-002 amendment / M2); no
   pawns-array rebuild or `{...pawn}` patch.
7. `reload` → `attackCooldown` addition (in-place scalar bump on the pawn).

### Phase C — Line-of-sight & recovery

8. Add `hasLineOfSight(a, b)` to the **spatial/visibility service interface** (ADR-008);
   Combat calls the interface only. Cover penalty reuses the existing adjacency check.
   **Perf (§VI-2):** the query is WASM; do **not** inline a JS Bresenham in the combat hot
   loop. Amortise — only re-test LoS when attacker or target moved (cache the last result),
   or stagger like the auto-defend threat scan (every N ticks, offset by `debugId`), not 60 Hz.
9. Post-combat ammo recovery → spawn `DroppedItem`s; thrown-weapon self-consume → drop the
   weapon `ItemInstance` on the target tile. **Perf (§VI-3):** batch recovery into ONE pass at
   combat end (not per-shot per-tick) — `droppedItems` ships whole every snapshot flush and is
   the next growth lever (ENGINE-PERFORMANCE §D8).

### Phase D — UI & feedback

10. Combat log lines for ranged hits/misses/out-of-ammo ("Bjorn looses his last arrow").
11. Equipment/inventory panel: show equipped ranged weapon's ammo count and a low-ammo warning.
    **Perf (§VI-4):** ammo lives in `inventory`, a **cold resync field** (refreshed ~every 32nd
    flush, ENGINE-PERFORMANCE D5) — the count read in `projectSentEntity` will be ≤~2 s stale.
    Fine for a low-ammo *warning*; if a live readout is wanted, promote a small `ammoCount`
    scalar into the **sent** entity projection (`entityProjection.ts`) rather than un-cold-ing
    the whole inventory.

---

## Part VI — Performance compliance (ENGINE-PERFORMANCE)

Ranged combat lands inside the **per-tick worker combat phase** and touches `droppedItems` +
the snapshot — exactly the surfaces ENGINE-PERFORMANCE spent its arc fixing. Honour these so the
feature doesn't re-introduce a known regression (each maps to a finding there):

- [ ] **§VI-1 — no per-tick allocation in the combat tick (ADR-002 amendment / ★ DONE, M2/M4).**
  M4 left `combat` immutable *because it's compute-bound, not alloc-bound* — that licence only
  holds if ranged code **adds no allocation**: reuse a scratch attacker profile, mutate the live
  pawn + ammo stack in place, bump `attackCooldown` in place. No `{...pawn}` / pawns-array rebuild
  on the hot path (that's the 12.5× immutable tax, §9).
- [ ] **§VI-2 — LoS through the WASM spatial service, amortised (ADR-008/019, §C).** No JS
  Bresenham in the loop; ENGINE-PERFORMANCE defers the spatial index precisely to fold
  nearest/vision/**LoS**/fog into ONE amortised service. Cache per attacker–target and only
  re-query on movement, or stagger off `debugId` — a 60 Hz O(range) raycast per attacker is the
  per-tick spatial cost §C warns against (cf. the reverted uniform-grid, §B).
- [ ] **§VI-3 — `droppedItems` stays bounded.** Recovery + thrown-weapon drops spawn into
  `droppedItems`, which ships **whole every flush and grows unbounded** (the next D8 lever). Batch
  recovery once at combat end; don't drop-per-shot-per-tick. Recovered ammo benefits automatically
  once `droppedItems` deltas land.
- [ ] **§VI-4 — snapshot cost: don't un-cold inventory for the HUD ammo count** (D5/D8) — see step 11.
- [ ] **§VI-5 — touch no worldMap tiles.** Drops go to `droppedItems`, LoS reads tiles read-only.
  If anything ever writes a tile (scorch, etc.), mutate **in place + `markTileDirty`** (D6) — never
  `worldMap.map()` (that flips the ref → full 38k re-clone + terrain rebuild, the harvest cliff).

---

## Open Questions

- [ ] Dedicated `quiver` (belt-slot ammo container, +ammo volume) + the DF-style **ammo
  haul/assignment** supply-loop — deferred; ammo rides normal inventory for now.
- [ ] Friendly-fire on the LoS line (ally between shooter and target) — deferred; assume
  shooters pick clear lines. *(This is RimWorld's emergent wild-shot, but since we hitscan
  rather than spawn a projectile, it'd be an explicit roll over the sampled LoS cells, not a
  deflected entity — see "Resolution model", §I.)*
- [ ] Mob ranged attackers (archer goblins) — data-only once Phase B lands; creatures get a
  ranged `naturalWeapon`/equipped bow + an ammo pool. Tracked, not in initial scope.
- [ ] Moving-shot accuracy penalty (fire-on-the-move vs. braced) — deferred; needs the
  positioning layer to distinguish, which we don't model yet.
- [ ] Enchanted/elemental ammo and `staff` bolts → [MAGIC-SKILLS](MAGIC-SKILLS.md).
