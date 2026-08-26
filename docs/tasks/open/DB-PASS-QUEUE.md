<!-- LOC cap: 120 (created: 2026-08-27) -->

# DB PASS QUEUE — five tasks split out of the 2026-08-26 workstation audit

> **Related:** [MECHANICAL-POWER](MECHANICAL-POWER.md) · [ITEM-RULES](../../game/ITEM-RULES.md) ·
> [ROADMAP](ROADMAP.md)

Each is handed to its own agent. Two produce a proposal for review rather than edits, because both
would rewrite recipes the player already depends on.

---

## T1 — Meals gain axes, not just bigger numbers

**Implement.** Every meal grants `well_fed` / `hearty_meal` / `nourished` / `fortified` / `feasted`,
which differ only in size. A dish should say what it is *for*.

Seven lines, each with its own condition ladder in `conditions.jsonc`: **nutrition**, **heat**,
**cold**, **health**, **preservation**, **combat**, **infection**. A condition earns its place only
by a modifier the sim already reads — `constitution` reaching `cold_resistance` is the worked example
(`stock_warmed`); a modifier nothing reads is decoration.

- [ ] Conditions authored, each with a modifier something reads
- [ ] Existing meals reassigned onto the lines; no line left with one member
- [ ] Headless: a pawn eats one dish per line and the condition lands

## T2 — Upper-rung dishes compose, and still bring something of their own

**Implement.** The Feast Platter consumes the rungs below it. That becomes the pattern for upper-rung
cooking — **but a composed dish must also take 1–2 ingredients no lower dish used.** A recipe that
only re-cooks earlier meals adds nothing and reads as filler.

- [ ] Upper cooking rungs take 1–2 lower dishes plus 1–2 ingredients of their own
- [ ] No composed dish is a pure re-cook
- [ ] Headless: the full chain cooks from raw stock through to the top dish

## T3 — Alchemy gated behind fermented fluids

**Implement.** `distilled_spirit` already gates some tier-2 brews, so the pattern exists and is
under-used. Wine, ale and spirit are the obvious solvents; decide per potion which needs which, and
say why in the PR note. This buys cross-progression: the brewing ladder starts mattering to the
alchemy ladder.

- [ ] Each gated potion names the fermented input its method actually needs
- [ ] Brewing rungs gain readers, so the ladder is worth climbing
- [ ] Headless: a gated potion refuses without the fluid and brews with it

## T4 — One soaking bin, and hafts for everything that needs one

**Propose first — the haft list comes back for review before any recipe is rewritten.**

`soaking_trough` and the two tanning pits are one idea wearing three names: nothing stops a tool haft
being soaked in a tanning pit. Merge them into a single soaking concept under a name that covers
tanning, curing and seasoning alike.

Then the expansion: **every iron-age-and-later tool haft, and every bow and staff, should pass through
it.** That is a weapons audit — many recipes currently skip the step or bind a head to a raw shaft.

- [ ] The three stations reconcile to one concept, named for all of what it does
- [ ] A table of every tool haft, bow and staff, what its recipe does now, what it should do
- [ ] **Stop there.** Do not rewrite the recipes.

## T5 — Steel Deck Oven and Runed Brewing Vat earn their build

**Propose only.** Both are top rungs that introduce no recipe, so the DB shows them empty. New items
go through the `items` skill gate first, so this returns a proposal, not data.

- [ ] 2–4 dishes for the Steel Deck Oven that only a sealed steel oven could bake
- [ ] 2–4 drinks for the Runed Brewing Vat that only a runed vat could ferment
- [ ] Each named, costed, and checked against the `items` gate list
- [ ] **Stop there.** Do not author the items.

---

## Also open, not queued

- The generic `effects.tier` maps to a `crafting` family in `LEGACY_LADDER`, so any tier-3 building
  supersedes any tier-1 one: a Clay Still can throw pots. Needs a decision, not a patch.
- The tailoring ladder jumps primitive:3 to iron:1 with no copper or bronze rung, which is why 37
  bronze garments sit on a primitive weaving frame.
