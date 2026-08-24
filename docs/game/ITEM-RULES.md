# Item Rules — what an armour or weapon must satisfy before it exists

> **Related:** [DESIGN.md](DESIGN.md) · [DECISIONS.md](DECISIONS.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [../tasks/open/AUDIT.md](../tasks/open/AUDIT.md) · [../tasks/open/CONTAINERS-AND-FLUIDS.md](../tasks/open/CONTAINERS-AND-FLUIDS.md)

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
- [ ] the **binding that holds it together** — a sewn piece names it. Leather and hide take `sinew`,
      cloth takes `thread`, runed work takes `enchant_thread`, and the quantity is in step with the
      size of the piece (1 for a cap or a glove, 2 for greaves or a cloak, 3 for a torso). **A stone-age
      piece takes sinew, never thread** — thread is spun at a bronze-age wheel, and R4 will fail a
      tier-0 garment that waits on one.
      **This rule used to say the opposite** and its reason was that listing a fastener "made the player
      stockpile bookkeeping". That was true when one cordage weighed 200 g and one nail weighed 200 g:
      a fastener really was a heavy, annoying thing to haul. Once the unit was corrected (a nail is
      10 g, a bar draws to 300) the objection vanished, and what the ban had left behind was a hide cap
      made of two hides and nothing else — 122 pieces with no binding at all. **A rule outlives its
      reason quietly; check the reason still holds before enforcing it.**
- [ ] **A seam slot names `category:binding`, never one material.** A cured hood does not become
      impossible to craft because the colony has linen thread and no sinew. The pool is `sinew`,
      `thread`, `cotton_thread` and `enchant_thread`, all **50 g a unit** — the moment one of them is
      four times the others every recipe that uses it is silently wrong, which is what
      `enchant_thread` at 0.2 kg did to the whole rune-woven line (a glove was 67% thread by mass).
      The exception is a piece whose NAME claims the material: a Rune-Woven Robe is woven *with*
      enchanted thread, so it names it, exactly as a species-named piece demands its species.
- [ ] **Raw sinew is not thread.** What comes off a carcass is a wet tendon; it is dried hard and
      shredded before anyone sews with it. Butchery yields `raw_sinew`, the drying rack turns 3 into
      2 `sinew`. Wool needed the same correction — a fibre reaches the loom or the needle *processed*,
      never raw.
- [ ] **One law for every fastening, and it is about MASS: ~8% of what it holds together.** Nails and
      seams failed identically — a nail was 0.2 kg so a 3 kg chest carried 1.2 kg of them, and a seam
      came off a hand-written size table so a cap took one unit and an 18 kg plate took three. **In
      both cases the COUNT looked plausible and the MASS was nonsense, and nothing was checking the
      mass.** **R16** checks it for both families, with a wide band (a third of the product) so it
      catches order-of-magnitude errors rather than dictating balance. Mail rings and a bow's sinew
      backing are exempt: those ARE the piece, not what fastens it.
- [ ] **SIZE PROPAGATES DOWN THE CHAIN — every pool prices its members, not just binding.** A
      `category:` slot takes the cheapest member for a full unit, so `category:leather: 3` bought a
      jerkin with three scraps of coney fur. The leather pool spans **36x** (0.08 kg vermin hide to
      2.86 kg mammoth) and the cured-hide pool 34x. Each member's `craftValue` is its weight over the
      pool's MEDIAN, so a typical hide is still worth exactly 1 and existing counts keep their meaning
      — what changes is that **a mammoth hide goes five times as far as a rabbit's**, which is the
      whole point of hunting something big. **R17** fails any pool spanning more than 1.5x in size that
      ships priced flat.
      **Price an item against the pool it is DRAWN through, not its raw `category`.** Planks carry
      `category: wood` alongside logs, so pricing them there measured a 2 kg plank against a 3 kg log
      and made every plank worth 0.67. Planks are drawn via `category:plank`; that is the pool that
      sets their value.
- [ ] **A cast piece consumes the MELT, not a bar.** `cast_*_bar` already poured molten metal into a
      mould while the item recipes at the same hearth took a bar plus a mould and did the melt
      invisibly — same station, same operation, two different models. All 20 now take the melt.
      **Iron and steel keep their bars**: no pre-industrial hearth melts iron, which is why the anvil
      line is forged and unchanged. That is where smelting touches armour — upstream, in the bar, not
      in the piece.
- [ ] **A category pool prices its members by what they cost to HAVE (`craftValue`).** A `category:`
      slot takes whatever is cheapest to hand, which is fair only when the members cost the same to
      produce. They rarely do: cordage is plaited at a craft spot on turn one, sinew needs a carcass
      and a drying rack, thread a bronze-age wheel, enchant-thread five steps ending at a runed loom.
      Priced one-for-one the cheapest always wins **and the slot is free** — a hide hood costing "1
      binding" cost one cord.
      A crude material is worth a FRACTION of a unit, so the recipe consumes more of it. A seam is
      **4 cordage, 2 sinew, or 1 thread**: same job, same finished piece, honest difference in effort.
      Set it once on the material; a single recipe that values something differently can override with
      `costFactor` on its dynamic slot. **R17** fails a mixed-age pool that ships unpriced.
- [ ] **A missing material is not a licence to reach for any material.** When a piece has no binding,
      the answer is the binding it would actually be made with — not whatever the pool happens to
      contain. Hide caps, gloves and boots were fastened with **8 bronze nails**; their own siblings
      (bracers, greaves, jerkin) were stitched. Nails and rivets belong on plate, splint, shields,
      packs, belts and boxes; a cap is sewn.
- [ ] **Everything you fasten with is the same size of thing — 50 g.** Seams and lashings do different
      jobs, but if their units differ then "1x" means two different amounts depending which one an
      author reaches for. `cordage` was **0.2 kg and cost five gathers of fibre**, so it was four times
      the effort of a sinew for the same job, and 31 of its 48 recipes asked for exactly one. The unit
      is split four ways (`make_cordage` yields 4 from the same 5 fibre) and every count multiplied to
      match: **identical mass everywhere, four times the granularity.** R16 checks both the unit sizes
      and the cost of one cordage against its fibre.
- [ ] **Everything you fasten with is the same size of thing — 50 g.** Seams and lashings do different
      jobs, but if their units differ then "1x" means two different amounts depending which one an
      author reaches for. `cordage` was **0.2 kg and cost five gathers of fibre**, four times the
      effort of a sinew for the same job, and 31 of its 48 recipes asked for exactly one. The unit is
      split four ways (`make_cordage` yields 4 from the same 5 fibre) and every count multiplied to
      match: **identical mass everywhere, four times the granularity.** R16 checks the unit sizes and
      the fibre cost of one cordage.
- [ ] **The binding pool must reach back to the FIRST AGE.** A stone-age colony laces hide with plaited
      cord at a craft spot on turn one. When cordage was 0.2 kg it was rope and rightly excluded from
      seams — but shrinking its unit to 50 g made it a thong, and the exclusion should have gone with
      it. It did not, which left the whole primitive hide line waiting on butchery *plus* a drying rack
      for sinew. **Cordage is in the pool; `rope` at 1.1 kg is not, because that is still rope.**
      Second time in one pass that a rule outlived the number it was written for: when you change a
      unit, re-read every rule that mentions the material.
- [ ] **You still do not sew leather with ROPE.** Rope is a lashing, not a seam — it belongs only
      where it IS the structure (withies lashed into a shell, bark tied to a foot). Rivets, nails and
      mail rings stay as countable manufactured parts. R6 enforces both halves;
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
- [ ] **A `category:` slot is priced from the pool the SIM would consume**, not from every item
      carrying that category. A piece's `category` doubles as its armour CLASS, so 61 leather
      garments sat inside `category:leather`; taking the cheapest of those (all made at a primitive
      bench) made leather read *primitive*, when a tanned leather comes back through `tanning_brine`
      to the **bronze-age** Steeping Vat. `chainAge` now filters the pool through the sim's own
      `itemMatchesCostCategory`. **Leather is a bronze material: no tier-0 item may require it** —
      the stone age gets cured hide.
- [ ] Every ingredient resolves to something obtainable: a map-node yield, a butchery product, or
      another recipe. Nothing dead-ends.
- [ ] **The item itself has a way IN.** A recipe is one of six: a map node, a carcass, a natural
      weapon, enemy loot, decay/drying, or a caravan. R8 checks it.
- [ ] **A caravan counts as a source, and the SIM decides that — not a flag.**
      `KingdomService.generateCaravanStock` filters the whole item DB through `isTradeableDef`, capped
      by the colony's wealth tier and the sending kingdom's, so most of the database is already
      purchasable without anyone listing it. R8 asks that same predicate rather than trusting a
      marker on the item. **A caravan never carries fresh food** — anything with `decaySeconds` (or
      rot) will not survive weeks on the road — so a perishable with no other source is genuinely
      unobtainable and belongs in `R8_DEBT`, named with the feature it waits on.

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
- [ ] **MATERIAL, then item type.** That is the shape: `Fireclay Crucible`, `Iron-Ringed Belt`,
      `Steel Plate Cuirass`. A **type word must never do the qualifier's job** — "Crucible Steelworks"
      used a vessel type where the material belongs and became `Fire-brick Steelworks`, which is what
      its 24 fire bricks say. `Runic Crucible` was already right. The same slip is what made
      `iron_bar` read "Bloomery Iron" (a furnace, not a material) while every other bar in the game is
      `<Metal> Bar`.
      **The one exception is a family distinguished by process rather than material**: the steel grades
      (Bloom, Blister, Shear, Crucible, Mild, Pattern-Welded Steel) are all steel, so there is no
      material to name and the process is the only axis that separates them. Those are real
      metallurgical grade names and stay.
- [ ] **The plainest accurate word wins.** This is not a ban on period vocabulary: `greaves`,
      `bracers`, `cuirass`, `coif` and `jerkin` are the genre's shared language, used across dozens of
      pieces, learned once, with no plain synonym that says the same thing. What is banned is the
      **one-off antique in a slot an ordinary word already covers** — a *scrip* is a pouch, a *girdle*
      is a belt, a *snapsack* is a satchel, a *withy* frame is a bent-wood frame. Reaching for the
      old word there costs the reader comprehension and buys nothing, and it reads as decoration
      rather than as a thing in the world. The same holds inside a DESCRIPTION: name the part
      ("the mouth of the scabbard"), not the saddler's term for it ("the locket"). **R13** carries the
      running list; add to it whenever one of these gets caught.

## Gate 3b — carry aid, vessel or fixture: which one is it?

Three different things wore the word "container" until CONTAINERS-AND-FLUIDS split them, and an item
is **exactly one** of them. Getting this wrong is how a wicker frame and a quiver ended up meaning the
same thing to the sim while doing opposite jobs.

| kind | what it is | how it is authored |
| --- | --- | --- |
| carry aid | worn gear that raises what a pawn can shoulder | `inventoryBonus`, no `container` |
| vessel | an item that holds other items and is itself carried, hauled and stored | `container` |
| fixture | a placed building that stores | a building, not an item |

- [ ] **A vessel states what it holds and how much.** `container.capacityL` is the volume budget;
      `accepts` names item ids, categories, or the bare word `fluid` (empty = anything). A name that
      says "jug" and holds nothing is the same lie as armour claiming a material it does not use.
      R9 checks that every vessel states a positive `capacityL`.
- [ ] **A vessel's capacity is believable next to its own bulk.** A 50 L cask is not 6 kg empty. The
      def's `weightKg`/`volumeL` are the EMPTY vessel; contents ride on top everywhere a load is
      summed, so a full jug is heavier and bulkier than an empty one without any extra authoring.
- [ ] **Packs and frames do not gain nesting.** A rucksack that holds tracked item instances is a
      second inventory system and a UI nobody asked for. They stay carry aids.
- [ ] **A worn vessel holds nothing.** Anything a quiver is carrying moves into the pawn's pack the
      moment it goes on, and the quiver reverts to granting `inventoryBonus`. That is what keeps ammo
      in normal inventory, which is what the ranged draw-speed model reads.
- [ ] **A container ITEM and a storage BUILDING never share a noun.** An item you can pick up takes
      the bare vessel noun — Bucket, Barrel, Bin, Crate, Basket, Chest, Jug, Urn, Flask, Phial. A
      building you cannot takes a fitted place-name that says so — Larder Cupboard, Meat Hooks, Drying
      Rack, Rope-Hung Granary, Root Clamp. Three pairs used to collide and "put it in the chest" meant
      two different things depending on the panel. **R11** checks both halves — every building that
      STORES or holds FLUID, and any building name that is a word-for-word copy of an item's. A basket
      you WEAR is a Carry-Basket — a carry aid is not a vessel, and must not take its bare noun.
      **Pit, vat, trough, rack, larder and granary are a fixture's vocabulary**: they name no item and
      never will, because they are fixed by definition. That is why the tanning buckets became Tanning
      Pits and the brewing barrel a Steeping Vat.
- [ ] **Never restrict a worn quiver to arrows.** It was tried and rejected: a hunter stuffs whatever
      they like down a hide tube, and a container that physically refuses a bundle of herbs is not
      realism, it is bookkeeping. Leave `accepts` off.

## Gate 3d — light, medium or heavy: the class every worn or held piece answers to

The weight class is not an armour field any more. Armour, worn carry aids and weapons all sit on the
same light→medium→heavy axis, so a loadout can be read as one decision instead of a piece at a time.

- [ ] **Armour and carry aids AUTHOR the class** in `armorProperties.armorType`. For armour the recipe's
      metal-to-leather ratio decides it (above); for a carry aid it is the design axis itself — a
      satchel costs nothing to wear and holds little, a frame pack takes the biggest load and charges
      movement and fatigue for it.
- [ ] **Weapons DERIVE it** from mass and grip (`gearClassOf` in `core/gearClass.ts`). 125 weapons
      already state a `weightKg` and whether they need both hands; a hand-typed label over that many
      rows drifts the moment one number moves.
- [ ] **Regalia has no class and needs none** — a ring is not a light/medium/heavy choice.
- [ ] **A worn carry aid grants VOLUME, never weight.** Weight capacity is the body's —
      `(11 + 0.19 x brawn) x frameFactor` — and nothing strapped on changes how much mass a pawn can
      bear. A pack that raised it was quietly claiming a rucksack makes you stronger; what a pack
      actually does is give bulk somewhere to ride. **The one exception is a load carried IN HAND that
      puts its weight on the ground**: a barrow, a handcart. Those genuinely raise what one person can
      move, and they cost a hand to do it. This is also what keeps the wheeled line necessary — dense
      goods (bars, ore) bind on WEIGHT, which no pack will ever help with, while bulky goods (timber,
      pelts, food) bind on VOLUME. **R14** enforces it.
- [ ] **A belt never out-holds the crudest backpack.** A belt is a small load that costs nothing and
      stays on while a quiver owns the back; a pack is where bulk goes. R12 pins the ceiling to the
      smallest pack in the game rather than a typed number, so the two ladders cannot drift past each
      other unnoticed.
- [ ] **The class is a PRICE, and it must buy something.** Inside one slot at one age, a heavier class
      costs strictly more to wear and returns strictly more carry *or* more protection. **R12** checks
      it. Quivers sit outside the ordering: their job is draw speed and their capacity is incidental.
- [ ] **A belt is worn on a waist.** A pack is where a load goes; a belt holds a pouch. Once a belt
      out-carries the pawn's own body budget it has stopped being a belt, and R12 fails it above 10 kg.
- [ ] **The pack ladder is three classes per age from the leather unlock upward**, because that is
      where real bags become possible. Primitive gets the wicker backframe and nothing else.

## Gate 3c — is it a fluid, and can it exist?

`type: 'fluid'` is a TYPE and not merely a category, precisely so the sim can refuse one
structurally: a fluid may only exist inside a vessel that accepts it, and anything that would place
one loose — a stockpile tile, a pawn's bare hands, a `DroppedItem` — spills it and it is gone.

- [ ] **Is it actually pourable?** Tallow is a block of set fat, not a fluid; ale, brine, oil, ink and
      every potion and weapon coating are. Realism decides this, not convenience.
- [ ] **A fluid is measured in litres, and its `volumeL` is one MEASURE.** Recipes, loot and craft
      outputs all count in those measures (`"water": 1` is a litre because water's `volumeL` is 1;
      `"potion_of_might": 1` is 0.3 L because that is a phial). `weightKg / volumeL` is its density.
- [ ] **A fluid never appears as a recipe output that is not captured into a vessel.** It is poured
      into the station's own body when the station states a `fluidCapacityL` (a steeping vat, a
      brewing cask) or into a vessel with room standing on the station tile. Nothing catches it, it
      is lost — and the log says so. R10 checks that every fluid-output recipe has one or the other.
- [ ] **A vessel is not a loophole in the world.** One rule covers every process that acts on an idle
      stack: an OPEN vessel is transparent to it, a SEALED one shuts it out. Berries in a bucket rot as
      fast as berries on the ground; fibre cures into hay in a slatted crate and not in a bunged cask.
      Weather wear needs no rule — a vessel is destroyed whole and its contents go with it. If you add
      a new per-stack process, it goes through the same gate or a container becomes the place players
      put things to stop time.
- [ ] **A fluid states what MATERIAL is allowed to hold it.** The allow-list used to run one way only
      — a vessel said what it accepted — so a leather waterskin declaring `accepts: ['fluid']` would
      take molten copper at 1085C, and a container with no list at all took anything. Now every vessel
      says what it is made of (`container.material`: wood, leather, hide, clay, fireclay, porcelain,
      glass, wicker, stone, metal) and a fluid names the materials that may hold it (`heldBy`).
      Omitted = ordinary, any fluid vessel will do. **Name materials, never an invented tag** — the
      entry then reads as the physical fact it is, and the reason a waterskin is refused is simply that
      leather is not on the list.
      **Molten metal is `["fireclay", "runed"]`**, because ordinary fired earthenware, wood, glass and
      leather all fail at those temperatures and a crucible is refractory clay. The **Crucible**
      (fireclay, fired at the Fire-brick Kiln) is the mundane answer and the reason `fire_clay` is more
      than a brick ingredient; the **Rune-Sealed Flask** is the runed one that holds anything.
- [ ] **The runed vessel belongs in every restricted list.** A magically bound vessel is the universal
      answer by design, so `"runed"` appears in each `heldBy` — that is the age buying its way out of
      the material problem, not an oversight.
- [ ] **Read the restriction off the fluid's own description.** `caustic_bile` already said it "eats at
      leather and skin alike"; `beast_brine` said it is "hot enough to bite into thick beast hide". The
      data was describing a rule nothing enforced. When a fluid's own prose says what it destroys, that
      is the `heldBy` list waiting to be written down. Restricted today: the six melts, the caustic
      line (bile + 3 coatings), `beast_brine` and `distilled_spirit`. Everything else — water, the ales,
      all 39 potions, the venom and dread coatings — is ordinary and needs nothing.
- [ ] **A clay recipe asks for `category:clay`,** not `blue_clay`, so a potter reaches for whatever clay
      is to hand and fire clay is a real alternative rather than a dead-end brick material.
      **R15** checks all of it: every vessel declares a material, `heldBy` names only real material
      words, no wrong-material vessel accepts the fluid, and a fluid nothing can carry is only ever
      asked for at a station that already holds it — otherwise the order can never be supplied.
- [ ] **A fluid needs a way in like anything else (R8)** — and its way in is usually a vessel plus a
      source, not a node. Water comes from a drink zone or a well; the brews come out of a cask.

## Gate 3e — an item weighs what its recipe put into it

A crafted item's `weightKg` is not a number picked to feel right. It is **derived from the mass of its
ingredients**, the same way an armour class is derived from its metal-to-leather ratio rather than
authored. Getting this wrong is invisible: a carrying basket woven from 15 branches and 10 cordage —
6.5 kg of stock — shipped weighing 0.5 kg, which is less than the cord alone.

**Retention is per PROCESS.** One constant across every recipe is the trap: laying rope from cordage
wastes almost nothing, while weaving withies throws most of every rod away. The calibrated numbers:

| process | keeps | why |
| --- | --- | --- |
| laid fibre (cordage, rope) | **0.90** | the twist takes up a little length, nothing is discarded |
| textile (thread → cloth) | **0.92** | selvedge only |
| basketry / wattle (withy work) | **0.46** | both ends of every rod are trimmed, rejects never reach the weave |
| cut-and-sew (hide, cloth garments) | **0.75** | offcuts around the pattern |
| joinery / sawn timber | **0.72** | sawdust and end-trim |
| forging | **0.82** | scale and hammer-trim off the billet |
| assembly / hafting | **0.95** | parts are fitted, not consumed |
| spin / weave | **0.85** | selvedge trimmed off the edge; a cloth cannot outweigh its thread |
| cut-and-sew (garments) | **0.87** | offcuts around the pattern — a gambeson is ~20 layers, so it needs ~23 cloth, not 6 |
| flesh a hide | **0.83** | fat and membrane scraped off |
| **cure a hide** | **0.55** | this is DRYING and must be the biggest loss in the leather chain |
| tan | **0.85** | hide→leather, not counting the brine, which stays in the pit |
| curry | **1.10** | working tallow INTO leather adds mass |
| smelting, butchery, cooking, fine metalwork | **n/a** | these legitimately lose or gain mass; leave the authored weight |

- [ ] **A fastener is a small part, not a spike.** A nail is **10 g**, a rivet 12 g, a tack 8 g. At
      0.2 kg each they were railway spikes, which is why every recipe could only ask for two or three
      before the fastener outweighed the thing — a 0.7 kg belt was 57% buckle-metal. A 4 kg bar draws
      out to ~300 nails; a chest takes 25, a bin 72, a belt 6. **When a count looks absurdly low, check
      the UNIT before you touch the count.**
- [ ] **Every fibre is spun before it is woven.** Flax → thread, wool → yarn, cotton → cotton thread,
      silk reeled. Wool and cotton used to reach the loom as raw fleece and raw boll, which left the
      spinning wheel serving two recipes in the entire game. A loom takes yarn, never fleece.

- [ ] **Check the constant against something it should NOT move.** The basketry and laid-fibre numbers
      above are trustworthy because `wicker_frame` (0.8 → 0.81) and `cordage` (0.2 → 0.23) came out of
      unrelated recipes and barely moved. A retention that only ever confirms the item you tuned it on
      is fitted, not calibrated.
- [ ] **When the derived weight is ABSURD for the object, the RECIPE is the broken half.** This is the
      rule's real value — it tells you which side to fix. A ruby amulet deriving to 7 kg means
      `make_ruby_amulet` eating two gold bars is wrong, not that amulets are heavy. A war bow deriving
      to 0.09 kg means its recipe has no wooden stave in it. Wicker Vest → 4.8 kg and Wattle Buckler →
      0.74 kg are both recipe faults, not weight faults.
- [ ] **Nothing worn or held moves without checking the tier ladder and the laden line.** Equipped
      weight counts fully against the carry budget, an early pawn's is ~15.7 kg, and `laden` (which
      costs evasion and swing rate) starts at 60% of it. A single primitive piece that would put a pawn
      near that line on its own is wrong however honest its mass looks.

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
| 3 | a name saying hide is cut from hide, and leather from leather — over EVERY craftable, not just armour (R7) | `itemRules.test.ts` |
| 3 | a material in the name ⇒ that material in the chain (R5) | `itemRules.test.ts` |
| 2 | every item has a way in — recipe, node, carcass, loot, decay or trade (R8) | `itemRules.test.ts` |
| 3b | a vessel states a positive `capacityL`, and is not also a carry aid (R9) | `itemRules.test.ts` |
| 3c | every fluid-output recipe has a station or vessel to catch it (R10) | `itemRules.test.ts` |
| 3b | no noun is shared by a container item and a storage building (R11) | `itemRules.test.ts` |
| 3d | every weapon and worn carry aid resolves to a class, and a heavier class costs more and buys more (R12) | `itemRules.test.ts` |
| 3d | a worn carry aid grants volume only; weight comes from the body, and only a hand-hauled cart adds it (R14) | `itemRules.test.ts` |
| 3 | no one-off antique word where a plain one exists, in a name or a description (R13) | `itemRules.test.ts` |
| 3b | no branch of `/gear-db` claims a concept another branch already owns | by hand |
| 5 | no recipe-less armour; slots resolve | `armourCoverage.test.ts` |
| 5 | crafted and equipped by a real pawn | `armourChain.test.ts` |

Gates 1, 3 (tier-in-name) and 4 are judgement calls a test cannot make. Walk them by hand.
