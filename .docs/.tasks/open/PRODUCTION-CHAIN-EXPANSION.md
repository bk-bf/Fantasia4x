<!-- LOC cap: 700 (created: 2026-06-03; scope broadened 2026-06-11, 2026-06-12) -->

# PRODUCTION & EARLY-SURVIVAL EXPANSION — Phase 2

> **Related:** [ROADMAP](ROADMAP.md) · [EQUIPMENT-EXPANSION](EQUIPMENT-EXPANSION.md) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) · [SEASONS_WEATHER (Living World)](SEASONS_WEATHER.md) · [PROCEDURAL-METALS](PROCEDURAL-METALS.md) (follow-up) · [game/DESIGN](../../game/DESIGN.md) · archived: [PRODUCTION-CHAINS-2026-05-28](../archive/PRODUCTION-CHAINS-2026-05-28.md) · [SURVIVAL-HEALTH-2026-05-30](../archive/SURVIVAL-HEALTH-2026-05-30.md)

## Status

**In progress** (implementing chapter-by-chapter; each gated on `pnpm check` + test suite green).

| Chapter | State | Notes |
| ------- | ----- | ----- |
| Foundation (types) | ✅ | needs `thirst`/`hygiene`, `drink`/`wash` designations, item `deterioration`/`durabilityLossPerAction`/`fuelHeat`, building `minFuelHeat`/`fluxPerBatch`/`moldRequired`/`storageDecayMultiplier`/`requiresEnclosure` |
| §A Forageables & loose stone | ✅ | 5 named rocks (granite/limestone/sandstone/marble/slate) replace `surface_stone`; terrain-distributed yields; stone `hearth` added. "Any-rock" station cost approximated by granite (Building cost takes fixed ids) |
| §B Durability & Deterioration | 🔄 | (1) loose-item deterioration live + tested (`stepItemDeterioration`). (2) **building** condition decay + repair live + tested (`stepBuildingCondition`/`repairBuilding`; `branch_wall` decays). (3) tool work-wear blocked on per-tile item-stacks (storage refactor below) — once stacks are authoritative, per-stack tool durability lands |
| **Storage refactor** (per-tile stacks) | 🔄 | Plan: `~/.claude/plans/streamed-napping-wave.md`. **Stages 1–3 ✅** done + green (73 tests): per-tile `stored` DroppedItems are now the **source of truth**; `addToStockpileZone`/`consumeFromStockpiles`/`absorbDropIfOnStockpileTile` rewritten drops-authoritative; aggregate summed from drops; per-tile capacity (`BASE_TILE_CAPACITY` + building `tileCapacityBonus`, advisory); zones = pure drop-off designations (`inventory` vestigial, cleared on init); UI per-zone view derives from drops; building `condition`+repair. Hauling/crafting/butchery tests intact. **Stage 4 (pending):** wire per-stack **tool durability** at work-action completion (closes §B case 3) + **tile-aware decay/deterioration/drying** (roof/enclosure, 2-tile fire proximity) — lands with §F/§1 |
| §1 Wood | ⬜ | |
| §2 Fuel & Heat | ⬜ | |
| §3 Stone | ⬜ | |
| §4 Clay & Ceramics | ⬜ | |
| §5 Ore → Metal | ⬜ | |
| §6 Hide → Leather | ⬜ | |
| §C Food preservation | ⬜ | |
| §D Water needs | ⬜ | |
| §E Trapping | ⬜ | |
| §F Storage & roofs | ⬜ | |
| §G Shelter & Light | ⬜ | |

Phase 1 (primitives through Maker's Bench) is archived.

The **full detailed early-game progression** — forage → fire → primitive tools →
food preservation → shelter & light → water → storage → clay → leather → copper
→ planks → iron → steel. Each step is a production/preservation chain and they
interlock. The deterministic ceiling is **steel / steampunk**. Workshops are
defined **inline in the chapter that uses them** (no central workshop list).

**Out of scope (own specs):**

- Food rot from **exposure to the elements** (rain, heat, frost) → owned by
  [Living World / SEASONS_WEATHER](SEASONS_WEATHER.md) Phase B. This spec handles
  **intrinsic** decay (item `decaySeconds`) + the storage/enclosure that scales it.
- Procedural endgame metals (rolled *Adamantite*-style ores) →
  [PROCEDURAL-METALS](PROCEDURAL-METALS.md).
- **Equipment durability depth** (combat decay, efficiency curve) → owned by
  [EQUIPMENT-EXPANSION](EQUIPMENT-EXPANSION.md). This spec **reuses** that
  `durability` field and adds **work-usage** wear (§B).
- Disease from bad water / poor hygiene, and dynamic **fire-spread risk** → Living
  World. This spec only notes where those hooks attach.

---

## Design Philosophy

Medieval **fantasy**, no industrial/space climb. The tech ceiling is roughly
**steampunk**, so we don't get *width* from many ages — we get **depth** inside
each age. Every age should be more detailed, complex, and timely to progress than
even RimWorld *Hardcore SK + Viles*. Draw production patterns from **Dwarf
Fortress, Vintage Story, TerraFirmaCraft, and Clanfolk**: long multi-step chains,
intermediate goods, real preservation pressure, fuel/heat logistics, tools that
wear out, and meaningful "what do I build next" decisions.

A mature colony differentiates by **magic** and a one-of-a-kind signature metal,
not by reaching a higher age. Those layers are deferred; this one delivers the
mundane foundation they sit on.

---

## Note on existing data / engine hooks

- Data lives in `src/lib/game/database/*.jsonc` (items, buildings, resources),
  **not** the `core/*.ts` files the archived spec referenced.
- Work categories `mining`, `metalworking`, `leatherworking`, `cooking`,
  `caretaking`, `hauling`, `woodcutting`, `crafting` **already exist** in
  `core/Work.ts`. Tool tiers (`stone_axe`/`iron_axe`, `stone_pick`/…) too.
- **Spoilage already works**: items carry `decaySeconds` + `decaysTo`
  (`ItemService` + `GameEngine`); meat decays to `rotten_food`.
- **Durability already exists**: `Item.durability` (0–100) + combat decay is
  spec'd in EQUIPMENT-EXPANSION. Reuse it; §B adds work-usage decay.
- Needs are `pawn.needs = { hunger, fatigue, sleep }`; this spec adds `thirst`
  and `hygiene`.
- A **LightingService** + per-tile light + campfire point light already ship
  (SEASONS_WEATHER Phase A2). §G torches/hearth feed that, and read it for the
  crafting-light penalty.
- Storage today is container **items** (`woven_basket`). This spec adds storage
  **buildings** + a decay/deterioration multiplier.

---

## Early-Game Progression Spine

```
1.  Forage   : loose rock (granite/limestone/…), flint, branches, hay, fiber
               → primitive tools + Tier-1 stations (workbench, hearth, butcher)
2.  Fire     : campfire/hearth; chop trees (stone axe) → logs → firewood; season dry
3.  Hunt/eat : meat nutritious but rots fast; fat → torches
4.  Preserve : halite (salt) → salt meat; smoke-dry over fire
5.  Shelter  : daub/mud walls + roof + door + window → enclosed; torches = work light
6.  Trap     : snares & deadfalls → passive small game
7.  Water    : river / boil in clay urn / dig a Well
8.  Storage  : basket → hay store → log store → clay cellar (slows deterioration)
9.  Clay     : clay → mud brick → fired brick + urns + casting molds (kiln)
10. Copper   : charcoal/coal heat; malachite → copper bar; cast in clay molds → bronze
11. Planks   : bronze → saw → Sawtable → planks (unlock furniture/cooking/storage/walls/roofs)
12. Leather  : cure hides early (or they rot) → tan in plank buckets w/ bark → 5 grades
13. Iron     : bloomery + coal + limestone flux → iron bar
14. Steel    : cast steel  →  [steampunk ceiling]
```

§A–§G are cross-cutting survival systems; §1–§6 are the production chapters.

---

## §A. Forageables & loose stone (multi-type)

The very early loop is hand-gathering. **There is no generic "fieldstone."**
Loose surface stone is the **real rock type** of the local terrain, foraged in
**small amounts** by hand from scree near outcrops — the same five rocks §3
quarries in bulk once a pick exists.

| Forageable      | id            | From                          | Feeds                           |
| --------------- | ------------- | ----------------------------- | ------------------------------- |
| Loose rock (×5) | `granite` … `slate` | scree near matching outcrop (bare hands, small yield) | Tier-1 stations, daub, hearth |
| Flint           | `flint_shard` | gravel, stone outcrops        | knives, sickles, firestarter    |
| Branch          | `branch`      | trees, fallen logs            | tools, traps, wattle, firewood  |
| Hay             | `hay`         | tall grass                    | thatch roof, bedding, baskets   |
| Plant fiber     | `plant_fiber` | grass, scrub                  | cordage → rope                  |

**Tier-1 primitive stations** are built from loose rock (any type) + wood, before
any pick or metal:

| Station         | id              | Build cost (example)                | Enables                       |
| --------------- | --------------- | ----------------------------------- | ----------------------------- |
| Workbench       | `makers_bench`* | 6× loose rock + 4× branch + 2× rope | primitive tools, cordage      |
| Hearth          | `hearth`        | 8× loose rock + 4× branch           | cooking, boiling, warmth, light, **wood drying** |
| Butcher's block | `butcher_block` | 4× loose rock + 2× log              | carcass → meat/hide/fat/bone  |

\* `makers_bench` exists; retune its cost to loose rock. Rock *type* can flavour
station appearance/decor but does not gate function (any rock works).

---

## §B. Durability & Deterioration (all items)

> **Impl status:** durable-goods deterioration (case 3) is implemented +
> unit-tested (`itemService.stepItemDeterioration`, stepped in the turn loop;
> `itemDeterioration.test.ts`). Tool work-usage decay (case 2) needs a
> per-instance/per-stack tool-durability model the engine doesn't have yet — that
> model is owned by [EQUIPMENT-EXPANSION](EQUIPMENT-EXPANSION.md), so the wear
> *loop* lands there; the data hooks (`durabilityLossPerAction` on `stone_axe`)
> are seeded here.

Everything degrades. Add a deterioration model spanning three coordinated cases;
all of them are scaled by storage/enclosure (§F).

1. **Perishables** (food, raw hide) — existing `decaySeconds` → `decaysTo`.
2. **Tool & equipment wear** — reuse `Item.durability` (0–100, EQUIPMENT-EXPANSION).
   This spec adds **work-usage decay**: each work action spends durability scaled
   by **tool tier**. Beginner tools are deliberately fragile — a `stone_axe`
   should break after only a handful of fells.

   | Tier             | Durability loss / action | ≈ uses before break |
   | ---------------- | ------------------------ | ------------------- |
   | Stone (Tier 0)   | ~12                      | ~8                  |
   | Bronze (Tier 1)  | ~5                       | ~20                 |
   | Iron (Tier 2)    | ~2.5                     | ~40                 |
   | Steel (ceiling)  | ~1.2                     | ~80                 |

   At 0 the tool breaks (consumed; may drop a salvage scrap). This forces an
   early, repeated tool economy — the player keeps re-knapping stone tools until
   metal arrives.
3. **Durable-goods deterioration** — non-perishable stockpiled goods (planks,
   bars, blocks) carry a slow `deterioration` (0–100) that creeps up **only from
   elemental exposure in the open**. Storing them **inside any container**
   (basket, urn, chest) or in an **enclosed** building (walls + roof + door)
   **completely halts** it — stored durables take *no* exposure damage, it is not
   merely slowed (§F). Loose in the open they deteriorate; unroofed storage is
   worse still. At 100 the item is ruined (→ scrap/rubble). Clay **molds** (§4)
   are the exception: they wear from **use** (each cast), not exposure, so storage
   doesn't save them. Organic items in the same container still **spoil**
   (`decaySeconds`) — storage only slows that, never stops it (§F).

Field additions: `durabilityLossPerAction?` on tools; `deteriorationRate?` on
durable items (per-turn base, zeroed by any container/enclosure).

---

## §C. Food spoilage & preservation

Meat is the early game's best calorie source (high `nutrition`) but rots fast
(short `decaySeconds` → `rotten_food`). Preservation is the first real tech goal.

**Salt.** Add **halite** (rock salt) — moderately rare, mined in mountains
(`halite` node → `salt`). The gating scarcity.

| Method    | Station              | Recipe                    | Result (`decaySeconds`)     |
| --------- | -------------------- | ------------------------- | --------------------------- |
| Salting   | Butcher's block      | `raw_meat` + `salt`       | `salted_meat` (~10× raw)    |
| Air/smoke-dry | **Drying Rack**  | `raw_meat` + fuel (slow)  | `dried_meat` (~8× raw)      |
| Cooking   | Hearth → Kitchen     | `raw_meat` + ingredient   | `cooked_meal` (nutri+mood)  |

**Drying Rack** (`drying_rack`) — a dedicated preservation **workshop**, built
early from branches + cordage (+ hide). Air- or smoke-dries `raw_meat` (also
fish/herbs) into long-keeping `dried_meat`. Slow and fuel-light, it's the
**salt-free** preservation path — so the player isn't forced to spend scarce salt
(which §6 curing also wants) on every kill.

Storage (§F) stretches these further; raw meat on open ground rots almost at once.

---

## §D. Water — thirst & hygiene needs

Add two needs to `pawn.needs`, accruing each turn like hunger:

| Need    | Field     | Relief                                              | Neglect                                  |
| ------- | --------- | --------------------------------------------------- | ---------------------------------------- |
| Thirst  | `thirst`  | drink at water tile/urn/well; **eating a meal** too | mood↓ → dehydration condition → collapse |
| Hygiene | `hygiene` | wash at water / wash basin; passive decay           | mood↓; (deferred) disease → Living World  |

**Meals also restore thirst** (partially) — eating a `cooked_meal`/`stew` quenches
some thirst, so hydration is a real need but not constant micro-busywork.

**Drinking paths (progression):**

1. **Raw water** — drink at a river/lake tile. Free but *untreated*: small
   hygiene/mood hit now; disease risk later (Living World).
2. **Boiled water** — boil at hearth/campfire (`water` + fuel) → store in a **clay
   urn** (`water_urn`). Safe, portable; lets inland pawns drink.
3. **Well** (`well` building) — needs a digging tool (`digging_stick`/
   `stone_spade`) and a **costly** recipe (rock + log + rope + heavy labour).
   Safe water with no adjacent river → unlocks dry-site settling.

New states: `Thirsty` / `Drinking` / `Washing` (mirror `Hungry`/`Eating`).

**Drink & wash zones.** Add player-paintable `drink` and `wash` zone designations
(mirroring the existing `harvest`/`forage`/`scavenge` zones) so the player
controls *where* pawns go — a clean upstream tile, a urn shelf, a wash basin —
instead of always the nearest (possibly fouled) water. A pawn meeting its thirst
need walks to a `drink` zone (or any water if none set); hygiene sends it to a
`wash` zone via the `Washing` state.

---

## §E. Trapping

Passive hunting so a small colony need not keep standing hunters out. Traps are
**buildings** that periodically capture small game, then must be reset.

| Trap        | id            | Build cost                | Catches                 |
| ----------- | ------------- | ------------------------- | ----------------------- |
| Snare       | `snare_trap`  | 2× branch + 1× cordage    | rabbit, rat, small game |
| Deadfall    | `deadfall`    | 3× branch + 4× loose rock | rabbit, boar (rare)     |
| Baited trap | `baited_trap` | snare + 1× food bait      | higher catch rate       |

Each active trap rolls a low per-turn capture chance; on success it holds a
carcass and goes inactive until a pawn resets it (reuse `hunting`). Bait improves
odds.

---

## §F. Storage, roofs & deterioration mitigation

Storage affects the two decay tracks **differently**:

- **Elemental `deterioration`** (durable goods): any **container** (basket, urn,
  chest) or **enclosed** building **stops it entirely** — stored durables take no
  exposure damage at all. Only goods left loose **in the open** deteriorate, and
  **unroofed** storage is *worse than* bare ground (a penalty multiplier >1).
- **Organic `decaySeconds`** (spoilage): storage only **slows** it via
  `storageDecayMultiplier` (<1); it is **never** fully halted — preserve via
  salting/drying (§C) to extend further. Open ground = 1.0.

**Roof as a buildable tile.** A `roof` placement builds like a wall but on the
overhead layer. A storage building earns its full multiplier only when
**enclosed** (walls + roof + door). Roofs tier up alongside storage.

| Tier | Building / container  | Build cost                              | Mult  | Roof   |
| ---- | --------------------- | --------------------------------------- | ----- | ------ |
| 0    | Woven basket (exists) | cordage (portable)                      | ~0.8  | no     |
| 1    | Hay store / thatch    | hay + branch + cordage; thatch roof     | ~0.7  | thatch |
| 2    | Log store             | logs + loose rock; plank roof*          | ~0.5  | timber |
| 3    | Clay cellar           | fired brick + clay urns; **clay-tile roof** (§G) | ~0.3 | clay tile |

\* Plank-based upgrades (§1) become available after bronze. Multipliers stack with
the preservation method: salted meat in a clay cellar keeps a long time. (Note:
the `~mult` values are the *organic spoilage* slowdown; elemental deterioration of
durables is simply **off** inside any of these — see the two tracks above.)

**Roof tiers:** thatch (hay) → timber (plank) → **clay tile** (molded + fired,
§G) — each slower-deteriorating and lower-maintenance than the last.

---

## §G. Shelter & Light

`daub_wall` and `mud_brick_wall` exist. Pair them with new build tiles to enclose
a hut and to let work happen after dark.

| Build tile | id            | Cost (example)                | Role                              |
| ---------- | ------------- | ----------------------------- | --------------------------------- |
| Roof       | `roof_*`      | thatch/plank/tile by tier     | overhead layer; enables enclosure |
| Door       | `door_*`      | planks (or wattle early)      | access + completes enclosure seal |
| Window     | `window_*`    | wattle early; later shutters  | lets **daylight** in → less torch use by day |

**Clay roof tiles (top tier).** The tile roof isn't just placed — it's
**manufactured**. Cast a reusable **tile mold** (`tile_mold`) at the forge/
bloomery, press clay into it, and fire the pressing at the Pottery Kiln →
`clay_roof_tile`. Compared with thatch or plank roofs, a clay-tile roof
**deteriorates far slower and needs much less rebuild/repair**, and (once Living
World lands) is **more robust against weather hazards** — the payoff for the extra
mold → press → fire chain, and what makes it the prestige top tier.

**Roof rendering.** The roof is **visually transparent** (the player still sees
the tiles and pawns beneath it) but it **casts shade and blocks/alters light** in
the lighting model: a roofed interior reads as darker by day (raising the
crafting-light demand for torches) and shelters the tile. Coordinate with the
LightingService / Living World lighting pass so roof shadow is both a gameplay
input and a visible effect, not just a flat overlay.

**Light matters for crafting.** Read the existing per-tile light value
(LightingService): work in darkness suffers an efficiency penalty (and fine work
may be blocked). Daylight, hearth/campfire light, windows (by day), and **torches**
remove it.

| Light source | id      | Recipe                                  | Notes                              |
| ------------ | ------- | --------------------------------------- | ---------------------------------- |
| Torch        | `torch` | 1× branch + 1× `animal_fat` + fiber     | priority early item; burns N turns |
| Tallow candle| `candle`| `animal_fat` + fiber wick               | longer, dimmer; later              |

`animal_fat` is a **butcher** by-product — rendering fat is the realistic early
fuel for portable light. Hearth/campfire double as fixed light. Torches feed the
existing point-light system; placing fire near stored dry wood (§1) is what later
introduces **fire-spread risk** (Living World).

---

## §1. Wood — species, firewood, drying & planks

Replace the single `tree` node and `wood_log`. Five species, each a biome-spread
tree node yielding a named **log** + shared `bark`/`branch` by-products (bark
feeds tanning, §6).

| Species | log id      | Role / property                                   | Workability | Fuel |
| ------- | ----------- | ------------------------------------------------- | ----------- | ---- |
| Pine    | `pine_log`  | Softwood — cheap bulk construction & fuel; common | fast        | low  |
| Birch   | `birch_log` | Light utility; best firewood; bark-rich           | fast        | high |
| Oak     | `oak_log`   | Hardwood — furniture, heavy beams, durable        | slow        | med  |
| Ash     | `ash_log`   | Tough/springy — tool hafts, polearms, shields     | med         | med  |
| Yew     | `yew_log`   | Premium, rare — bows & fine furniture             | slow        | med  |

**Chopping → logs.** A primitive **axe** (`stone_axe`) unlocks felling trees
(`woodcutting` → species logs). No axe = no logs (only foraged branches).

**Chopping Block** (`chopping_block`) — built from 1× log and **requires an axe**
to construct. Processes logs → **firewood** + **branches** (+ kindling).

```
log  ──Chopping Block──►  green_firewood ×N  +  branch ×M
```

**Wood drying.** Firewood comes out **green** (`green_firewood`). Stored **within
2 tiles of a fire** (hearth/campfire) — *not* directly adjacent — it seasons over
in-game time into **dry firewood** (`dry_firewood`), which has the highest
`fuelValue`/heat. Green wood burns poorly (low heat, more smoke). Direct adjacency
to fire is allowed but later carries fire-spread risk (Living World). Peat (§2)
dries the same way.

**Sawtable** (`sawtable`) — gated behind a **saw** (`saw`), which itself needs a
**`bronze_bar`** (so planks are a **bronze-age** unlock, not primitive). The
Sawtable turns logs → **planks** (+ sawdust).

```
bronze_bar ──► saw ──► build Sawtable ──► log → plank ×K (+ sawdust)
```

**Planks are a keystone unlock** — they gate a wide upgrade tier:

- Better **furniture** (beds, chairs, tables → comfort/rest/mood)
- **Cooking** upgrades (Kitchen, drying/smoke racks, counters)
- **Storage** tier-2+ (log store → plank shelving; tanning **buckets**, §6)
- **Walls, doors, roofs** (plank-framed, sturdier than wattle/daub)
- Tool **hafts** and shields (with the right species)

This makes "reach bronze → make a saw → unlock planks" a deliberate, high-value
early goal that opens many branches at once.

---

## §2. Fuel & Heat

The production chain runs on **heat**, and heat tiers gate what you can make.
Each fuel has a `fuelValue` (already on items) and an effective **heat** rating;
each fire/kiln/forge declares a `minFuelHeat` it must meet to operate.

| Fuel            | id              | Source                              | Heat   | Notes                         |
| --------------- | --------------- | ----------------------------------- | ------ | ----------------------------- |
| Green firewood  | `green_firewood`| Chopping Block (fresh)              | low    | smoky; season it first        |
| Dry firewood    | `dry_firewood`  | seasoned near fire (§1)             | low-mid| best wood fuel; campfire/hearth |
| Peat            | `peat`          | **dug** from bog/mud deposits       | mid    | cheap, smoky; dry like wood   |
| Charcoal        | `charcoal`      | **Charcoal Pit** (pyrolysis of wood)| high   | clean; needed to smelt metal  |
| Coal            | `coal`          | **mined** (seams in mountains/cave) | high+  | iron/steel; efficient         |

**Charcoal Pit** (`charcoal_pit`) — load logs/firewood, smoulder over time →
`charcoal` (+ `ash` by-product, which feeds hide curing §6). A slow batch job; the
first way to reach metal-smelting heat before coal seams are found.

Heat gates: hearth/campfire (firewood/peat) → **copper/bronze** smelting needs
**charcoal or coal** → **iron/steel** needs **coal** (or heavy charcoal) + flux.

### Forge fuel & flux consumption model (the player liked this)

Stone Forge, Bloomery and kilns consume **fuel** each active turn (campfire
mechanism). Higher-heat fuel works; below `minFuelHeat` the station won't light.
Iron smelting additionally consumes **limestone flux** per batch.

```typescript
// BuildingDefinition additions
fuelConsumptionRate: number;      // fuel units per active turn
acceptedFuels: string[];          // e.g. ["coal", "charcoal", "dry_firewood"]
minFuelHeat: number;              // station won't operate below this
fluxPerBatch?: number;            // bloomery: limestone consumed per batch
moldRequired?: string;            // casting: clay mold consumed/worn per cast (§4)
storageDecayMultiplier?: number;  // storage buildings: scales decay + deterioration
requiresEnclosure?: boolean;      // storage: full multiplier only when enclosed
```

Running out of fuel mid-batch pauses the station and loses that item's progress.

---

## §3. Stone — quarrying the 5 rock types

The five rocks of §A, foraged loose in small amounts, are **quarried in bulk**
from outcrops / mountain & cliff walls with a **pick**, then cut into **blocks** at
a **Mason's Bench** (`masons_bench`; built from loose rock + log, Tier-1).

| Rock      | raw id      | block id          | Role / property                              |
| --------- | ----------- | ----------------- | -------------------------------------------- |
| Granite   | `granite`   | `granite_block`   | Hard, strong — premium walls, prestige decor |
| Limestone | `limestone` | `limestone_block` | Soft; also **smelting flux** + mortar (§5)   |
| Sandstone | `sandstone` | `sandstone_block` | Soft, cheap bulk building; decorative        |
| Marble    | `marble`    | `marble_block`    | Prestige — statues, fine floors; slow to cut |
| Slate     | `slate`     | `slate_tile`      | Roofing (tier-3 roof) & flat tiles           |

Limestone is the key cross-link: building stone **and** the flux iron smelting
consumes.

---

## §4. Clay & Ceramics — bricks, urns, **casting molds**

Clay (`clay_lump`, dug from clay/mud deposits) is the ceramics line and, crucially,
the source of **casting molds** that gate all metalwork (§5).

**Pottery Kiln** (`pottery_kiln`) — built from loose rock + clay; consumes fuel
(needs `minFuelHeat` ≈ peat/charcoal). Fires green clay goods hard.

| Product      | id            | From                          | Use                                   |
| ------------ | ------------- | ----------------------------- | ------------------------------------- |
| Mud brick    | `mud_brick`   | clay (sun-dried, no kiln)     | primitive walls/shelter               |
| Fired brick  | `fired_brick` | clay → kiln                   | forges, kilns, clay cellar, sturdy walls |
| Clay urn     | `water_urn`   | clay → kiln                   | boiled-water storage (§D)             |
| **Clay mold**| `clay_mold`   | clay → kiln                   | **required to cast metal** (§5)       |

**Clay molds** are reusable but **deteriorate fast** and crack with each cast
(§B) — an ongoing ceramics demand that ties metal output to clay supply. Different
mold shapes gate different casts (ingot mold vs. tool/weapon molds).

---

## §5. Ore → Metal (many ores → one metal; cast in molds)

Mined ores carry **proper mineral names**; several minerals smelt to the same base
metal. Smelting + casting both consume **heat fuel** (charcoal/coal/peat, §2) and
casting consumes a **clay mold** (§4). Alloys (bronze, steel) are **cast**, not
mined.

**Stone Forge** (`stone_forge`) — built from fired brick + loose rock; smelts
copper/tin and casts bronze. **Bloomery** (`bloomery`) — fired brick + rock; iron
+ flux. **Anvil** (`anvil`) — bars → tools/weapons/armor (also mold-cast or forged).

| Base metal  | bar id       | Feeder ore minerals (node ids)         | Smelt needs            |
| ----------- | ------------ | -------------------------------------- | ---------------------- |
| Copper      | `copper_bar` | `malachite`, `chalcopyrite`, `azurite` | charcoal/coal + mold   |
| Tin         | `tin_bar`    | `cassiterite`                          | charcoal/coal + mold   |
| Iron        | `iron_bar`   | `hematite`, `magnetite`, `limonite`    | coal + limestone flux + mold |
| Lead/Silver | `lead_bar` / `silver_bar` | `galena`                  | charcoal/coal + mold   |
| Gold        | `gold_bar`   | `native_gold`, `electrum`              | charcoal/coal + mold   |

| Alloy  | bar id       | Cast from (+ fuel + clay mold)        | Tier    |
| ------ | ------------ | ------------------------------------- | ------- |
| Bronze | `bronze_bar` | 3× copper_bar + 1× tin_bar            | Tier 1  |
| Steel  | `steel_bar`  | 2× iron_bar + 1× coal + 1× limestone  | ceiling |

Richer minerals (chalcopyrite) yield more bar per smelt than lean ones (azurite).
Bronze → first **saw** → **planks** (§1), so the metal and wood chains interlock.

---

## §6. Hide → Cure → Tan → Leather (two-step gate)

A raw hide is **perishable**: each `*_hide`/`*_pelt` gets `decaySeconds` →
`rotten_hide` if untreated. Leather is gated behind two steps, split across ages.

**Step 1 — Curing (Hide Rack, primitive/early).** `hide_rack` built from branches
+ cordage. Preserves the hide so it stops decaying — letting the player **stockpile
cured hides early** for tanning later.

| Station   | Recipe                                  | Time   | Result                    |
| --------- | --------------------------------------- | ------ | ------------------------- |
| Hide Rack | 1× `*_hide` + (2× `ash` **or** 1× salt) | long\* | `cured_<hide>` (no decay) |

\* Multi-turn job. Ash (charcoal-pit/fire by-product) is the cheap path; salt is
faster but competes with food salting.

**Step 2 — Tanning (Tanning Rack, needs planks).** `tanning_rack` requires **plank
tanning buckets** — so full leather is a **bronze/plank-age** unlock (§1). Cured
hides soak with **bark** (tannin) and sort into 5 grades; raw hide cannot be tanned.

| Grade  | leather id       | Cured from (source hides) | Use                         |
| ------ | ---------------- | ------------------------- | --------------------------- |
| Thin   | `thin_leather`   | rabbit, rat pelt          | clothing lining, light bags |
| Light  | `light_leather`  | deer, goat hide           | soft armor, packs           |
| Sturdy | `sturdy_leather` | wolf, boar hide           | light armor, straps         |
| Heavy  | `heavy_leather`  | elk hide                  | armor, harness              |
| Thick  | `thick_leather`  | bear pelt                 | best armor, prestige trim   |

Cross-links: §1 bark → tannin and planks → buckets; §2 ash → curing; §C salt
competes between food and hides — intentional early tension.

---

## Dependency Chain

```
Forage (loose rock ×5 / flint / branch / hay / fiber)
 ├─ primitive tools (knapped; wear out fast §B) ── Workbench / Hearth / Butcher
 │        │
 │   Stone axe ─► chop trees ─► logs ─┬─ Chopping Block ─► firewood ──season──► DRY firewood
 │                                    └─ (bark, branches)
 │   Hearth/Campfire : cook, boil water, LIGHT, dry wood
 │   Butcher : carcass → meat / hide / fat(→torch) / bone
 │   Drying Rack : raw_meat → dried_meat (salt-free preservation)
 │   Hide Rack : hide + ash/salt → cured hide (stockpile) ─────────────┐
 │        │                                                            │
 │   Shelter : daub/mud walls + ROOF + door + window  → enclosed       │
 │   Light   : torch (branch+fat) / candle ; window = daylight         │
 │   Traps · Water (river / clay urn / Well)                           │
 │        │                                                            │
 │   Storage : basket → hay → log store → clay cellar (slows decay)    │
 │        │                                                            │
 │   Charcoal Pit : wood → charcoal (+ash) ; dig PEAT ; mine COAL      │
 │   Pottery Kiln : clay → fired brick · urns · CLAY MOLDS · clay ROOF TILES (tile_mold)             │
 │   Mason's Bench : quarried rock → blocks / tiles                    │
 │        │                                                            │
 └─ Stone Forge : copper/tin ore + charcoal/coal + mold → bars → BRONZE (cast)
              │
          BRONZE ─► saw ─► Sawtable ─► PLANKS ─► furniture/cooking/storage/walls/roofs
              │                                   └─► tanning buckets ─► Tanning Rack ◄┘
              │                                          (cured hide + bark → leather ×5)
         Basic Metallurgy (research)
              │
          Bloomery : iron ore + coal + limestone flux + mold → iron bar
              │
         Advanced Metallurgy (research)
              │
          Anvil : Steel cast  →  [steampunk ceiling]
              │
   [Phase 3 — enchantment + procedural metals — deferred]
```

---

## Implementation Plan

### Phase A — Survival & deterioration core (data + engine)

- `types.ts`: add `thirst`/`hygiene` to `pawn.needs`; `Thirsty`/`Drinking`/
  `Washing` states; `drink`/`wash` zone designation types; building fields
  (`storageDecayMultiplier`, `requiresEnclosure`, `minFuelHeat`, `fluxPerBatch`,
  `moldRequired`); item fields (`durabilityLossPerAction`, `deteriorationRate`).
- `items.jsonc`: retype loose stone to the 5 rock ids (small forage yields);
  `salt`, `salted_meat`, `dried_meat`, `cured_<hide>`, `rotten_hide`, `water`,
  `water_urn`, `ash`, `animal_fat`, `torch`, `candle`. Set perishable
  `decaySeconds`; set tool `durability`/`durabilityLossPerAction` (stone fragile).
- `buildings.jsonc`: Hearth, Butcher's block, **Drying Rack**, Hide Rack, Well,
  traps, storage buildings, `roof`/`door`/`window` build tiles.
- `resources.jsonc`: `halite` (mountains), peat in bog/mud deposits, coal seams.
- Services: container/enclosure **zeroes** elemental `deterioration` (durables);
  organics still spoil via the scaled `decaySeconds` path; **work-usage durability
  decay** in `WorkService` (spend tool durability per action; break at 0);
  thirst/hygiene accrual (**meals restore thirst**); `Washing` state + pawn
  routing to `drink`/`wash` zones; trap capture roll; shared `isEnclosed(tile)`
  (walls + roof + door); crafting-light penalty reads LightingService.

### Phase B — Wood, fuel & ceramics (data)

- `items.jsonc`: 5 log + 5 plank, `green_firewood`/`dry_firewood`, `sawdust`,
  `charcoal`, `peat`, `coal`, `clay_mold`, `tile_mold`, `clay_roof_tile`,
  `fired_brick`, `saw`.
- `buildings.jsonc`: Chopping Block, Sawtable, Charcoal Pit, Pottery Kiln (+ fuel/
  heat/mold fields).
- Engine: **wood-drying** tick (green → dry when within 2 tiles of a fire, not
  adjacent); fuel `minFuelHeat` gating in `BuildingService`.

### Phase C — Stone, metal & leather (data + services)

- `items.jsonc`: 5 block/tile, ore-mineral raws, base-metal + alloy bars, 5
  leather grades, tanning bucket.
- `buildings.jsonc`: Mason's Bench, Stone Forge, Bloomery, Anvil, Tanning Rack.
- `resources.jsonc`: replace `tree` with 5 species nodes; replace generic
  copper/iron/tin ore with named mineral nodes; add quarry yields to walls.
- `BuildingService`: forge fuel + flux + **mold consumption/wear**.
- `resourceGeneratorService`: distribute species/rock/ore/halite/peat/coal across
  biome spawn tables (copper common; tin/iron rarer; gold rare; coal in seams).
- `WorkService`: smelting/casting/sawing/masonry/curing/tanning reuse existing
  work categories — no new work types (trapping resets reuse `hunting`).

---

## Open Questions

- [ ] Tool wear granularity: per-action decrement (chosen) vs. chance-to-break?
      (lean: deterministic decrement so stone clearly lasts ~8 uses.)
- [ ] Wood drying: track a per-stack `dryness` 0–100, or a simple green→dry flip
      after N turns near fire? (lean: dryness value so partial seasoning reads.)
- [ ] Casting molds: reusable-with-wear (chosen) or single-use? One generic ingot
      mold + per-item molds for tools/weapons?
- [ ] Clay roof tiles: `tile_mold` cast at the forge/bloomery, clay pressed and
      fired at the Pottery Kiln (chosen) — confirm the firing station (kiln vs.
      bloomery heat) and whether the tile mold is metal (cast) or fired clay.
- [ ] Crafting-light penalty curve, and does it block *all* work or only fine work
      (smithing, fletching, tailoring)? (lean: fine work only; hauling unaffected.)
- [ ] Roof rendering: transparent overhead layer that still casts shade + blocks/
      alters light (roofed interior darker by day). Coordinate with LightingService
      so roof shadow is both gameplay input and visible effect.
- [ ] Migration: retype `surface_stone`/`wood_log` in saves, or new-game-only?
      (lean: new-game-only — hot-reloads anyway and there's no proper save yet.)
- [ ] Direct fire-adjacency fire-spread risk — confirm it lands in Living World,
      not here.
- [ ] Can forges overheat / explode? (deferred — hazard system, Phase 3.)
```
