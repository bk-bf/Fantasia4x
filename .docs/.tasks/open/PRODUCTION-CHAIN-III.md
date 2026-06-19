<!-- LOC cap: 640 (created: 2026-06-20) -->

# PRODUCTION CHAIN III — Medieval Depth, Magic Ages, Construction, Armour & Famed Items

> **Related:** [ROADMAP](ROADMAP.md) · [PRODUCTION-CHAIN-II](PRODUCTION-CHAIN-II.md) (§Q quality, §M magic gear, §F farming, §L logistics) · [ENTITIES_SPAWNING](ENTITIES_SPAWNING.md) (carcass yields, husbandry/wool source) · [SOCIAL-LAYER](SOCIAL-LAYER.md) (equipment prestige) · [MAGIC-SKILLS](MAGIC-SKILLS.md) (magic ages, alchemy) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) (gating) · [NOTES](../game/NOTES.md) (farming/terraform notes) · [game/DESIGN](../../game/DESIGN.md) · archived: [PRODUCTION-CHAIN-EXPANSION](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) (Pass I)

## Status

**[ ] Not started — design capture.** This is the **third** production/items/buildings pass. Pass I
(forage→fire→tools→metal→leather) and Pass II (§Q quality, §M magic gear) are done; **§F farming and
§L logistics from Pass II remain open and are NOT duplicated here** (cross-linked instead). Pass III's
job is to **deepen the medieval slice to Hardcore-SK density and replace HSK's spacer/ultratech ages
with MAGIC ages** — without leaving the medieval-fantasy-steampunk ceiling.

> **Benchmark (why this spec exists).** A 2026-06-20 audit compared us to the RimWorld **Hardcore SK +
> VilesMods** corpus (parsed: ~775 ThingDefs / 470 recipes in the Vile mods *alone*, on top of HSK's
> thousands). We sit at **~35 %** of the *achievable-within-ceiling* (pre-industrial) target, with the
> value concentrated in tools + metal-spine and the gaps in **construction, leather variety, armour
> depth, alchemy, and defence**. Vile mods are used as a **reference for what historical step exists**,
> never copied — every borrowed idea is reworked to a familiar-but-distinct mechanic (e.g. tanning in
> **buckets** à la Vintage Story, not tanning vats). Gunpowder is **explicitly out of scope** for this
> pass (the one big pre-industrial block we deliberately skip).

---

## Design Philosophy (Pass III additions)

Continues Pass I–II's rule — richness from **depth inside an age, not more ages** — with three new spines:

1. **Magic replaces high-tech.** Where HSK climbs Neolithic→Industrial→**Spacer→Ultratech→Mechtech**,
   we climb Neolithic→Bronze→Iron→Steel→**Arcane→Runic→Mythic**. Every "next age" past steel is a
   **magic age**: gem-dust-infused materials, attuned workstations, runic walls, mythic gear. A
   RimWorld player reads the *shape* (tiered furnaces, multi-step alloys, late-game super-materials)
   but the *content* is sorcery, not circuitry.
2. **Every station and material gets a magic-infused capstone variant** — the same recipe shape it
   always had, plus a **gem-dust processing step** and a doubled mundane cost. This is the universal
   "one more tier" lever (mirrors how HSK adds Induction Furnace / Electrolytic Refinery above the
   mundane forge — we add the **Manaforge / Runic** variant above ours).
3. **Armour is worn around the clock — there is NO civilian apparel layer** (RimWorld's clothing-vs-
   armour split is deliberately rejected). The only cost of wearing armour is **encumbrance** (already
   wired: the `encumbered` condition driven by carry-load). Advanced colonies *sidestep* that cost
   through **loadout discipline** (light/medium/heavy matched to a pawn's STR/talents), **magic
   rings/amulets** (§M, done), **potions** (§G), **logistics** (§L), and **prestige regalia**
   ([SOCIAL-LAYER](SOCIAL-LAYER.md)). Gear depth is a *systems* problem, not a wardrobe.

Draw production patterns from **Dwarf Fortress, Vintage Story, Clanfolk, Battle Brothers** (long
chains, intermediate goods, bucket/cauldron processing, named legendary items).

---

## Chapter Map

| § | Chapter | Theme | Headline dependency |
| - | ------- | ----- | ------------------- |
| **§A** | **Magic Ages framing** | the tech ladder past steel = arcane→runic→mythic | RESEARCH gating; §M done |
| **§B** | **Workstation tiers & magic upgrades** | carpentry bench, tanning buckets, alchemy lab, masonry, forge upgrades + the universal **infused-variant** pattern | tool-sacrifice build pattern |
| **§C** | **Construction / Walls** | clay-brick → stone-block+mortar → rebar concrete → magic-dust concrete | §B masonry; metal chain |
| **§D** | **Resin & Glue** | tree resin (early glue) → bone glue → arcane binder | tree yields; alchemy (§G) |
| **§E** | **Hide & Leather** | carcass yields, beast-grade hides (multi-step), **wool ≠ leather** split | ENTITIES carcasses; §B buckets |
| **§F** | **Armour & Loadouts** | light/medium/heavy; chain/plate; beast-leather + bone peak; encumbrance trade; prestige hook | §E leather; encumbrance (done); SOCIAL prestige |
| **§G** | **Alchemy & Potions** | replaces "chemistry"; potions, dyes, binders, fertiliser | cauldron/alembic; §M conditions |
| **§H** | **Defence buildings** | traps, stationary heavy weapons (medieval + magic, **no cannons**), barricades | §C materials; §G/§M magic |
| **§I** | **Famed Items** | Battle-Brothers named/legendary overlay above §Q | §Q quality; conditions.jsonc; rarities.jsonc |

---

## §A — Magic Ages (the tech ladder past steel)

The research/tech progression, reframed so the **post-steel ages are magical**, not industrial:

| Age | Mundane spine (have/Pass I–II) | Pass III adds |
| --- | ------------------------------ | ------------- |
| Stone / Bone | flint, bone, knapping, lashing | resin glue (§D), proper carpentry bench (§B) |
| Bronze | copper/tin/bronze cast | bronze tool/station upgrades; mortar masonry (§C) |
| Iron | bloomery iron, finery steel | stone-block walls, chain mail, tanning buckets |
| Steel | steel bar, plate | rebar **Roman concrete** walls; beast-grade leather/bone armour (the **mundane ceiling**) |
| **Arcane** *(magic age 1)* | — | gem-**dust** processing; **attuned** station variants; arcane binder; weak enchant potions |
| **Runic** *(magic age 2)* | — | **magic-dust concrete** walls; runic forge/loom; mid potions; magic-enhanced defence |
| **Mythic** *(magic age 3)* | — | **Famed items** (§I); mythic beast materials; capstone gear |

> **Research seam:** new nodes slot under [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md)'s tier model;
> the magic ages reuse the existing `arcane_lapidary` / `attunement` gates (§M) as their entry tier and
> add `runic_inscription` / `mythic_attunement` above. Gem-dust is the shared currency of all three.

---

## §B — Workstations: tiers, the build pattern, and the magic-infused variant

### B.1 The established build pattern (keep + extend)

Every new station tier **costs the first batch of the tools/materials it will then make faster** — the
`makers_bench` precedent (built from `flint_knife`+`stone_chopper`+`stone_axe`+`stone_hammer`+branch+
cordage). Pass III holds this rule for every new bench:

- **Carpentry Bench** (`carpenter_bench`) — the missing "planks unlock proper joinery" tier. Built from
  the **first `saw` + a batch of `pine_plank` + `iron_nail`s + the first hammer** (sacrifice the new
  tier's outputs). Unlocks: **buckets, barrels, fine furniture, wheel** (§L), shields, bows-in-bulk,
  and is the prerequisite the **tanning buckets** gate behind.
- **Alchemy Lab** (`alchemy_lab`, §G) — built from the first **clay alembic + cauldron + glassware**.
- Magic benches already follow this (Attunement Altar costs an attuned gem). Hold the line everywhere.

### B.2 Tanning in BUCKETS (Vintage-Story-style, not vats)

Reject Vile's `TanVat_*` family. Instead (per user): **leather is tanned in buckets**, and a bucket is a
**two-step object — first crafted, then placed/built into a station** — so the leather age is gated
behind *woodworking*, not a dedicated vat building.

**The tanning bucket is mechanically a PASSIVE FURNACE that takes `tanning_brine` as its "fuel."** This
reuses the existing passive-furnace + fuel system **wholesale** (`passive: true`, `maxFuel`,
`fuelConsumptionRate`, `fuelRequirements`) — no new mechanic. The hide is the work *input*; the brine is
the consumable that *depletes to run the soak* (a soak liquor, modelled as fuel). Full chain:

```
pine_plank + resin (§D) ──[craft @ carpenter_bench]──▶ wooden_bucket (item)
wooden_bucket (item) ──[BUILD/place]──▶ bucket STATION (a passive furnace)   ← craft the thing, then set it down
bark/tannin + salt + ash + water ──[brew, passive/slow]──▶ tanning_brine     (§B.2.1 — the bucket's "fuel")
load tanning_brine as FUEL  +  cured_hide (input) ──[bucket soaks passively, burning brine]──▶ leather
```

- A bucket is **crafted as an item at the carpenter_bench, then *built* (placed) to become the passive
  station** — exactly the "craft → place" shape `pottery_kiln`/`bloomery` already use. A colony scales
  leather by placing **more buckets**, not one big tannery. Keep `tanning_rack`/`Tannery` as the
  *bronze-age batch* upgrade (higher throughput) above hand-buckets.
- Because brine is the **fuel**, a bucket with no brine loaded sits idle (like an unfuelled furnace); top
  it up to keep tanning. `tanning_brine` gets a `fuelValue`/`fuelHeat` so it depletes through the
  existing fuel loop (the "heat" is just the soak's strength — beast hides need a hotter/stronger brine).

#### B.2.1 Tanning brine (new, passive — proposed recipe)

The bucket's fuel — a liquid liquor the hide soaks in. Historically a **bark-tannin pickle**: vegetable
tannin + salt + alkali (wood ash → lye). Brewed in a **`wooden_barrel`** (the bucket's bigger passive
sibling — *not* the bucket itself, which burns brine as fuel), proposed:

| | Inputs | Station | Time | Output |
| - | ------ | ------- | ---- | ------ |
| **tanning_brine** | `bark` ×3 (or `oak_galls`/`tannin` later) + `salt` ×1 + `ash` ×1 + `water` ×2 | placed `wooden_barrel` (passive) | **passive, long** (multi-day steep) | `tanning_brine` ×2 |
| **beast_brine** | `oak_galls`/strong tannin + `salt` ×2 + `ash` ×2 + `water` ×3 | `wooden_barrel` | longer | `beast_brine` (hotter `fuelHeat` for §E beast hides) |

- **Passive + slow on purpose** — brine steeps over in-game days (like brewing's fermentation timer),
  so leather has a real lead-time. Brewing brine (barrel) and tanning (bucket) are two separate passive
  vessels, so a leatherworking colony runs a small standing battery of both.
- `tanning_brine`'s `fuelHeat` gates which hides it can tan: ordinary brine tans common hides;
  **beast hides (§E) require `beast_brine`** (higher heat — the furnace `minFuelHeat` gate, reused).

### B.3 The universal **magic-infused station variant** (propose — Vile-referenced)

Every mundane crafting station gets an optional **infused capstone** that mirrors how HSK stacks
Induction Furnace / Electrolytic Refinery above the mundane forge. Pattern (data-only, one shape):

> **infused\_\<station\>** = the base station's full cost **doubled** + **N `gem_dust`** (§I/§G) + the
> base station's own top output (the sacrifice rule), gated by `runic_inscription`. It adds a *speed +
> quality* bonus AND **unlocks the station's magic recipe family** (e.g. only a Manaforge can forge
> mythic-metal; only a Runic Loom weaves enchant-thread).

| Mundane station | Infused variant (proposed) | Vile reference (reworked) | Unlocks |
| --------------- | -------------------------- | ------------------------- | ------- |
| `anvil` (Smithy) | **Manaforge** | InductionFurnace → arcane heat | mythic-metal weapons/armour; rune-etched tools |
| `finery_forge` | **Runic Crucible** | CrucibleSteel/CementationFurnace | magic-alloy bars (gem-dust + steel) |
| `weaving_frame` | **Runic Loom** | DyeingStation | enchant-thread, prestige cloth |
| `lapidary_bench` | *(already the magic bench)* | — | (gem-dust grind lives here, §I) |
| `masons_bench` | **Glyph-Cutter's Banker** | StampMill | runed blocks for magic-dust walls (§C) |
| `alchemy_lab` | **Arcane Alembic** | ChemistryLab → alchemy | high-tier potions, transmutation |
| `carpenter_bench` | **Heartwood Joiner** | — | prestige/magic-wood furniture, magic-bow stocks |

Each infused variant is **one JSONC building entry + a recipe family gated to it** — no new engine work
(rides `effects.craftingEnabled` + the station-id recipe gate, exactly like §M's benches).

### B.4 Implementation checklist

- [ ] `carpenter_bench` (`buildings.jsonc`) — sacrifice-pattern cost; `craftingEnabled`; gates buckets/barrels/fine furniture.
- [ ] `wooden_bucket` + `wooden_barrel` **items** (craft @ carpenter_bench) **and** matching placed **building** entries — the bucket = a **passive furnace** (`passive`/`maxFuel`/`fuelConsumptionRate`/`fuelRequirements` referencing `tanning_brine`); the barrel = the passive brewing vessel.
- [ ] `tanning_brine` (+ `beast_brine`) item with `fuelValue`/`fuelHeat`; its **passive brew recipe at the `wooden_barrel`** (B.2.1) — `beast_brine` higher `fuelHeat` for §E beast hides.
- [ ] Leather recipe = `cured_hide` (input) tanned at the bucket while brine depletes as fuel (`minFuelHeat` gates common vs beast hides); keep `tanning_rack` as the batch upgrade.
- [ ] `alchemy_lab` building (§G) + sacrifice-pattern cost.
- [ ] Add the **infused-variant** entries above (gated `runic_inscription`) + their unlocked recipe families.
- [ ] ADR if the bucket-as-station object needs a non-obvious mechanic (passive soak timer) — likely reuses the passive-furnace model.

---

## §C — Construction: the wall-material ladder

We stall at **clay-brick walls** (`mud_brick_wall`); the masonry/concrete tiers are missing. The ladder
(per user), each tier a real processing chain, **culminating in a magic wall age**:

| Tier | Wall | New intermediates / steps | Gate |
| ---- | ---- | ------------------------- | ---- |
| have | Clay-Brick Wall | `mud_brick` (have) | — |
| **C1** | **Stone-Block Wall** | dressed `*_block` (have) + **`mortar`** (new: lime/sand/water at masons_bench) | masonry |
| **C2** | **Rebar Concrete Wall** | **crushed stone → `concrete`** (new processing: stone→`crushed_stone`→`concrete` mix) + **`rebar`** (new: metal bar drawn to `rebar`/pipe at anvil) | engineering |
| **C3** | **Magic-Dust Concrete Wall** *(magic wall age)* | C2 process **repeated at ×2 concrete + metal**, **plus `gem_dust`** (ground from **infused** gems only — see "Gem-dust source") mixed in | `runic_inscription` |

- **Mortar** (`mortar`): `limestone`→`quicklime` (kiln) + `sand` + water. Binds blocks; also feeds
  plaster/render later. Historical, familiar, distinct from "concrete."
- **Roman concrete** is the deliberate flavour for C2 (lime + pozzolanic crushed stone), reinforced with
  **`rebar`** drawn from metal bars — so the strongest mundane wall needs *both* the stone chain and the
  metal chain to meet. `crushed_stone` is a hammer/`stamp_mill`-style processing step (Vile StampMill
  reference, reworked to a hand/masons step).
- **Magic-dust concrete (C3)** is the **template for the whole magic-wall age**: take the best mundane
  recipe, double the mundane inputs, add a **gem-dust processing step**, gate behind a magic research.
  Yields walls with magic resistances / beauty / self-repair (tunable via `effects`). This same "×2 +
  gem-dust" template is what §B.3 applies to *stations* and §I applies to *gear*.

### C.1 Implementation checklist

- [ ] `mortar` item + recipe (masons_bench); `quicklime` from `limestone` (kiln).
- [ ] `stone_block_wall` building (blocks + mortar).
- [ ] `crushed_stone` (processing) + `concrete` (mix) items + recipes; `rebar` from metal bar (anvil).
- [ ] `rebar_concrete_wall` building (concrete + rebar).
- [ ] `gem_dust` item + grind recipe (lapidary/glyph-cutter) — **infused gems only** (see below); `magic_concrete` + `magic_concrete_wall`.

> **Gem-dust source (canonical rule, per user).** `gem_dust` is ground **only from `infused_*` / `attuned_*`
> (magic) gems** — the magic in the dust *comes from* the mana-infused stone. **Normal cut gems do NOT
> grind to dust**; they stay **trade goods** (and a *future, unplanned* sink: ground normal gems as
> pigment/inlay for **art & decoration** — capture only, not in this pass). So every magic-tier material
> (walls C3, infused stations §B.3, arcane binder §D, potions §G, defence §H, Famed reforge §I) draws on
> the **infused-gem economy**, making infused gems the true bottleneck of the magic ages.
- [ ] Wall `effects`: thermalInsulation/weatherProtection ladder + (C3) `magicResistance`/`beauty`/repair.
- [ ] Cross-link §L roads (cobble/gravel reuse `crushed_stone`).

---

## §D — Resin & Glue (the binder chain)

A missing primitive: **adhesive**. Today everything is "lashed with cordage." Add a real glue line so
hafting/joinery/composite items have a binder, and so later tiers feel distinct.

- **Tree resin** (`resin`): a **yield added to certain trees** (pine/conifer + the warm magic wood
  `emberwood`). Tapped/gathered alongside `woodcutting` (a low-rate secondary yield, or a tap-station).
  **Early glue.** Rework select recipes to consume `resin` as a binder (composite tools, bow nocks,
  hafted heads, sealed buckets, torch-binding) — *optionally alongside* cordage so cordage stays useful.
- **Bone glue** (`bone_glue`) — **proposed light-glue tier** (per user "maybe light glue via grinding
  bones"): `large_bones` → **`bone_meal`** (grind at a quern/`stamp_mill`/pestle) → **boil in a
  cauldron/alchemy_lab with water** → `bone_glue` (or `hide_glue` from hide scraps the same way). A
  *stronger, craftable* binder than wild resin — the mid-tier adhesive that doesn't depend on finding
  resinous groves. Also a natural **sink for the carcass `large_bones`/scrap** that §E produces.
- **Arcane binder** (`arcane_resin`) — magic-age capstone: resin + `gem_dust` at the alchemy_lab; binds
  magic-material assemblies (Famed-item reforging, magic furniture).

### D.1 Implementation checklist

- [ ] `resin` item; add as a secondary `gatheringTypes`/yield on conifer + emberwood trees (resources/items).
- [ ] Rework ~6–10 existing binder recipes to accept/require `resin` (composite tools, hafts, buckets, bows).
- [ ] `bone_meal` (grind) + `bone_glue`/`hide_glue` (boil) recipes; pick the grind station (quern/pestle).
- [ ] `arcane_resin` (alchemy, gem-dust) for magic assemblies.

---

## §E — Hide & Leather expansion (+ the wool split)

### E.1 Carcass yields (the open data gap)

We recently added a **broad creature roster** ([creatures.jsonc](../../src/lib/game/database/creatures.jsonc):
aurochs, mammoth, hippogriff, owlbear, sabretooth, mire-crocodile, etc.) each with its **own carcass
item** in items.jsonc — **but butchery yields are not authored yet** (ENTITIES Phase B note). Pass III
authors them, and grades hides by beast:

| Hide grade | Source beasts | Cured → tanned | Use |
| ---------- | ------------- | -------------- | --- |
| thin / light / sturdy / heavy / thick | (have — common game) | (have) | clothing-free **light/medium armour**, furniture, packs |
| **beast-grade** *(new)* | bear, owlbear, sabretooth, mammoth, mire-crocodile (scaled hide), hippogriff (feathered) | **multi-step**: raw → scraped → cured → **tanned → hardened/boiled → plated** | **heavy/peak armour**, prestige furniture, magic-gear backing |

- **Beast-grade hides need multiple post-processing steps** (scrape → cure → tan → harden), each a
  recipe, so the strongest leather is a *chain*, not a drop. Reptile/croc → **scale plate**; mammoth →
  **thick fur-hide**; owlbear/sabretooth → **dense pelt**. These feed **higher-tier furniture, (armour-
  only) apparel, and armour** (§F).
- Per-creature yields are authored on the **carcass item** (`yields`/butchery table) or a butchery
  recipe per carcass — reuse the existing `butcher_spot`/`dressing_stone` yield-bonus mechanic.

### E.2 Wool ≠ leather (the furniture/armour split)

Per user: separate **furniture/soft-goods material** from **armour material**.

- **Wool items** (`wool`, `coarse_wool`, `fine_wool`) — **wired onto husbandry/wild animals** in
  creatures.jsonc as a `produces`/shear yield (sheep, mountain_goat, mammoth→`coarse_wool`). Wool →
  **`felt`/`woolcloth`** (weaving_frame) → **furniture, bedding, packs, soft furnishings, prestige cloth**.
- **Leather** stays the **armour** material (the tanning chain above). So a colony can furnish a hall
  from wool without spending armour-grade leather, and vice-versa — two parallel soft-material economies.

### E.3 Implementation checklist

- [ ] Author butchery **yields** for every new carcass in creatures.jsonc/items.jsonc (close the ENTITIES B gap).
- [ ] Beast-grade cured/tanned hide items + the multi-step processing recipes (scrape→cure→tan→harden→plate).
- [ ] `wool`/`coarse_wool`/`fine_wool` items; add `produces`/shear yields on woolly creatures; `felt`/`woolcloth` recipes.
- [ ] Route furniture & bedding recipes to wool/felt; route armour recipes to leather (§F).

---

## §F — Armour & Loadouts (no civilian apparel)

**Core rule:** armour is worn 24/7; there is **no separate clothing layer**. The *only* cost is
**encumbrance** — already wired (`encumbered` persistent condition, driven by carry-load vs a STR-scaled
limit; stages burdened→encumbered→overloaded apply moveSpeed/dodge/hitChance/workEfficiency/fatigue
penalties). Pass III adds the **breadth** and the **sidestep systems**, not a wardrobe.

### F.1 Weight classes (the loadout fork)

| Class | Examples | Encumbrance | Who wears it |
| ----- | -------- | ----------- | ------------ |
| **Light** | padded/quilted, light/thin leather, hide | low | scouts, archers, casters, low-STR/high-DEX pawns |
| **Medium** | sturdy/heavy leather, **chain mail**, scale | medium | line workers who may fight; balanced builds |
| **Heavy** | **plate mail**, beast-leather plate, **bone-plated** | high | dedicated soldiers, high-STR/talented pawns |

Advanced colonies **sidestep encumbrance** by matching class to pawn capability and stacking the
existing levers: **§M rings/amulets** (`grace`/`fortitude`/`vigor` — dodge/fatigue/endurance buffs that
offset load), **§G potions** (temporary STR/stamina), **§L logistics** (don't make soldiers haul), and
high STR/CON talents. A talented heavy is *un-encumbered*; an untalented one is a liability — that's the
intended decision.

### F.2 The armour ladder (chain/plate + beast/bone peak)

| Tier | Body | Head | Notes |
| ---- | ---- | ---- | ----- |
| primitive | hide vest, padded | leather coif | have |
| iron | **chain mail** hauberk, **scale** | nasal/kettle helm | new chain/scale recipes (wire-drawing intermediate) |
| steel | **plate** cuirass | great helm | new; the mundane combat ceiling |
| **beast** *(peak mundane)* | **beast-leather plate**, **bone-plated** cuirass | bone/horned helm | §E beast hides + bone; rivals plate, lighter, prestige |
| **arcane+** | gem-dust-infused plate (×2 + gem-dust) | runed helm | §B.3 Manaforge; resist/repair `effects`; below Famed (§I) |

- **Chain mail** introduces a **wire/ring** intermediate (`iron_wire` → `mail_rings` → hauberk) — a
  satisfying sub-chain à la HSK, distinct from plate's "bar → plate" path.
- **Bone armour** consumes the carcass `large_bones`/skulls/horns §E produces — closing the butchery loop.

### F.3 Prestige hook → [SOCIAL-LAYER](SOCIAL-LAYER.md)

Equipment gains a **`prestige`** field (how impressive it makes the wearer). **Royalty/leader outfits**
(crown-cloak, ceremonial plate, regal robes) trade combat/encumbrance for high prestige — the *same*
trade-off shape as the helmet-vs-magic-diadem fork (§M): a prestige piece occupies an armour slot but
gives little defence. Full mechanic specced in **SOCIAL-LAYER → Prestige & Regalia**; this chapter just
adds the `prestige` field + the royal-outfit item line.

### F.4 Implementation checklist

- [ ] `iron_wire`/`mail_rings` intermediates; `chain_hauberk`/`chain_coif`; `scale_*` armour.
- [ ] `plate_cuirass`/`great_helm` (steel) — mundane ceiling.
- [ ] Beast-leather plate + bone-plated armour (consume §E beast hides + bone) — peak mundane, prestige edge.
- [ ] `prestige` field on `Item.armorProperties`; royalty/leader outfit items (SOCIAL-LAYER drives the effect).
- [ ] Confirm encumbrance already punishes each class correctly (it should — verify tuning, not new code).
- [ ] **No** civilian-apparel items, no day/night swap — armour is the only worn layer.

---

## §G — Alchemy & Potions (replaces "chemistry")

Per user: **no chemistry** — its slot is **alchemy/potions**. The alchemy_lab (§B) is the chem-lab
analogue, reworked to sorcery + mundane processing it legitimately covers (dyes, tannin, fertiliser,
glue-boiling, soap).

- **Potions** are **consumables that apply a `conditions.jsonc` buff for a duration** — the *active*
  cousin of §M's worn buffs, riding the **same condition pipeline** (push a magical condition id with a
  timer, like the on-hit `envenomed`/`disoriented` effects already do). E.g. *Potion of Might* → `might`
  for N turns; *Draught of Vigor* → `vigor`; healing draught → heal-rate boost. Brewed from herbs (§F
  farming) + `gem_dust` (potency) at the alchemy_lab; quality (§Q `alchemy_quality`, already a stat)
  scales duration/strength.
- **Mundane alchemy also covers**: dyes (colour prestige cloth/leather), `tannin` concentrate (better
  leather), `compost`/fertiliser (ties §F farming + NOTES terraform notes), soap (`filthy` mitigation),
  and **glue-boiling** (§D bone/hide glue).
- **Transmutation (mythic):** Arcane Alembic (§B.3) can up-convert lesser gem-dust → greater, or metal →
  magic-alloy — the alchemical "refinery" capstone (Vile ElectrolyticRefinery reference, reworked).

### G.1 Implementation checklist

- [ ] `alchemy_lab` (§B) + `Arcane Alembic` infused variant.
- [ ] Potion items (consumable) → each lists a `grantsConditions`-style timed buff; wire a "drink → push timed condition" consume path (reuse on-hit-effect timer mechanic).
- [ ] Dye / tannin / soap / fertiliser recipes (mundane alchemy).
- [ ] `alchemy_quality` already in stats.jsonc — scale potion duration/strength by it (like §Q meal nutrition).

---

## §H — Defence buildings (medieval + magic, no cannons)

Expand beyond `snare_trap`/`deadfall`. **No gunpowder/cannons** (out of scope). Three families:

| Family | Mundane (medieval) | Magic-enhanced |
| ------ | ------------------ | -------------- |
| **Traps** | spike pit, caltrops, swinging-log, **bear-trap** (metal) | **rune trap** (gem-dust glyph: on trigger pushes a debuff condition — `disoriented`/`ensnared`, reusing on-hit effects) |
| **Stationary heavy weapons** | **ballista**, **scorpion**, **springald** (bolt-throwers; auto-fire on adjacent hostiles like the existing trap `catchChance`/turret pattern, drawing bolt ammo) | **arcane turret** (channels mana/`gem_dust` charges to loose an elemental bolt — reuses §M elemental damage + the ranged circuit) |
| **Fortification** | **palisade** (upgrade of branch wall), **barricade** (deployable cover, partial-height — grants the defender cover like the ranged `coverPenalty`), gatehouse | **warded wall** (the §C magic-dust wall already resists; add a ward node that buffs nearby defenders) |

- Stationary weapons are **buildings that auto-engage** — extend the existing `trapEnabled`/`catchChance`
  building mechanic into a "fires at the nearest hostile in range, consumes ammo" station (the turret
  pattern). Ballista/scorpion draw **bolts** (existing ammo category); arcane turret draws `gem_dust`.
- **Barricades** grant cover (lower a shooter's hit chance against a defender behind one) — reuse the
  ranged `rangedCoverPenalty` seam, no new combat math.

### H.1 Implementation checklist

- [ ] Trap items/buildings: spike_pit, caltrops, bear_trap; **rune_trap** (gem-dust → pushes a debuff condition on trigger).
- [ ] Stationary weapons: `ballista`/`scorpion` (auto-fire building, draws bolts) + `arcane_turret` (draws gem_dust, elemental bolt).
- [ ] Fortification: `palisade`, `barricade` (cover), `gatehouse`; warded-wall node.
- [ ] Cross-link RANGED-COMBAT (cover/LoS) + §M (elemental) + §C (wall tiers).

---

## §I — Famed Items (the Battle-Brothers end-game overlay)

A **new identity tier ABOVE the §Q quality scale** (Crude→…→Legendary). §Q makes an item *better*;
**Famed** makes an item a *legend with a name and a story*. Inspired by Battle Brothers' named items.

- **New `rarities.jsonc` tier — `famed`** (above `legendary`; gold/iridescent colour) — plus a per-stack
  flag `famed: true` on the `ItemInstance` (like `quality`).
- **Procedural identity:** on becoming Famed, an item rolls a **generated name** (e.g. *"Bittermourn,
  the Widow's Answer"*) + a short **generated history** (forged-by / slew / lost-at lines), stored on the
  instance and shown in the item card. A small `core/famedNames.ts` generator (race-lore style — we
  already procedurally generate race lore, reuse the approach).
- **Stat explosion:** **all of the item's quality-relevant stats ×2–5** (random per stat), stacking on
  top of its §Q tier — a Famed Masterwork sword is absurd, and rare.
- **Enchantments:** grants **1–3 random magical conditions** from conditions.jsonc (the §M buff pool +
  the elemental on-hit pool) while equipped — reuses `grantsConditions` exactly (no new wiring).
- **How an item becomes Famed (RESOLVED — two paths, both very rare):**
  1. **Crafted = the extreme tail of the §Q quality roll.** Famed is **not** a dedicated reforge recipe —
     it's the rarest possible *outcome* of `rollCraftQuality`, sitting **above Legendary (tier 5)**. Every
     qualifying equipment craft has a **vanishingly small** chance to roll Famed instead of its tier — so
     a Famed item is the once-in-a-colony jackpot of a master crafter, not something you can target.
     Reachability is skill/station-scaled (a master at a Manaforge has a *tiny* chance; a journeyman ≈ 0),
     mirroring how the Legendary long-tail already works — Famed just extends that tail one notch further.
  2. **Dropped by very high-level mobs** — bosses/minibosses (NOTES "boss variants") can drop a Famed item
     (the only way to get one *without* a master crafter, and the reward for clearing a hard lair/boss).

### I.1 Implementation checklist

- [ ] `famed` tier in rarities.jsonc; `famed`/`famedName`/`famedHistory`/`famedEnchants` on `ItemInstance`.
- [ ] `core/famedNames.ts` — procedural name + history generator (reuse race-lore generator style).
- [ ] **`rollCraftQuality` gains a Famed tail** above tier 5 — a vanishingly small, skill/station-scaled chance; `jobs/craft.ts` stamps Famed (rolls name/history/enchants/stat-explosion) when it hits.
- [ ] Stat-explosion application: ×2–5 per quality-relevant stat, layered over §Q `scaleWeaponQuality`/`scaleArmorQuality`.
- [ ] Famed `grantsConditions` = 1–3 rolled magical/on-hit conditions; surfaces in item card + combat.
- [ ] **Boss-drop hook** — high-level mob loot can roll a Famed item; display in `getItemDisplayName` (the generated name overrides the quality prefix).
- [ ] Tests: deterministic-seed famed roll (tail rarity), stat-explosion bounds, enchant resolution, name/history non-empty.

---

## Cross-Spec Dependencies

| This chapter | Hard blocker | Benefits from | Feeds forward |
| ------------ | ------------ | ------------- | ------------- |
| §B Workstations | — | tool-sacrifice pattern (done) | every other chapter's stations |
| §C Walls | §B masonry; metal chain | §L roads (shared crushed_stone) | base defence (§H) |
| §D Resin/Glue | tree yields | §G alchemy (boiling) | composite tools, §F assembly, §I reforge |
| §E Hide/Leather | **ENTITIES B** (carcass yields) | §B buckets; §G tannin | §F armour, furniture, §I backing |
| §F Armour | §E leather; encumbrance (done) | §M rings (done); §G potions; §L logistics; SOCIAL prestige | combat depth |
| §G Alchemy | §B alchemy_lab | §F farming herbs; §M conditions (done) | potions, dyes, glue, fertiliser |
| §H Defence | §C materials | §M elemental (done); RANGED cover | raid survival |
| §I Famed | §Q quality (done); conditions (done) | §B Manaforge; boss roster (NOTES) | end-game chase |

**Not duplicated here (cross-linked):** §F farming/food/brewing and §L logistics live in
[PRODUCTION-CHAIN-II](PRODUCTION-CHAIN-II.md); husbandry/wool *source* + carcass-yield Phase B live in
[ENTITIES_SPAWNING](ENTITIES_SPAWNING.md); prestige *effect* lives in
[SOCIAL-LAYER](SOCIAL-LAYER.md); farming/terraform world notes in [NOTES](../game/NOTES.md).

---

## Implementation Order (suggested)

**Skateboard→bike rule:** each step ships green (`pnpm check` + `pnpm test`), data in
`items/buildings/recipes/creatures/conditions/rarities.jsonc` (logic in services), new ADR only for a
non-obvious mechanic. Ordered by ROI + unblocking:

1. **§E carcass yields + §B carpenter_bench/buckets** — closes the biggest open data gap (new creatures
   drop nothing useful) and unlocks the leather/furniture economies. Highest ROI.
2. **§D resin + bone glue** — small, cross-cuts every assembly recipe; do alongside §B.
3. **§C wall ladder** (C1→C2→C3) — the most-requested visible gap; C3 establishes the ×2+gem-dust template.
4. **§F armour breadth** (chain → plate → beast/bone) + the `prestige` field — rides §E.
5. **§G alchemy_lab + potions** — rides the condition pipeline; feeds §F/§I.
6. **§B.3 infused station variants** — the universal capstone tier (after gem-dust exists from §C/§I).
7. **§H defence** — after §C materials + §M elemental.
8. **§I Famed items** — the end-game capstone; last, needs §B Manaforge + boss hooks.

---

## Open Questions

- [x] **Bucket model** — RESOLVED: crafted at carpenter_bench → **built as a placed passive FURNACE that burns `tanning_brine` as fuel** (reuses `maxFuel`/`fuelConsumptionRate`/`fuelRequirements` wholesale); brine is brewed in a separate passive `wooden_barrel`. See §B.2.
- [ ] **Resin gather model:** secondary woodcutting yield vs a dedicated tap-station on resinous trees? (lean: low-rate secondary yield now, tap-station later.)
- [x] **Gem-dust economy** — RESOLVED: **infused gems only** grind to `gem_dust`; normal cut gems stay trade goods (+ a future, unplanned art/decoration pigment sink). See "Gem-dust source" in §C.1.
- [x] **Famed promotion** — RESOLVED: **both**, both very rare — crafted as the extreme tail of the §Q quality roll (above Legendary, skill/station-scaled, immensely rare; *not* a targetable reforge recipe), and dropped by very high-level mobs/bosses. See §I.
- [x] **Famed vs §Q stacking** — RESOLVED: Famed is its **own top tier above tier 5** (a crafted Famed comes *from* the quality roll, so it has no separate lower tier); the ×2–5 stat-explosion multiplies the item's definition (quality-relevant) stats directly.
- [ ] **Prestige stat home:** `Item.prestige` flat field vs derived from material+quality+enchants? (SOCIAL-LAYER decides; capture either way.)
- [ ] **Wall HP/siege:** do magic walls need a `magicResistance` damage axis, or just higher HP/beauty? (defer until mobs-attack-buildings lands — NOTES.)
- [ ] **Stationary-weapon manning:** auto-fire unmanned (trap-style) vs requires a crewing pawn? (lean: auto-fire with a range/cadence cap, like turrets.)
