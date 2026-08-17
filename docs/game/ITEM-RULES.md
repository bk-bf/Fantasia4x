# Item Rules — what an armour or weapon must satisfy before it exists

> **Related:** [DESIGN.md](DESIGN.md) · [DECISIONS.md](DECISIONS.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [../tasks/open/AUDIT.md](../tasks/open/AUDIT.md)

Walk this in order for every new piece. Each gate can kill the item outright, so do not skip ahead:
answering gate 4 for an item that fails gate 1 is wasted work. The machine-checkable subset is
enforced by `src/tests/game/database/itemRules.test.ts`.

## The ordering principle

**Generic before thematic.** A tier's plain, material-named line comes first and must be complete
before any alternative, flavoured or creature-derived version of the same slot is authored.

- A **generic** item is named for its material and pattern, and its recipe asks for a material
  *category*: Steel Plate Cuirass, Iron Pauldrons, Copper Scale Shirt. Any colony that reached the
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

## Gate 1 — does this item need to exist?

- [ ] It fills a **real gap**: a slot × tier × armour-class cell (or weapon role) with nothing in it.
      Check the gear-db build table, or run the coverage assertions in
      `src/tests/game/database/armourCoverage.test.ts`.
- [ ] If the cell is already filled, the new item is an **alternative**, which needs a stated reason
      to exist beyond "more content": a different economy (ore instead of hides), a different
      trade-off (lighter but wears out), or a different build. No reason ⇒ do not create it.
- [ ] No other cell in the same tier is empty. If one is, build that instead.

## Gate 2 — is it reachable at the tier it claims?

This is the gate `cave_bear_plate` fails, and the one that produces the worst kind of item: a piece
the player can see, whose materials they cannot get for another hundred turns.

- [ ] The item declares an explicit **`tier`**. A missing `tier` is not "unset", it reads as **0**
      everywhere (`gearDb`'s `ageOf` falls back to `tier ?? 0` ⇒ *Primitive*), so an untiered
      late-game piece silently files itself into the stone age.
- [ ] **Its tier is at least the tier of the hardest creature its recipe names.** Requiring
      `prime_cave_bear_hide` means the item cannot be below the Cave Bear's own tier (3). A
      `category:leather` or dynamic slot does **not** count here: it accepts the cheapest animal in
      the pool, so it gates nothing.
- [ ] Its tier is at least the era of the metal research the recipe requires
      (`copper_smelting` ⇒ 1, `bronze_working` ⇒ 1, `iron_working` ⇒ 2, `steel_making` ⇒ 3,
      `runic_inscription` ⇒ 4).
- [ ] Every ingredient resolves to something obtainable: a map-node yield, a butchery product, or
      another recipe. Nothing dead-ends.

## Gate 3 — does the name tell the truth?

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
      `maxDurability` and the shield block are live. **`slashResistance`, `pierceResistance` and
      `crushResistance` are NOT** — `mitigationAt` reads only `defense`, so authoring them promises
      the player something that does nothing. Do not differentiate an item with a dead field.
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
| 3 | species in the name ⇒ species in the recipe | `itemRules.test.ts` |
| 5 | no recipe-less armour; slots resolve | `armourCoverage.test.ts` |
| 5 | crafted and equipped by a real pawn | `armourChain.test.ts` |

Gates 1, 3 (tier-in-name) and 4 are judgement calls a test cannot make. Walk them by hand.
