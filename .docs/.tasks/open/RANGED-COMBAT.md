<!-- LOC cap: 400 (created: 2026-06-12; reworked 2026-06-18 — prior-art pass over ../ZED + ../dnd-combat-loop, ENGINE-PERFORMANCE compliance) -->

# RANGED COMBAT & AMMUNITION

> **Related:** [ROADMAP](ROADMAP.md) · [COMBAT-SYSTEM](COMBAT-SYSTEM.md) · [ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md) (this consumes LoS — read §C/§D before touching the tick) · [EQUIPMENT-EXPANSION](../archive/EQUIPMENT-EXPANSION.md) · [ENTITIES_SPAWNING](ENTITIES_SPAWNING.md) · [MAGIC-SKILLS](MAGIC-SKILLS.md) · [game/DESIGN](../game/DESIGN.md) · [game/DECISIONS](../game/DECISIONS.md) (ADR-008 spatial, ADR-002 mutate-in-place)

## Status

Not started. **Hard-blocked by** COMBAT-SYSTEM (complete) and EQUIPMENT-EXPANSION (the bow
items + `range`/`reach`/`twoHanded` weapon fields). COMBAT-SYSTEM explicitly deferred
"ranged attacks" to a later spec — this is that spec. Magic-attuned ranged weapons
(`staff` bolts, enchanted ammunition) belong to [MAGIC-SKILLS](MAGIC-SKILLS.md) and are
excluded here.

**2026-06-18 rework:** investigated two sibling combat prototypes for portable parts
(`../ZED`, `../dnd-combat-loop`) and aligned the plan with [ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md).
See Part 0 (prior art) and Part VI (performance compliance) — both are new and **gate** the
design. Net effect on scope: LoS is folded into the planned **unified spatial service**, not a
standalone ray-cast; resolution stays **instantaneous** (no projectile entities); ammo recovery
is **deferred behind the `droppedItems` delta work** it would otherwise regress.

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

## Part 0 — Prior art: what ports from the sibling prototypes (and what doesn't)

Two sibling Godot/GDScript prototypes were mined for reusable design. **Neither ports as
code** — Fantasia is SvelteKit/TS with a tick-based sim in a Web Worker. They port as
**algorithms and design**, and the line between them is the **temporal model**:

- **`../dnd-combat-loop` is TURN-BASED.** Its *turn scaffolding* is the wrong model for us and
  is **rejected wholesale**: action economy (`ActionEconomy.gd`: action/bonus/reaction budgets),
  **opportunity attacks as reactions** (`OpportunityAttack.gd`), advantage/disadvantage as a
  discrete-roll mechanic, per-turn movement budgets, and flood-fill "reachable tiles". Fantasia
  has no turns — combat is a continuous FSM ticking down `attackCooldown` (COMBAT-SYSTEM). What
  **does** port is its **stateless, tick-agnostic grid math**, which doesn't care about turns:
  - **`LineOfSightManager.gd`** → cached **symmetric Bresenham** LoS (`{from:{to:bool}}`,
    A↔B symmetric, per-position invalidation on move). This is the LoS this spec needs (§I).
    Note its own header TODO ("replace grid check with physics ray when on TileSet") — we keep
    the **grid** form (cheap, deterministic, worker-safe); we do **not** want physics rays.
  - **`CoverManager.gd`** → cover from **intervening tiles along the shot line**, reusing the
    *same* Bresenham tile list as LoS (DRY), taking the max cover on the line, tiered
    (none / half / three-quarter). Richer than the current "0.20 if adjacent to a wall" and
    upgrades §I's cover rule (§I-cover).
  - **`CombatMath.gd`** → the hit-probability **clamp** (never 0%/100% — a min miss and min hit
    chance) and the `max(STR, DEX)`-style "use the better stat for ranged" idea, which cleans up
    the `strScaled` boolean (§I-hit). *Advantage/disadvantage itself is turn-based → dropped.*
  - **`TacticalPositioning.gd`** → `chebyshev` adjacency helpers — but we already have
    `nearestPawn`/adjacency in the sim, so this is a **naming/parity reference only**.

- **`../ZED` is REAL-TIME.** Its *cadence* is closer to ours (continuous, no turns), but its
  *mechanisms* are physics-engine-bound and **rejected**: `bullet.gd` is a traveling `Area2D`
  projectile in `_physics_process`; `player_sight.gd` does LoS via `PhysicsDirectSpaceState2D.
  intersect_ray()` and tracks sight with `Area2D` overlap signals every frame. We have no physics
  world and a tick/worker/SoA sim, so spawning projectile entities or per-frame ray queries is the
  wrong shape (and a snapshot/alloc cost — Part VI). What **does** port is conceptual:
  - **Instantaneous resolution.** ZED's bullet *travels*; we resolve the shot as a single hit
    roll on the firing tick (Part I). We borrow the *feel* (real-time, no turn gate), not the
    traveling object. **Explicitly: no `Bullet`/projectile entity.**
  - **Last-seen memory + debounce.** `player_sight.gd` keeps a unit's last-known position when
    LoS drops, and gates state flips behind a `min_state_change_interval` to stop oscillation.
    The debounce is the directly useful bit: it's the same hazard ENGINE-PERFORMANCE names as the
    **"hunt/flee yoyo"** (§M3). Applies to the kite/close decision (Part IV). Full last-seen
    *fog memory* is deferred with fog-of-war (out of scope here).

**One-line takeaway:** take the **turn-based** project's *stateless grid math*, take the
**real-time** project's *cadence + debounce*, and reject both engines' scaffolding (turn economy;
physics projectiles/rays).

---

## Part I — Combat Resolution

Ranged resolution slots into the **existing** auto-combat FSM (COMBAT-SYSTEM turn loop). It is
**not** a new mode and **not** turn-based. When a pawn/mob in Combat mode holds a weapon with
`range > 0` and has compatible ammunition, its attack each tick resolves as ranged:

```
target in melee reach (≤ reach tiles)?   → attacker may still melee (butt of bow), see §IV
target beyond reach but ≤ range tiles?    → ranged attack IF line-of-sight AND ammo > 0
target beyond range, or no LoS, or no ammo → close distance (move toward target) this tick
```

Resolution is **instantaneous** on the firing tick — a hit roll + damage, no projectile entity
travels (the ZED-rejection, Part 0 / Part VI). The shot rides the FSM's existing `attackCooldown`.

### Hit chance (§I-hit)

Reuse the COMBAT-SYSTEM hit formula, with ranged-specific modifiers folded in:

```
rangedHit = baseHit(attacker)                        // hit_chance stat (× sight × manipulation)
          + weaponProperties.accuracy
          − distancePenalty(dist, range)             // see below
          − coverPenalty(target)                     // from §I-cover (was: flat 0.20 adjacency)
          + flankingBonus                            // existing 0.15 — does not apply to ranged; set 0
rangedHit = clamp(rangedHit, MIN_HIT, MAX_HIT)       // CombatMath idea: never a guaranteed hit/miss
```

`distancePenalty = clamp((dist − optimalRange) × 0.04, 0, 0.4)` where
`optimalRange = ceil(range × 0.5)`. Firing at the edge of your range is hard; mid-range
is the sweet spot; point-blank is fine. This makes `range` a real stat, not just reach.

STR scaling applies to **bows** (draw weight) but **not** crossbows/slings (mechanical
advantage). Modeled with a `strScaled?: boolean` weapon flag (default true; crossbows/slings
false). *(dnd's `max(STR,DEX)` is the cleaner abstraction but Fantasia's stat model differs —
keep the boolean; noted as the idiomatic alternative if a DEX-equivalent stat is ever added.)*

### Line-of-sight (§I-los)

A straight Bresenham line from attacker to target; if any intervening tile is a **sight-blocker**
(wall, full-canopy tree, cliff) the shot is blocked → attacker closes instead. **This must go
through the spatial service interface (ADR-008), never an inline ray-cast in `Combat.ts`.**

- **Add `hasLineOfSight(ax, ay, bx, by): boolean` to the spatial service** alongside
  `PathfinderService.findPath` (`src/lib/game/services/PathfinderService.ts`; concrete impl
  `WasmPathfinderService`). Callsites depend on the interface only.
- **Algorithm = `dnd-combat-loop`'s cached symmetric Bresenham** (Part 0): a line walk over an
  **opacity grid**, with a `{from:{to}}` cache, symmetric (A↔B), invalidated per-position on
  movement and on the terrain-rev bump. The opacity grid is a sibling of the existing
  `buildPathfindingGrids` flat-grid (reuse the same worldMap-ref memoization — Part VI).
- **Fold into the unified spatial service, do not build standalone.** ENGINE-PERFORMANCE §C is
  explicit: *"the upcoming fog-of-war (visibility) + ranged-combat LoS are spatial (ADR-008) and
  will build that index anyway — fold nearest/vision/LoS/fog into ONE amortised spatial service
  then."* LoS shares the opacity grid (and ultimately the spatial index) with `nearestPawn` and
  future fog. Building a one-off LoS ray now re-litigates the reverted uniform-grid (Part VI).

### Damage & wounds

Damage uses `damMin..damMax` (EQUIPMENT-EXPANSION) rolled as normal, `damageType`
usually `piercing` → routes through the existing wound table (arrow = piercing, organ-
penetration chance). Armour layer cascade applies unchanged.

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

> ⚠️ **Recovery is gated by performance — see Part VI.** Per-arrow `DroppedItem` spawning
> directly worsens the `droppedItems` snapshot cost ENGINE-PERFORMANCE §D8 flags as the *next
> biggest growing payload*. Recovery ships **only after** `droppedItems` deltas land, and even
> then **batches** spent ammo into one stacked drop per tile (not one entity per arrow).

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

## Part IV — Reload, Cadence & the kite/close decision

`weaponProperties.reload` (new, optional; default 0) = attack ticks the weapon needs
between shots. Modeled with the **existing** `attackCooldown` field on Pawn/Mob
(COMBAT-SYSTEM) — a ranged weapon adds `reload` to the post-shot cooldown:

```
afterShot: attacker.attackCooldown += reload   // on top of the normal swing cooldown
```

So a crossbow (`reload 3`) genuinely fires a third as often as a sling. No new turn
structure — it rides the cooldown the FSM already ticks down.

### Melee fallback (bow-butt)

A pawn cornered (enemy in melee reach) with a ranged weapon still defends: it makes a weak
`blunt` melee strike (`damMax × 0.4`, the bow stave / sling pommel) rather than firing into
contact. This reuses the unarmed-fallback path in `attackerProfile()` — gate it on
"enemy within reach and weapon is ranged."

### Kite/close debounce (the ZED lesson)

The per-tick "ranged-fire vs close-distance vs bow-butt" decision (Part I) can **oscillate** at
the reach/range boundary — a target stepping in and out of melee reach flips the pawn between
firing and closing every tick. This is the **same hunt/flee yoyo** ENGINE-PERFORMANCE §M3 warns
about, and the fix is ZED's `min_state_change_interval` debounce (Part 0): commit to
"close" / "hold and fire" for a few ticks before re-deciding, with hysteresis at the boundary
(close until comfortably inside `optimalRange`, not just inside `range`). Reuses the existing
auto-defend throttle cadence (staggered by `debugId`) rather than re-scanning every tick.

---

## Part V — Implementation Plan

### Phase A — Data & types (no behaviour change)

1. `types.ts`: add `ammoCategory?`, `reload?`, `strScaled?` to `weaponProperties`; add
   `ammoProperties?` block to `Item`.
2. `items.jsonc` + `recipes.jsonc`: add the weapons and ammo above. (`self_bow`/`war_bow`
   already exist from EQUIPMENT-EXPANSION — just add the new fields to them.)
3. New `arrow`/`bolt`/`sling_stone` item categories; ammo recipes (dynamic where they use
   `wood`/`metal` category slots).

### Phase B — Line-of-sight in the spatial service (do FIRST — it gates resolution)

4. Add `hasLineOfSight(ax, ay, bx, by)` to `PathfinderService` (interface) + `WasmPathfinderService`
   (impl), backed by an **opacity grid** memoized on the worldMap ref like `buildPathfindingGrids`.
   Cached symmetric Bresenham (Part 0 / §I-los). Cover penalty (§I-cover) reuses the *same* line tiles.
5. Unit-test LoS in isolation (blocked-by-wall, clear, symmetry, cache invalidation) before wiring
   combat — mirrors `dnd-combat-loop`'s LoS being its own tested manager.

### Phase C — Combat resolution (the meat)

6. `Combat.ts` `attackerProfile()` (line ~225): branch on `range > 0` + ammo availability → build a
   ranged profile (distance penalty, cover, clamp, no flanking, conditional STR scaling).
7. FSM tick (COMBAT-SYSTEM turn loop): if target beyond `reach` but within `range` and LoS
   and ammo > 0 → ranged attack; else if beyond range/no LoS → move-to-close; else melee.
   **Apply the kite/close debounce (§IV).**
8. Ammo decrement + the bow-butt melee fallback. `reload` → `attackCooldown` addition.
   **Mutate in place — no per-tick allocation in the resolution path (Part VI).**

### Phase D — Recovery, UI & feedback

9. Combat log lines for ranged hits/misses/out-of-ammo ("Bjorn looses his last arrow").
10. Equipment/inventory panel: show equipped ranged weapon's ammo count and a low-ammo warning.
11. **Ammo recovery — gated behind `droppedItems` deltas (Part VI / ENGINE-PERF §D8).** Post-combat,
    batch spent recoverable ammo into one stacked `DroppedItem` per tile; thrown-weapon self-consume
    drops the weapon `ItemInstance`. **Do not ship per-arrow drops on the whole-array snapshot.**

---

## Part VI — Performance & ENGINE-PERFORMANCE compliance

This feature touches the sim hot path and the worker→main snapshot — the two surfaces
[ENGINE-PERFORMANCE](ENGINE-PERFORMANCE.md) spent the whole perf arc on. Compliance is a design
constraint, not an afterthought:

- [ ] **Resolution mutates in place (ADR-002 amendment).** The ranged attack path runs inside the
  per-tick combat phase. Follow the established hot-loop rule: mutate entity fields in place
  (ammo count, `attackCooldown`, wounds), **no `{...spread}`/`.map()` per tick**. The immutable
  style was the 12.5× tick tax (ENGINE-PERF ★).
- [ ] **No projectile entities (the ZED rejection).** Resolution is a single hit roll on the firing
  tick. A traveling `Bullet` would add per-tick entities to step *and* to the snapshot — exactly the
  growth ENGINE-PERF fights. Instantaneous only.
- [ ] **LoS is amortised + cached, never a per-tick rebuild.** The TS uniform-grid spatial index was
  **built and reverted** (§B "rejected") — per-tick rebuild/alloc lost to the JIT'd linear scan at
  this entity count. So: (a) reuse the worldMap-ref-memoized opacity grid (rebuild only when terrain
  changes, like `buildPathfindingGrids`); (b) cache LoS results symmetric + invalidate on move/terrain-rev
  (dnd pattern); (c) gate LoS to **ranged combatants with a target beyond reach but within range**, and
  throttle the re-check on the staggered auto-defend cadence — not every pawn every tick.
- [ ] **Fold into the ONE spatial service (ADR-008), don't add a second.** ENGINE-PERF §C commits
  nearest/vision/LoS/fog to a single amortised spatial service. Add `hasLineOfSight` there; share the
  grid. A standalone LoS ray re-opens the reverted-grid debate for ~3pp.
- [ ] **Ammo recovery must not regress `droppedItems`.** §D8 names `droppedItems` as the next biggest
  *growing* snapshot payload (ships whole every flush, grows unbounded with harvest). Per-arrow drops
  would compound it. Recovery is **deferred until `droppedItems` deltas land**, then **batched** (one
  stacked drop per tile). Verify with the `[SNAP]` probe that recovery doesn't spike the payload.
- [ ] **No new always-on hot allocators or `find` scans.** Ammo/weapon lookups go through the existing
  id→`Map` indexes (§B), not `.find()` over arrays. New snapshot fields (if any) ride the slim
  projection (§D8 `entityProjection.ts`) — don't add cold fields to the per-flush hot set.

---

## Open Questions

- [ ] Dedicated `quiver` (belt-slot ammo container, +ammo volume) — deferred; ammo rides
  normal inventory for now.
- [ ] Friendly-fire on the LoS line (ally between shooter and target) — deferred; assume
  shooters pick clear lines. *(Cheap to add later: the §I-los Bresenham tile walk already
  enumerates the line — test it for an intervening ally, same as cover.)*
- [ ] Mob ranged attackers (archer goblins) — data-only once Phase C lands; creatures get a
  ranged `naturalWeapon`/equipped bow + an ammo pool. Tracked, not in initial scope.
- [ ] Moving-shot accuracy penalty (fire-on-the-move vs. braced) — deferred; needs the
  positioning layer to distinguish, which we don't model yet.
- [ ] Last-seen fog memory for ranged AI (the ZED `player_sight` memory system) — deferred with
  fog-of-war; only the **debounce** half of that system is in scope now (§IV).
- [ ] Enchanted/elemental ammo and `staff` bolts → [MAGIC-SKILLS](MAGIC-SKILLS.md).
