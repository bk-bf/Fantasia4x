<!-- LOC cap: 220 (created: 2026-08-27) -->

# TOP RUNG ITEMS — what the Steel Deck Oven and the Runed Brewing Vat make

> **Related:** [DB-PASS-QUEUE](DB-PASS-QUEUE.md) (this is T5) · [game/ITEM-RULES](../../game/ITEM-RULES.md) ·
> [MECHANICAL-POWER](MECHANICAL-POWER.md)

## Status

**Proposal, awaiting review. No data changed.** Nothing below is authored. Three dishes and two
drinks are costed; the gate each was checked against is named beside it. Three defects found on the
way are listed first, because two of them change what a top-rung drink is allowed to claim.

---

## Three defects found while reading the stations

**1. The vat's own description promises something the sim does not do.** `runic_brewhouse` says its
vessels "hold a heat that never quite reaches the wood around them". It carries
`effects.fermentation: 1`, and `GameEngineImpl.ts:1094` reads that flag on *every* station and scales
the order's work rate by the tile's ambient temperature through `fermentTempRate`
(`EnvironmentService.ts:883`) — nothing below 4C or above 40C progresses at all. The runed vat is
weather-gated exactly like the wooden tun. **No drink may be justified by the vat holding its own
heat until that is either implemented or the description is corrected.**

**2. `effects.arcane` does nothing for anything the vat can make.** It is read once, at
`services/jobs/craft.ts:161`, to double the famed-item roll. The roll only fires inside the `stamp`
branch of `completeCraftOrder`, gated on `QUALITY_STAMPED_TYPES = {weapon, armor, tool}`
(`craft.ts:194`, `craft.ts:306`). A fluid or a food never reaches it. The vat's `arcane: 1` is inert.

**3. The baking family above rung 0 does not declare `bakingEnabled`.** `oven` has it; the three
ovens above it (`brick_bake_oven`, `bakehouse`, `steel_bake_range`) do not, while the three mills do.
`resolveDiscipline` (`core/defs/disciplines.ts`) matches the `baking` discipline on that flag alone,
so a loaf baked at the Iron-Door Oven files under `meals` and the same loaf at the Clay-Brick Oven
files under `baking`. Every recipe below therefore states `discipline` explicitly, which
`craftDiscipline` honours ahead of the station scan. The flag itself wants fixing separately.

### What is left to justify a top-rung item

For the oven: **duration and steadiness.** Its own description is the claim — fire-brick chambers
behind steel doors, a damper on each flue, every shelf at its own heat and none of them wandering.
The rung below it bakes on *falling stored heat* (`brick_bake_oven`) or sells *throughput*
(`bakehouse`). Long, low, unwavering bakes are the axis nothing below it has.

For the vat: **it is a runed vessel.** `heldBy` is live — `vesselAccepts` (`core/rules/gear/vessels.ts:70`)
refuses any vessel whose `container.material` is not on the fluid's list. A ferment that no wooden
tun or clay crock survives can only be made and moved at the runed age. That is the one lever the
data actually supports.

**Its 250 L body is not a lever.** The family runs 100 / 150 / 200 / 250 L, and no brewing recipe in
the game pours more than 4 L. A batch large enough to be exclusive to the vat would be fifty times
its neighbours.

---

## Steel Deck Oven — three dishes

All three: `station: "steel_bake_range"`, `discipline: "baking"`, `toolTierRequired: 2` (matching the
preserve line's `make_potted_meat`), item `tier: 3`, sprite reused from the existing baked goods
(`{"sheet": "items", "id": 113}`).

### 1. `hard_biscuit` — "Hard Biscuit"

Flour and water held at a low heat for hours until every trace of moisture is gone. A stored-heat
oven cools through its own bake and cannot do it; this one can.

| | |
|---|---|
| recipe | `bake_hard_biscuit` · inputs `{"flour": 6, "water": 1}` · outputs `{"hard_biscuit": 3}` |
| work | `workAmount: 40`, `researchRequired: "food_preservation"` |
| item | `type: "food"`, `category: "preserve"`, `nutrition: 26`, `weightKg: 0.13`, `volumeL: 0.1` |
| keeping | `decaySeconds: 240000`, `maxDurability: 220`, `deteriorationRate: 0.002`, `value: 4` |
| buff | none |

**Calibrated against `bake_bread`**, which is 6 flour to one 0.4 kg loaf of 78 nutrition. Three
biscuits are the same 78 nutrition off the same 6 flour and the same ~0.39 kg — the gain is bulk and
weather. Bread is 130 nutrition per litre and wears at 0.09 lying out; the biscuit is 260 per litre
and wears at 0.002. Volume is what a carry aid grants (R14), so this is the ration that travels.

> Flour and water baked twice over a low heat until nothing is left in it to turn. It keeps through a
> winter, and it wants soaking before anyone can chew it.

### 2. `fruit_cake` — "Fruit Cake"

Sugar and fat carry the heat inward slowly; the crust burns long before the middle sets in an oven
whose temperature falls through the bake. Gives `sugar` a second reader — today only `ferment_mash`
takes it.

| | |
|---|---|
| recipe | `bake_fruit_cake` · inputs `{"flour": 4, "dried_fruit": 6, "sugar": 2, "tallow": 1}` · outputs `{"fruit_cake": 2}` |
| work | `workAmount: 48`, `researchRequired: "food_preservation"` |
| item | `type: "food"`, `category: "preserve"`, `nutrition: 150`, `weightKg: 0.8`, `volumeL: 0.55` |
| keeping | `decaySeconds: 180000`, `maxDurability: 200`, `deteriorationRate: 0.004`, `poisonChance: 0.01`, `value: 30` |
| buff | `mealBuff: {"condition": "fortified", "seconds": 130}` |

Nutrition in is 316 (flour ~52 at bread's rate, dried fruit 264); out is 300, so the bake concentrates
nothing. Mass in 1.9 kg, out 1.6 kg. `fortified` at 130 s steps above `hearty_pie`'s 100 s.
`confit_meat` is the precedent for a `preserve` that carries a meal buff.

> Dried fruit and sugar worked into a heavy batter and baked slow enough that the middle sets before
> the crust darkens. A cake cut thin outlasts the journey it was packed for.

### 3. `cheese_tart` — "Cheese Tart"

The weakest of the three and the first to cut. A set dairy filling splits above its curdling point,
so it wants one shelf held low for a long time — which is the oven's stated claim and nothing more.
It does pull the tamed-livestock line (`milk` comes off `produces` on four creatures) into baking,
where today only the cheese basin touches it.

| | |
|---|---|
| recipe | `bake_cheese_tart` · inputs `{"flour": 3, "hard_cheese": 1, "milk": 2}` · outputs `{"cheese_tart": 2}` |
| work | `workAmount: 30`, no research |
| item | `type: "food"`, `category: "meal"`, `nutrition: 95`, `weightKg: 0.6`, `volumeL: 0.5` |
| keeping | `decaySeconds: 2400`, `maxDurability: 50`, `deteriorationRate: 0.06`, `poisonChance: 0.03`, `value: 19` |
| buff | `mealBuff: {"condition": "nourished", "seconds": 110}` |

> Milk and crumbled cheese set in a shallow crust and baked pale, until it firms without cracking.

---

## Runed Brewing Vat — two drinks

Both: `station: "runic_brewhouse"`, `discipline: "brewing"`, `passive: true`, `toolTierRequired: 3`,
`researchRequired: "runic_inscription"`, item `tier: 4`, `type: "fluid"`, `category: "drink"`,
`weightKg: 1.0` (kilograms per litre) and `volumeL: 1.0` (one serving), sprite
`{"sheet": "items", "id": 71}` as every other drink uses.

There are two and not three because the levers ran out — see the rejected list below.

### 1. `emberbloom_ale` — "Emberbloom Ale"

Emberbloom "carries the memory of a heat that does not burn". A cask of it stays hot; staves char and
fired clay crazes.

| | |
|---|---|
| recipe | `brew_emberbloom_ale` · inputs `{"malt": 4, "emberbloom": 3, "water": 6}` · outputs `{"emberbloom_ale": 6}` |
| work | `workAmount: 84` |
| item | `hydration: 40`, `nutrition: 18`, `intoxication: 10`, `value: 40` |
| holding | `heldBy: ["fireclay", "runed"]`, `maxDurability: 500`, `deteriorationRate: 0.002` |
| buff | `mealBuff: {"condition": "stock_warmed", "seconds": 150}` |

The restriction has a real cost: the only vessels left are the Fireclay Crucible (2 L) and the
Rune-Sealed Flask (3 L), so a colony that wants to move this must first make runed flasks. A 6 L
batch sits in the vat's own 250 L body until it does.

`stock_warmed` (constitution 1.12) is the cold-resistance line and today has exactly one member. If
DB-PASS-QUEUE T1 gives the heat line its own condition, this moves onto it.

> Malt ale worked through a flower that never lets go of its heat. It goes down warm, and the cold
> keeps its distance a long while after.

### 2. `frostheart_ale` — "Frostheart Ale"

Frostheart timber's "resin gone to a blue rime that never quite thaws" ferments the wort cold and
splits an ordinary stave cask doing it.

| | |
|---|---|
| recipe | `brew_frostheart_ale` · inputs `{"malt": 4, "frostheart_timber": 1, "water": 6}` · outputs `{"frostheart_ale": 6}` |
| work | `workAmount: 78` |
| item | `hydration: 55`, `nutrition: 10`, `intoxication: 7`, `value: 36` |
| holding | `heldBy: ["clay", "glass", "porcelain", "fireclay", "runed"]`, `maxDurability: 600`, `deteriorationRate: 0.0015` |
| buff | `mealBuff: {"condition": "refreshed", "seconds": 120}` |

Two things this fixes on its own. **`frostheart_timber` currently has no consumer at all** — an item
def and a cave node, and nothing in `recipes.jsonc` or `buildings.jsonc` names it. And **`refreshed`
is the only food condition in `conditions.jsonc` that nothing grants**; it is the perception and
dexterity line, so this is a scout's drink rather than a larger number on an existing one.

> Ale rested on rimed pine that never thaws, so it works cold and comes out clear. Sharp on the
> tongue, and it wakes the eye more than it clouds it.

---

## Gates walked, and what each one caught

| gate | result |
|---|---|
| **Gate 1, fill a real gap** | the two stations introduce no recipe at all — `grep` of `recipes.jsonc` returns no `station` of `steel_bake_range` or `runic_brewhouse`. Each item also names a second gap it closes: bulk-per-nutrition, a second reader for `sugar`, a first reader for `frostheart_timber`, the unsourced `refreshed`. |
| **Gate 2, tier reachable by the whole chain** | `AGE_CEILING` in `dev/chainAge.ts` maps item tier to the latest age its chain may touch: tier 3 to steel, tier 4 to runed. The oven is `steel:1` so its dishes are tier 3; the vat is `runed:2` so its drinks are tier 4. Every ingredient is at or below that: flour, water, milk and hard cheese are bronze or earlier, `dried_fruit` and `sugar` earlier still, `emberbloom` is a foraged node with no tool requirement, and `frostheart_timber` needs woodcutting tier 3, which `NODE_TOOL_AGE` prices at steel. |
| **Gate 3, does the name tell the truth** | every material word in a name is in the recipe: cheese from `hard_cheese`, fruit from `dried_fruit`, emberbloom and frostheart by name. No archetype claimed; each is `<material> <type>`, the shape the existing drinks already use (Grape Wine, Hopped Ale, Barley Beer). No process name. |
| **Gate 3, no antique word** | none of the five names or descriptions hits `PLAINER` in R13. |
| **name collisions** | `no two items share a name` in `dbStructure.test.ts` is exact-match on `name`. All five names and all five ids are free. |
| **the `_tack` trap** | the first draft was `hard_tack`. `itemMatchesCostCategory` (`core/defs/items.ts:24`) matches `category:fastener` on `/_nail$\|_rivet$\|_tack$/` for anything that is not a weapon or tool, so a **food** ending in `_tack` would have been eaten as nails by every recipe and building cost with a fastener slot. Renamed to `hard_biscuit`, which also stops it reading as a sibling of Copper Tack. |
| **Gate 3c, fluids** | R22's bands hold: density 1.0 kg/L is inside 0.5–20, a 1.0 L serving is inside the 2 L ceiling, and a 6 L batch fits the vat's 250 L body. R10 holds: `runic_brewhouse` declares `fluidCapacityL`, so neither batch spills. R15 holds: both `heldBy` lists name only real vessel materials, `"runed"` is on both as the rule requires, and each fluid still has at least one vessel that will carry it. |
| **no invented process step** | nothing here adds a station or a stage. Every dish and drink is one recipe at a station that already exists, taking materials that already exist. |
| **Gate 5, gettable (R8)** | all five have recipes, so R8 passes without touching `R8_DEBT`. |
| **only fields the sim reads** | `nutrition` (`services/foodRules.ts:17`), `hydration` (`vessels.ts:227`), `intoxication` and `mealBuff` (`pawnQueries.ts:165, 234`), `poisonChance` (`pawnQueries.ts:202`, defaulting per category to meat 0.16 / food 0.05 / drink 0.01), `decaySeconds` as seconds per unit lost (`ItemService.ts:717`), `deteriorationRate` and `maxDurability` for stock lying unstored and unroofed (`ItemService.ts:849`), `heldBy` (`vessels.ts:70`), `value` (`itemValue.ts:26`), `weightKg` and `volumeL` per the fluid convention. Nothing else is set. |

## Considered and rejected

| candidate | gate that killed it |
|---|---|
| a bulk brew sized to the vat's 250 L body | the family's bodies are 100/150/200/250 L and no brewing recipe pours over 4 L. A batch exclusive to the vat would be off the ladder by two orders of magnitude. |
| a drink justified by the vat holding its own heat | defect 1. The sim weather-gates it like every other fermenter. |
| a drink justified by the vat's arcane infusion | defect 2. `arcane` cannot reach a fluid. |
| a glowcap night-sight brew | duplicates `nightglow_draught`, which the Runed Still already makes. |
| a fermented milk drink | no plain accurate English name for it — every real one is a one-off foreign word, which R13's rule exists to refuse. |
| kiln-dried malt at the oven | re-tiers an existing item rather than adding one, and is T1/T2's ground. |
| an upper-rung composed pie | that is DB-PASS-QUEUE T2, and a pie is not something only a sealed steel oven can bake. |

## Also worth a look, not proposed here

`bread` and all three pies carry no `decaySeconds`, so stored baked goods never spoil, while every
stew, roast and preserve does. That is why the biscuit above is argued on bulk and weather rather
than on keeping, and it looks like an authoring gap rather than a decision.
