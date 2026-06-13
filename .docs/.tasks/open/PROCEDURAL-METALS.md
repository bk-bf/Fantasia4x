<!-- LOC cap: 320 (created: 2026-06-11) -->

# PROCEDURAL METALS — Signature Alloys (Endgame)

> **Related:** [ROADMAP](ROADMAP.md) · [PRODUCTION-CHAIN-EXPANSION](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) (prerequisite, archived) · [MAGIC-SKILLS](MAGIC-SKILLS.md) · [EQUIPMENT-EXPANSION](../archive/EQUIPMENT-EXPANSION.md) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) · [game/DESIGN](../../game/DESIGN.md)

## Status

Not started. **Deferred endgame layer** — depends on the deterministic material
ladder reaching its **steel / steampunk ceiling** in
[PRODUCTION-CHAIN-EXPANSION](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md), and pairs with the
high-magic/enchantment content in [MAGIC-SKILLS](MAGIC-SKILLS.md). Do not start
before those land. This spec captures the design so it isn't lost.

---

## Goal

The base ladder is deterministic: a known ore smelts into a known bar. The
**endgame inverts this**. The player hunts very rare **procedural fantasy ores**
(rolled names + properties), then smelts *several of them together* in a special
high-level workstation to **roll a one-of-a-kind metal bar** — random name,
derived property profile, **recipe locked by the world seed**.

Because the ores are rare and the casts are resource-costly, this is a
trial-and-error prestige pursuit. A playthrough becomes **memorable for the
signature metal it produced** — maybe an alloy that's perfect for hospital beds,
or for ranged-weapon parts, or for light armor — discovered, named, and then
mass-produced once the player commits to it.

This is *width through depth*: no new age, but a deep, replayable terminal goal
sitting above steel.

---

## Where it sits

```
… → Iron → Steel  [deterministic ceiling, PRODUCTION-CHAIN-EXPANSION]
                       │
              Arcane Crucible (this spec)
                       │
   rare procedural ores ──smelt-together──► rolled signature bar
                       │
        Equipment / Furniture / Decor (with the bar's property profile)
                       │
              + Enchantment layer (MAGIC-SKILLS)
```

---

## §1. Procedural Ores

Generated at **world-gen** from the persisted `GameState.seed` (a fixed count per
world, e.g. 4–7 distinct ores), so each playthrough's ore palette is unique but
reproducible on reload.

| Field        | Meaning                                                                |
| ------------ | ---------------------------------------------------------------------- |
| `id`         | `proc_ore_<n>` — stable within the world                               |
| `name`       | rolled from curated fantasy roots/affixes (e.g. *Adamantite*, *Vry'thal Ore*) |
| `rarity`     | `epic` / `legendary` (add a `mythic` tier above legendary)             |
| `properties` | **1–3** rolled affinities (see §4), each with a magnitude              |
| `spawn`      | very rare; deep subterrain / mountain cores / magic-touched biomes     |

Mining them needs top-tier tools (steel/`steel_pick`+) and is slow. Each node
yields little. **Scarcity is the core balancing lever.**

**Naming.** A deterministic generator: pools of roots + affixes, picked via a
`SeededRng` derived from the world seed + ore index. Same world → same names.

---

## §2. The Arcane Crucible (workstation)

A late, expensive building gated behind steel + a research/magic node. The only
place procedural ores can be combined.

- Inputs: **2–4 different procedural ores** (plus base flux/fuel and possibly a
  magic reagent from MAGIC-SKILLS).
- High `workAmount`, heavy fuel/flux consumption — a single cast is a project.
- Output: **one procedural bar** (§3), quantity small per cast.

---

## §3. Casting & Seed-Locked Recipes

The key rule: **a given combination always yields the same bar in a given world**
— so discovery is reproducible and a found recipe can be productionised.

```
recipeKey  = sort(oreIds).join("+") + ratios
metalSeed  = hash32(GameState.seed, recipeKey)     // pure function
bar        = rollMetal(new SeededRng(metalSeed))    // name + property profile
```

- `rollMetal` derives the bar's **name** and **property profile** purely from
  `metalSeed`. Deterministic ⇒ no save-scumming a better roll from the same
  inputs; to get a different bar you must try a different ore combination.
- First successful cast of a key **registers** the bar: it gets a known `id`,
  appears in the catalogue, and becomes a repeatable recipe as long as the player
  keeps supplying the input ores.
- Trial-and-error = exploring the combination space, not re-rolling one combo.

Implementation note: reuse `core/rng.ts` (`mulberry32`/`SeededRng`). `hash32`
folds the ore-id string + world seed into a 32-bit seed (string hash ⊕ seed).
Must **not** draw from the live sim `rng` singleton (would desync replays) — use
a freshly constructed `SeededRng(metalSeed)`.

---

## §4. Property Profiles & Use-Case Fit

A metal's value is **distributed across axes**, so a roll is rarely good at
everything — it's *excellent* at one or two things. That's what makes a signature
metal worth building a production around for a *specific* purpose.

| Axis            | Drives quality of…                            |
| --------------- | --------------------------------------------- |
| `edge`          | blades, ranged-weapon tips → weapon damage    |
| `density`       | low → light armor; high → blunt/impact        |
| `resilience`    | durability / armor rating                     |
| `insulation`    | beds, comfort furniture → rest/heal quality   |
| `conductivity`  | arcane gear, staff cores (MAGIC synergy)      |
| `lustre`        | decor / prestige / trade value                |

The contributing ores' own `properties` (§1) bias which axes roll high, so the
player can *steer* outcomes loosely by choosing inputs — but never fully predict
them. Profiles feed `ModifierSystem` as sources when the bar is used in an item,
so a "Stormforged Aurium" hospital bed shows its provenance in the breakdown.

---

## §5. Productionising a Find

Once a player likes a registered bar:

- It behaves like any other material id in equipment/furniture/decor recipes.
- Sustained output depends on a sustained supply of its rare input ores → an
  endgame logistics goal (deep-mining operations, trade, magic prospecting).
- A colony's identity crystallises around 1–2 such alloys.

---

## Data Model Sketch

```typescript
interface ProceduralOre {
  id: string;            // proc_ore_<n>, world-stable
  name: string;          // rolled
  rarity: 'epic' | 'legendary' | 'mythic';
  properties: { axis: MetalAxis; magnitude: number }[]; // 1–3
}

interface SignatureMetal {
  id: string;            // assigned on first cast (registration)
  name: string;          // rolled from metalSeed
  recipeKey: string;     // sorted ore ids + ratios
  profile: Record<MetalAxis, number>;
}
```

Persisted in `GameState` (per-world ore palette + discovered metals) so reload is
identical and discoveries are not lost.

---

## Implementation Plan

### Phase A — Generation

- World-gen: roll the per-world procedural-ore palette from `GameState.seed`;
  persist it. Add a `mythic` rarity tier to `rarities.jsonc`.
- Name generator (roots/affixes pools + derived `SeededRng`).

### Phase B — Workstation & casting

- Arcane Crucible building (steel + research/magic gate; heavy fuel/flux).
- `hash32` + `rollMetal` (deterministic, off the sim `rng`); registration of
  first-cast bars into `GameState`.

### Phase C — Integration

- Property profiles flow through `ModifierSystem` (`sources[]`) when a signature
  bar is used in equipment/furniture/decor.
- UI: catalogue of discovered ores + metals; crucible combination screen showing
  knowns vs. untried.

---

## Open Questions

- [ ] Should inputs steer the roll *strongly* (predictable) or *loosely*
      (gambly)? (lean: loose bias — discovery should surprise.)
- [ ] Ratios in the recipe key — do they matter, or only the ore set? (lean:
      ore-set only at first; ratios are a later depth lever.)
- [ ] Trade/event acquisition of procedural ores, or mining-only? (lean:
      mining-only initially; trade ties into SOCIAL/economy later.)
- [ ] Cap on simultaneous registered signature metals per world, or unlimited?
- [ ] Magic reagent as a *required* crucible input vs. optional quality booster?
      (coordinate with MAGIC-SKILLS.)
