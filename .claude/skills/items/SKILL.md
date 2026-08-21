---
name: items
description: Author, name, re-tier or audit any Fantasia4x item — armour, weapon, tool, garment, material or intermediate. Use BEFORE adding or editing an entry in items.jsonc / recipes.jsonc, before naming or renaming a piece, when deciding what tier or age something belongs in, and for any "audit the armour / is this item nonsense / why is this in the wrong age" request.
---

# Authoring and auditing items

`docs/game/ITEM-RULES.md` is the ordered gate list and stays the source of truth. This skill is the
part that keeps getting forgotten: **what the tests do NOT catch, how to name a thing, and the audit
loop to run afterwards.** Read the gate list, then this.

## The five mistakes that keep happening

Every one of these shipped, passed every test, and was caught by the user reading the tables.

### 1. A tier that the materials cannot reach

An item's tier is a **promise that a colony at that age can build it**. It is broken by ingredients,
not by the item's own recipe. Follow every ingredient back to the raw source and look at the
**stations** on the way:

- `padded_cap` — tier 0, needed `linen_cloth` ← `thread` ← the **spinning wheel**, a bronze-age
  building. A stone-age hide set whose head piece needed a bronze workshop.
- the whole bronze `boarhide` line — hung off `hardened_boarhide`, made at the **iron-age**
  `beast_tanning_bucket`.
- `arcane_robe` — tier 2, woven on the **runed** `runic_loom` from gem dust.

**R4 in `itemRules.test.ts` now checks this.** Buildings carry `ageTier` ("bronze:1"), so the chain is
priced in ages. `R4_DEBT` names pre-existing offenders that are waiting on a design decision (the
whole caster staff line is in there) and may only ever SHRINK — a **new** item never joins it.

### 2. A fastener listed that nobody would count

**The material is the cost. The thread is not.** Every armour recipe used to pay a unit of cordage or
thread on top of its real material, which meant hauling and stockpiling bookkeeping — and nobody sews
leather with rope. A fastener earns a line only when it is:

- **the structure** — withies lashed into a wicker shell, bark tied onto a foot; or
- **a countable manufactured part** — rivets, nails, mail rings, enchanted thread.

Sewing sinew and thread come off the same animal or the same fibre the piece is cut from, so they are
not listed. Where stripping one emptied a recipe, the lacing is cut from the material itself: the
piece takes one more unit of its own hide. **R6 enforces this.**

### 3. A process step invented instead of a better source

**A material chain earns its length from the animal, never from extra processing.** The canonical
leather chain is already three waits:

```
kill → butcher (raw hide) → flesh → cure (hide rack, passive) → tan (tanning bucket, passive) → craft
```

That is the whole ladder. A fourth "harden / boil / temper / refine" step on top is padding — it
makes the player wait longer for the same animal. **A better hide comes from a bigger beast**: boar →
direboar, wolf → dire wolf, bear → cave bear. If a tier needs stronger leather, source it from a
harder creature and give that creature its own hide item; do not add a station step.

`hardened_boarhide` was exactly this and was deleted; everything that used it takes plain `boarhide`.

### 4. A name that claims a material the recipe does not contain

**Read the RECIPE before you write the name — never the old description.** "Oiled Leather Cloak" was
named off a description that said "oiled leather"; the recipe is leather and cordage, and there is no
oil in the game. Same shape: an "Antler War Club" carved from large bones, a "Bronze Punch Dagger"
cast from a copper bar, "Rune-Woven" gloves with nothing runic in them.

**R5 in `itemRules.test.ts` now checks this** against the item's FULL transitive chain (so
"Hippogriff-Feather Boots" pass — the leather is tanned from a hide named "Feathered Hide"). When it
fires, decide which half is wrong: usually the name is right and the recipe is the mistake.

### 5. A name that claims more than the item is

The name sets the item's rank before any number does.

- **An archetypal name claims THE defining item of its kind** — "Arcane Robe", "Assassin's Blade",
  "Warlord's Plate". A name like that must sit at the **top of its line**, in the last age it could
  belong to. If the item is a mid-tier piece, it does not get the archetype; it gets its material:
  Silk Robe, Wool Robe, Quilted Linen Jack.
- **Otherwise: material or creature + construction.** "Rawhide Arm-Wraps", "Iron-Bossed Kite Shield",
  "Rune-Woven Robe". Never a process ("Boiled Leather Bracers") and never a stat.
- **A species in the name means that species in the recipe** (R3 enforces it). A `category:leather`
  slot takes the cheapest thing in the pool, so it can only carry a generic name.
- **The tier must read in the name.** Tier 0 uses crude, historically real terms — "Hide Cap", "Hide
  Foot-Wraps" — never a word that could belong to a later age.
- **Player-facing strings carry no dev jargon.** No "Solid Tier 1 defence", no ADR or spec refs. Say
  what the thing IS in the world and let the player infer the value.

**Moving an item up an age leaves a hole. Patch it in the same pass** — the build that wore it still
needs something at the age you took it from, and that replacement is the one that gets the plain
material name.

## Before you add anything

- [ ] **Fill a real gap, and the earliest one.** No new alternative for a slot while another slot in
      the same tier is empty. Check the build × age grid at `/gear-db` (or the packed artifact).
- [ ] **Earlier ages are deliberately thinner.** That is not a bug to fix: it stops the player sinking
      resources into gear that is about to be deprecated, it gives copper and bronze something real to
      deliver, and it eases the player into the system. Primitive additions must be crude, cheap and
      measurably better than nothing — sackcloth, bark, plain hide. The **first** backpacks, cloaks,
      torso layering and set diversity belong to copper/bronze, not to the stone age.
- [ ] **Generic before thematic.** A tier's plain material-named line must be complete before any
      creature-derived alternative for the same slot. Boss tier is the exception and must be thematic.
- [ ] **Only fields the sim reads.** `defense`, `covers`, `weightKg`, `movementPenalty`,
      `fatiguePerTurn`, `coldResistance`/`heatResistance`, `stealthMod`, `maxDurability`, the shield
      block. `slashResistance`/`pierceResistance`/`crushResistance` are dead — `mitigationAt` never
      reads them. **`magicResistance` is dead too**: nothing outside `gearDb` reads it, so an item
      cannot be justified by it.
- [ ] **A stable kebab-case `id`, an explicit `tier`.** A missing tier is not "unset" — `gearDb.ageOf`
      reads `tier ?? 0` and files the piece into the stone age.
- [ ] **Ladder pieces carry `armorSet`.** No set = a one-off that can never fill a tier's cell.

## The audit loop — run all of it

```bash
npx vitest run src/tests/game/database/itemRules.test.ts \
                src/tests/game/database/armourCoverage.test.ts \
                src/tests/game/database/gearSorting.test.ts \
                src/tests/game/services/armourChain.test.ts
npx svelte-check --tsconfig ./tsconfig.json      # `pnpm check`
```

What each layer actually covers, so you know what is still on you:

| layer | catches | blind to |
| --- | --- | --- |
| `itemRules` R1–R5 | missing tier; creature out of reach; species-name lie; station out of reach; **material-name lie** | balance, naming rank, whether the item should exist |
| `armourCoverage` | no recipe, bad slot, an age that cannot dress a pawn | anything about tier or material |
| `armourChain` | queues, crafts, equips — wearables only | **shields and off-hand pieces are excluded** |
| `/gear-db` grid | build × age holes, borrowed fallbacks, set grouping | nothing is asserted; you have to look |

Then **prove it with pawns** — the `headless` skill. A new item is not done until a pawn has crafted
and equipped it over real ticks, and you have stated the delta:
`800 ticks, oak_plank 20→18, offHand=plank_round_shield`.

## Publishing the gear tables

The `/gear-db` route is live for you; the shared table is a **packed snapshot** and does not update
itself. After any item, recipe or gearDb change:

```bash
node scripts/dev-tools/pack.mjs geardb     # bakes the .jsonc data into .devtools-dist/gear-db.html
```

Then republish that file with the Artifact tool, passing the URL in
`scripts/dev-tools/published.json` as `url` so the link stays stable. Publishing without it mints a
new artifact and the user's link goes stale.

## Finishing

- Tick the row in `docs/tasks/open/AUDIT.md` with the mechanism and delta.
- Update `docs/game/ITEM-RULES.md` if a **rule** changed — not merely because items changed.
