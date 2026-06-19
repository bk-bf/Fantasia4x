<!-- LOC cap: 360 (created: 2026-06-12) -->

# RANGED COMBAT & AMMUNITION

> **Related:** [ROADMAP](ROADMAP.md) · [COMBAT-SYSTEM](../archive/COMBAT-SYSTEM-2026-06-11.md) · [EQUIPMENT-EXPANSION](../archive/EQUIPMENT-EXPANSION.md) · [ENTITIES_SPAWNING](ENTITIES_SPAWNING.md) · [MAGIC-SKILLS](MAGIC-SKILLS.md) · [ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md) (LoS dep + hot-loop rules) · [TRAITS-AND-PERKS](TRAITS-AND-PERKS.md) (soft-class perks tune these axes) · [game/DESIGN](../game/DESIGN.md)

## Status

**Core implemented 2026-06-18** (Phases A–C + log feedback; `pnpm check` clean bar 2 pre-existing
`entitySim.test.ts` errors, full suite 362 green incl. 8 new `combatRanged.test.ts`). Weapons + ammo
+ recipes are in the databases; `combatService.tickCombat` resolves ranged shots (distance penalty,
ammo spend, reload cadence, STR-scaling gate, cover, bow-butt) and the pawn FSM stands-and-fires /
closes to range; spent ammo recovers as `DroppedItem`s.

**LoS scope reduced (user decision):** "line of sight" is a **`distance ≤ visionRange` stat check**
(`pawnVisionRange`, base perception formula — a scalar comparison, ADR-008/Rust untouched), **not** the
`blocksSight` WASM raycast (ADR-019, still parked in [ENGINE-PERFORMANCE §5](ENGINE-PERFORMANCE.md)).
The real occluder raycast can replace `withinSight` later without changing callers.

**Deferred (not in this cut):** aim `warmup` (data field added, behaviour optional/unwired);
thrown-weapon self-consume (throwing_stone/spear fire without consuming for now); dynamic wood/metal
ammo recipe slots (fixed inputs); the dedicated equipped-weapon low-ammo badge (ammo counts already
show in `PawnInventory`); mob ranged attackers. COMBAT-SYSTEM deferred "ranged attacks" to this spec;
magic-attuned ranged weapons belong to [MAGIC-SKILLS](MAGIC-SKILLS.md).

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

## Part IV — Aim Cadence (`aim_speed`) — IMPLEMENTED

**Supersedes the v1 `attackCooldown` + `warmup` reload model** (both **removed**). Rate of fire is one
unified per-shot **aim interval**, computed by `aimIntervalTicks` ([rangedCombat.ts](../../../src/lib/game/systems/rangedCombat.ts))
and gated by the `turn % interval === 0` cadence the FSM already runs — no per-entity cooldown
bookkeeping, no new turn structure:

The interval splits into two phases, **each governed by its own stat** — total = AIM + SPAN:

```
interval = aimTime + spanTime
  aimTime  = baseInterval × (1 + dist × 0.08) ÷ ( aim_speed × (1 + drawSpeedBonus) )   // DEX; distance LINEAR: far = slower to line up
  spanTime = baseInterval × max(0, reload − 1) ÷ reload_speed                          // DEX; crossbow crank — distance-INDEPENDENT
```

- **`aim_speed` (stats.jsonc, DEX)** governs AIM — drawing/nocking/lining up/loosing. Every ranged
  weapon pays it; distance lengthens it. Folds in `manipulation`/sight (a wounded archer slows).
- **`reload_speed` (stats.jsonc, DEX)** governs SPAN — a crossbow's windlass crank. Only weapons with
  `reload > 1` have a span step (`reload − 1` extra base intervals), so this is the **crossbow stat**;
  bows/slings ignore it. `weaponProperties.reload` is the per-weapon size of that step (crossbow `3`),
  now *divided by the loader's `reload_speed`* rather than an `attackCooldown` add.
- **`drawSpeedBonus`** = a matching quiver's fast-draw (`quiver.drawSpeed`) **minus** the no-quiver
  pack-fumble penalty, plus general aim gear (`aimBonuses.speed`, e.g. archer's bracers) — summed by
  `drawSpeedModifier` + `sumAimBonuses`. Speeds the AIM phase only. **Arrows/bolts only**; slings/thrown
  ignore it (a pouch is equally quick). See the quiver model (§II / Part III).

**Two ranged axes (one attribute per formula, STR is melee-only):** **PER = precision** (`aim_accuracy`
+ `aim_range`), **DEX = speed** (`aim_speed` + `reload_speed`). So PER-only = a sniper (accurate, long,
average rate), DEX-only = a fast skirmisher/slinger, PER+DEX = the complete shooter; crossbows lean DEX
(fast cycle) and bows lean PER (precision). `attackCooldown` (the v1 plan — never wired) and `warmup`
(the optional RimWorld aim-delay) are **dropped**. (Finer identity — e.g. a sling specialist — is a
**trait** concern, not raw stats.)

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
| **Aim warmup before fire** — RimWorld warmup → fire → cooldown | **Dropped.** Superseded by the unified `aim_speed` cadence + linear distance (§IV) — no separate warmup scalar or `attackCooldown` channel. |
| **Ammo is hauled items + quiver assignment** — DF marksdwarf bolt logistics | **Adapted.** Ammo is bulk-consumable from inventory now (§II); the `quiver`/hauling supply-loop is the deferred DF-style layer (Open Questions) — fits the existing job/haul system. |
| **Directional / fractional cover** — RimWorld per-cell cover sampled near the target | **Simplified.** Binary 0.20 adjacency penalty (§I); RimWorld's directional model is the richer later version once positioning matters. |
| **Marksdwarf switches to melee in contact** — DF; RimWorld pawns melee when adjacent | **Borrowed.** The bow-butt fallback (§IV). |
| **Staggered threat AI; mutate live entities at 60 Hz, consumers read copies** — DF/RimWorld tick model | **Already in place** — ENGINE-PERFORMANCE's auto-defend throttle + the worker snapshot (§VI-1/2). Ranged AI re-uses it, doesn't add a 60 Hz scan. |

---

## Part V — Implementation Plan

### Phase A — Data & types (no behaviour change)

- [x] 1. `types/items.ts`: added `ammoCategory?`, `reload?`, `strScaled?`, `warmup?` to
  `weaponProperties`; added the `ammoProperties?` block to `Item`.
- [x] 2. `items.jsonc` + `recipes.jsonc`: added `throwing_stone`/`sling`/`throwing_spear`/`crossbow`
  + the ammo items + recipes; `self_bow`/`war_bow` got the new fields.
- [x] 3. Ammo items use `category: "ammunition"` + an `ammoProperties.ammoCategory` tag
  (`arrow`/`bolt`/`sling_stone`). Recipes use **fixed** inputs (dynamic wood/metal slots deferred).

### Phase B — Combat resolution (the meat)

- [x] 4. New `systems/rangedCombat.ts` (pure helpers) + `Combat.ts` `buildRangedOverride()`: a ranged
  `RangedOverride` (distance penalty, ammo bonuses, conditional STR scaling) fed into `resolveHit`.
  **Perf (§VI-1):** built once per shot (cadence-gated), no per-tick allocation; flanking already
  absent from the base formula.
- [x] 5. `tickCombat` pawn loop: target beyond `reach`, within `range` + sight + ammo → ranged shot;
  else the FSM (`handleFighting`) closes; cornered (≤1) → bow-butt. `findCombatThreat` extended so a
  ranged pawn acquires threats out to weapon range.
- [x] 6. Ammo decrement + bow-butt (`buildBowButtOverride`, blunt `damMax×0.4`). **Perf (§VI-1):** ammo
  spend coalesced into a Map applied once in the final merge (gated — no rebuild at peace).
- [~] 7. `reload` → cadence: implemented as an **interval multiplier** (`baseInterval × max(1, reload)`),
  not an `attackCooldown` bump — gives "crossbow fires a third as often" without per-tick cooldown
  state. `warmup` data field added but unwired (optional).

### Phase C — Line-of-sight & recovery

- [~] 8. **LoS reduced to `withinSight(dist, pawnVisionRange)`** (user decision) — a scalar
  `distance ≤ visionRange` check, no WASM raycast (ADR-008 untouched). Cover = a cheap read-only
  neighbour-tile scan (`rangedCoverPenalty`, 0.20 if the target hugs a non-walkable tile).
- [x] 9. Per-shot ammo recovery roll → `DroppedItem` on the target tile, **collected and appended once**
  per tick (§VI-3, bounded by shots/tick). Thrown-weapon self-consume deferred.

### Phase D — UI & feedback

- [x] 10. Ranged hits/misses log through the existing `logCombatSwing` (weapon name shows); a one-time
  "looses the last <ammo>" chronicle line fires when the stack empties.
- [~] 11. Ammo counts already render in `PawnInventory` (bulk items). The dedicated equipped-weapon
  low-ammo **badge** is deferred. **Perf (§VI-4):** ammo is a cold-resync field, so any badge reads
  ≤~2 s stale — fine for a warning; promote a scalar into `entityProjection.ts` only if a live readout
  is wanted.

---

## Part VI — Performance compliance (ENGINE-PERFORMANCE)

Ranged combat lands inside the **per-tick worker combat phase** and touches `droppedItems` +
the snapshot — exactly the surfaces ENGINE-PERFORMANCE spent its arc fixing. Honour these so the
feature doesn't re-introduce a known regression (each maps to a finding there):

- [x] **§VI-1 — no per-tick allocation in the combat tick (ADR-002 amendment / ★ DONE, M2/M4).** Met:
  the `RangedOverride` is built once per shot (cadence-gated), not per attacker per tick; ammo spend +
  recovery are coalesced into a Map/array applied once in the final merge — no `{...pawn}`/pawns-array
  rebuild at peace (gated on `pawnAmmoUpdates.size`).
- [~] **§VI-2 — LoS through the WASM spatial service, amortised — MOOTED by the reduced-LoS cut.** No
  WASM raycast and no per-tick ray walk exist: LoS is a single `distance ≤ visionRange` scalar compare
  (`withinSight`). When the real `blocksSight` raycast (ADR-019) lands, route it through the amortised
  spatial service then (cache per pair / stagger off `debugId`) — this checkbox re-opens with it.
- [x] **§VI-3 — `droppedItems` stays bounded.** Met: recovery rolls per shot but the drops are collected
  in one array and appended **once** at tick end (bounded by shots/tick), not spliced per-shot. Benefits
  automatically once `droppedItems` deltas (D8) land.
- [x] **§VI-4 — snapshot cost: didn't un-cold inventory for the HUD.** Ammo stays a bulk inventory field
  surfaced by the existing `PawnInventory`; no scalar was promoted into the sent projection (the live
  low-ammo badge was deferred rather than forced into the hot snapshot).
- [x] **§VI-5 — touched no worldMap tiles.** Drops go to `droppedItems`; the cover check is a read-only
  neighbour-tile scan. No `worldMap.map()` / tile writes anywhere in the ranged path.

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
