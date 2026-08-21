# Item Rules — what an armour or weapon must satisfy before it exists

> **Related:** [DESIGN.md](DESIGN.md) · [DECISIONS.md](DECISIONS.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [../tasks/open/AUDIT.md](../tasks/open/AUDIT.md)

Walk this in order for every new piece. Each gate can kill the item outright, so do not skip ahead:
answering gate 4 for an item that fails gate 1 is wasted work. The machine-checkable subset is
enforced by `src/tests/game/database/itemRules.test.ts`.

## The ordering principle

**Generic before thematic.** A tier's plain, material-named line comes first and must be complete
before any alternative, flavoured or creature-derived version of the same slot is authored.

- A **generic** item is named for its material and pattern, and its recipe asks for a material
  *category*: Steel Plate Cuirass, Splint Bracers, Copper Scale Shirt. Any colony that reached the
  material can build it.
- A **thematic** item is named for a creature or a legend, and its recipe demands that specific
  creature's material: Cave-Bear Plate, Direwolf Warcloak.

Thematic items are **rewards for a specific hunt**, so each one is gated behind finding and killing a
particular animal. That makes them a poor way to fill a hole in a tier: the colony that needs a torso
piece cannot choose to go get one. Fill the tier generically first; add the thematic version later as
an *upgrade over* a piece the player already has.

**The one exception is Boss tier, which must be thematic.** A boss drop that was a generic steel
plate would be pointless. Boss-tier gear is expected to be named for the thing it came off, to demand
that thing's material, and to be strictly special rather than a rung on the ladder.

**Corollary — no premature alternatives.** A second item for a slot the tier already covers is not
progress while any *other* slot in that tier is still empty. Coverage before variety.

## The slot model

A slot exists only where the player has a real choice in it. Shoulder and neck slots were removed
because each only ever held one obvious piece per tier: they padded the item count without adding a
decision. Both are still hit locations, so the coverage moved rather than vanishing — the two rigid
torso layers reach the shoulders, and the head piece closes over the throat.

| slot | region | notes |
| --- | --- | --- |
| `head` | head, face, **neck** | one slot: helm **or** coif, never both. Crowns compete here too |
| `bodyOuter` | chest, abdomen, **shoulders** | plate, brigandine |
| `bodyMid` | chest, abdomen, **shoulders** | mail, scale, hardened leather |
| `bodyBase` | chest, abdomen | the skin layer: gambeson, doublet, robe |
| `bracers` | arms | |
| `greaves` | legs | |
| `gloves` | hands | |
| `boots` | feet | |
| `back` | — | the **garment**: cloak |
| `back2` | — | the **load**: pack, frame, quiver. Split from `back` so a cloak and a quiver coexist |
| `belt` | hips | pouches, bolt cases |

**A complete kit is SIX cells per class, not eight.** Each class owns exactly one torso layer:

- light → head, torso-**skin**, arms, hands, legs, feet
- medium → head, torso-**mid**, arms, hands, legs, feet
- heavy → head, torso-**outer**, arms, hands, legs, feet

A pawn stacks one of each to fill all three torso layers; that is the layering, not a gap. And heavy
starts at **iron** — plate before iron is not a missing cell, it is the no-heavy-before-iron rule.

**Every piece in a ladder set carries `armorSet`.** That is what makes six steel torso pieces legible:
`steel_plate` vs `munition_half_plate` vs a one-off. A deliberate one-off (boss drop, ceremonial,
thematic beast gear) carries **no** set and is excluded from the ladder — it can never be what fills a
tier's cell, because the player cannot choose to go get it.

## Armour composition — the class falls out of the recipe

**Do not author an armour class. Author a recipe, and let the ratio decide the class.** This is the
rule that makes weight, protection and build-fit agree with each other instead of being three numbers
someone picked.

| composition | class | reads as |
| --- | --- | --- |
| plant fabric / fur only, no metal, no rigid hide | **ultra-light** | mage, rogue, and the archer's inner layer |
| mostly hide-leather, little or no metal | **light** | skirmisher, duelist, scout |
| roughly 1 : 1 leather to metal | **medium** | the shield line, the workhorse kit |
| mostly metal over a leather backing | **heavy** | 2H, tank |

Read the ratio off the recipe's ingredient counts. A piece asking 4 leather + 1 bar is light; 2 + 2 is
medium; 1 + 4 is heavy. If the ratio and the declared `armorType` disagree, the ratio is right and the
label is wrong.

**One exception: flexible-metal construction.** Mail, scale and splint are `armorLayer: "mail"` and are
**medium by build**, whatever their metal share — a mail coif is nearly all iron and is still not plate.
The ratio governs `armorLayer: "plate"` composites, where metal share really does decide how rigid the
piece is. A munitions half-plate stays medium by carrying a real leather share, not a token lining.

**Ultra-light has its own chain and never touches metal.** Linen and cotton (flax/cotton → spinning
wheel → thread → weaving frame → cloth), silk, and animal fur/pelt. This is the mage and rogue supply
line, and it is deliberately separate from the hunt-and-tan leather line so the two compete for
different labour.

## A chain earns its length from the animal, not from a longer process

The leather line is already three waits before anyone crafts anything:

```
kill → butcher (raw hide) → flesh → cure (hide rack, passive) → tan (tanning bucket, passive) → craft
```

That is the whole ladder, and it is enough. A fourth "harden / boil / temper / refine" step on top of
a tanned leather does not make a better material, it makes the player wait longer for the same animal
— which is what `hardened_boarhide` did before it was deleted.

**A stronger hide comes from a bigger beast.** Boar → direboar, wolf → dire wolf, bear → cave bear.
When a tier needs better leather, give the harder creature its own hide item and let the hunt be the
gate. Adding a station step instead is padding, and it drags the item's age up with it (see gate 2).

## Recipes must cost what the piece is worth

A bronze-age bracer costing **1 cordage + 1 leather** is not a recipe, it is a placeholder. An armour
recipe states, at minimum:

- [ ] the **species material** it is cut from, by name, in a quantity that matches the piece's size
      (a cuirass is not one hide; a glove is);
- [ ] its **metal** component, if the class calls for one, in the ratio above;
- [ ] any **fitting that is a real component** — rivets, nails, mail rings, enchanted thread. A
      fastener is listed only when it is a countable manufactured part, or when it IS the structure
      (withies lashed into a shell, bark tied to a foot). **Sewing thread is never a line item**: you
      do not sew a jerkin with rope, and the sinew that closes a seam came off the same animal the
      piece was cut from. Listing it made the player stockpile bookkeeping. R6 enforces this;
- [ ] a `workAmount` in step with its neighbours.

## Species materials, and what the name must say

Gear is named for **the material or the creature it came off**, never for a process. "Wolf-Hide
Cloak", not "Boiled Leather Bracers" — nobody boils leather, and the phrase says nothing about what
the piece is or how good it is.

- [ ] The name carries the **specific creature**, not the species category. `wolf` spans Wolf Pup
      (creature tier 1) to Great Wolf (tier 5); a name that says only "wolf" throws away the tier
      information the player could otherwise read straight off the item.
- [ ] Different species give **different stats and suit different builds** — a boar hide is thick and
      slow, a jackal hide is thin and quiet. Species is a design axis, not a skin.
- [ ] A generic `category:leather` slot is only acceptable on a piece that genuinely does not care
      what died for it. Anything with a species in its name must **require that species**.

## Sets from Bronze onward

- [ ] Every build archetype has **its own set** from Bronze on. A tier that offers one medium kit and
      nothing else is not a progression, it is a single choice wearing four hats.
- [ ] **Heavy sets are deliberately incomplete.** A 2H or tank kit covers the torso, head and limbs it
      can and leaves the rest to be padded from the light/medium lines of the primitive and copper
      ages. That padding is the cost of wearing plate, and it is why the earlier lines stay relevant.
- [ ] **Archers get a dedicated set** from Bronze — the aim bonuses, the quiver and the light chain
      belong together rather than being scattered across three unrelated pieces.

## Setless armour is two different things

- [ ] **drop-only** — no recipe at all. Enemy gear off a corpse; the player can never plan for it, so
      it can never fill a tier's slot.
- [ ] **unaffiliated** — craftable, but belongs to no kit: a ceremonial piece, a regalia circlet, a
      thematic beast plate. A candidate for folding into a set later.

Lumping the two as "one-offs" hides the only distinction that matters: whether a colony can choose to
have it.

## Gate 1 — does this item need to exist?

- [ ] It fills a **real gap**: a slot × tier × armour-class cell (or weapon role) with nothing in it.
      Check the gear-db build table, or run the coverage assertions in
      `src/tests/game/database/armourCoverage.test.ts`.
- [ ] If the cell is already filled, the new item is an **alternative**, which needs a stated reason
      to exist beyond "more content": a different economy (ore instead of hides), a different
      trade-off (lighter but wears out), or a different build. No reason ⇒ do not create it.
- [ ] No other cell in the same tier is empty. If one is, build that instead.

## Gate 2 — is it reachable at the tier it claims?

The gate that produces the worst kind of item: a piece the player can see in the tables, whose
materials they cannot get for another hundred turns. `cave_bear_plate` failed it for a long time by
carrying no `tier` at all, which put a tier-3 bear's hide in the stone-age column.

- [ ] The item declares an explicit **`tier`**. A missing `tier` is not "unset", it reads as **0**
      everywhere (`gearDb`'s `ageOf` falls back to `tier ?? 0` ⇒ *Primitive*), so an untiered
      late-game piece silently files itself into the stone age. This is the single most common way an
      item ends up in the wrong section, and it is invisible: nothing errors, the piece just appears
      among the flint knives.
- [ ] **`researchRequired` is on the ITEM, not only on its recipe.** `ageOf` reads the item's field, so
      a recipe gated behind `attunement` whose item says nothing still displays as Primitive. Set both.
- [ ] **Its tier is at least the BAND of the hardest creature its recipe names.** Creature `tier` runs
      0–5, item `tier` runs 0–4, so the beast band is `creatureTier - 1`: requiring
      `prime_cave_bear_hide` (Cave Bear, creature tier 3) puts the item at item tier **2 or above**.
      A `category:leather` or dynamic slot does **not** count here: it accepts the cheapest animal in
      the pool, so it gates nothing.
- [ ] Its tier is at least the era of the metal research the recipe requires
      (`copper_smelting` ⇒ 1, `bronze_working` ⇒ 1, `iron_working` ⇒ 2, `steel_making` ⇒ 3,
      `runic_inscription` ⇒ 4).
- [ ] **Its tier is at least the age of the latest STATION anywhere in its ingredient chain.** Not its
      own station — the whole chain. `padded_cap` was a tier-0 piece of the stone-age hide set whose
      linen came back through `thread` to the **spinning wheel**, a bronze-age building; the entire
      bronze boarhide line hung off an **iron-age** tanning bucket. Buildings declare `ageTier`
      ("bronze:1"), so this is checkable and `itemRules.test.ts` R4 now checks it.
- [ ] Every ingredient resolves to something obtainable: a map-node yield, a butchery product, or
      another recipe. Nothing dead-ends.

## Gate 3 — does the name tell the truth?

- [ ] **An archetypal name claims THE defining item of its kind** — "Arcane Robe", "Assassin's
      Blade", "Warlord's Plate" — so it must sit at the **top of its line**, in the last age it could
      belong to. A mid-tier piece does not get the archetype; it gets its material: Silk Robe, Wool
      Robe, Quilted Linen Jack. `arcane_robe` sat at tier 2 while being woven on a runed loom, which
      is the same lie told twice.
- [ ] **Moving an item up an age leaves a hole — patch it in the same pass.** The build that wore it
      still needs something where it used to be, and that replacement is the one that takes the plain
      material name.
- [ ] **A MATERIAL in the name is a material the chain actually contains.** Read the recipe, not the
      old description: "Oiled Leather Cloak" was named off a description while its recipe was leather
      and cordage, and the game has no oil. `itemRules.test.ts` R5 checks this against the full
      transitive chain. When it fires the recipe is usually the half that is wrong.
- [ ] If the id or name carries a **species** (bear, wolf, boar, owlbear…), the recipe **requires
      that species' material**. Otherwise rename it after what it is actually made of.
- [ ] If the recipe takes **any** hide/leather/bone, the name must be generic: "Boiled Leather
      Bracers", not "Bear-Hide Bracers". A generic recipe with a specific name is the same lie in the
      other direction.
- [ ] A weapon may legitimately be named for its **quarry** rather than its material (a boar spear is
      a spear *for* boar). Say so in a `//` comment beside the entry so the next audit does not read
      it as a violation.
- [ ] The tier reads in the name: a tier-0 piece uses a crude, historically-real term ("Hide
      Foot-Wraps"), never a term that could belong to a later tier. See the naming rules in AGENTS.md.

## Gate 4 — is it physically and mechanically consistent?

- [ ] **Weight, defense and stiffness sit in the ladder** its neighbours already form. Compare
      against the same slot one tier down and one tier up, and against the same tier's other classes.
- [ ] **A full set is wearable** by the pawn who is supposed to wear it. Carry capacity is
      `(11 + 0.19 × brawn) × frameFactor`; `laden` starts at 60% of it. Sum the set and check.
- [ ] It only uses fields the sim actually **reads**. `defense`, `covers`, `weightKg`,
      `movementPenalty`, `fatiguePerTurn`, `coldResistance`/`heatResistance`, `stealthMod`,
      `maxDurability` and the shield block are live. **`slashResistance`, `pierceResistance`,
      `crushResistance` and `magicResistance` are NOT** — `mitigationAt` reads only `defense`, and
      nothing outside the `gearDb` dev tool reads `magicResistance`, so authoring them promises the
      player something that does nothing. Do not justify an item with a dead field.
- [ ] Armour class matches the construction: soft/flexible ⇒ `light`, rigid organic or flexible metal
      ⇒ `medium`, rigid metal plate ⇒ `heavy`. Class carries no combat effect on its own; the
      trade-off has to be real, and it lives in weight and `movementPenalty`.
- [ ] It is **anatomically and physically plausible** first, mechanically convenient second.

## Gate 5 — can a colony actually build and wear it?

- [ ] It has a **recipe**. Fifteen limb pieces once shipped without one, so shoulders, arms and legs
      were unprotectable in play while the combat probes force-equipped them and measured fine.
- [ ] `equipmentSlot` is a real `EquipmentSlot`, and `slot` agrees with it. A slot outside the union
      is stored under a key the mitigation walk never visits, so the piece soaks nothing.
- [ ] Station, `toolTierRequired` and `researchRequired` match the tier's peers.
- [ ] **Headless-verified**: a pawn crafts it over real ticks and equips it. State the delta.

## What the tests enforce

| Gate | Assertion | File |
| --- | --- | --- |
| 1 | every slot × age cell has a craftable piece | `armourCoverage.test.ts` |
| 2 | explicit `tier`; tier ≥ demanded creature's tier | `itemRules.test.ts` |
| 2 | tier ≥ the age of the latest station in the ingredient chain (R4) | `itemRules.test.ts` |
| 3 | species in the name ⇒ species in the recipe | `itemRules.test.ts` |
| 3 | a material in the name ⇒ that material in the chain (R5) | `itemRules.test.ts` |
| 5 | no recipe-less armour; slots resolve | `armourCoverage.test.ts` |
| 5 | crafted and equipped by a real pawn | `armourChain.test.ts` |

Gates 1, 3 (tier-in-name) and 4 are judgement calls a test cannot make. Walk them by hand.
