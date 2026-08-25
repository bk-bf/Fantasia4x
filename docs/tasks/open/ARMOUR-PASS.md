# Armour & Clothing Pass

> **Related:** [../../game/ITEM-RULES.md](../../game/ITEM-RULES.md) · [AUDIT.md](AUDIT.md) · [ROADMAP.md](ROADMAP.md) · [../../game/DESIGN.md](../../game/DESIGN.md)

Everything below was found by reading the gear tables, not by a test. Each section names the rule that
should have caught it, and adds that rule where one is missing — the point of the pass is that the
same class of thing cannot come back.

Order is dependency order: the **rules** land first, because they decide what "fixed" means for
everything after them.

## 1 — Bindings stop being a placeholder tax

Nearly every piece of armour pays a flat **1× cordage** or **1× thread**, whatever its size. A glove
and a cuirass are not lashed with the same amount of cord. `ITEM-RULES.md` already says this out loud
("a bronze-age bracer costing 1 cordage + 1 leather is not a recipe, it is a placeholder") and nothing
enforced it.

Worse, the ladder **goes backwards**: the copper scale line binds with spun `thread`, and the bronze
leather sets one age later fall back to `cordage`.

- [x] ~~Scale the binding with the piece~~ — **superseded.** Scaling it was still bookkeeping. A
      fastener is now listed ONLY when it is the structure (wicker, wattle, bark) or a countable
      manufactured part (rivets, nails, mail rings, enchanted thread).
- [x] **Sewing thread is not a line item.** 135 recipes dropped their sinew/thread/cordage; you do not
      sew a jerkin with rope, and the sinew closing a seam came off the animal the piece is cut from.
- [x] Where that emptied a recipe, the lacing is **cut from the same material** — one more unit of its
      own hide or planks, rather than a separate ingredient.
- [x] **R6** enforces it: no sewing thread on a garment, cordage only where something is lashed, and
      no recipe left costing nothing.

## 2 — The primitive line is rebuilt

Rawhide is the wrong first material: a hide goes stiff and rots unless it is cured, and "raw hide
armour" skips the two passive waits that make leather feel earned.

- [x] The stone age dresses in **sackcloth** (plant fibre / cordage) and **wicker & branch** armour.
- [x] **The first hide armour is CURED hide**, not raw — the hide rack is the gate.
- [x] The `primitive_hide` set is retired into those lines; nothing is left orphaned.
- [x] **The three lines are deliberately incomplete and fill each other's holes.** Sackcloth has no
      arms and no proper legs; wicker has no head, hands or feet; cured hide has no arms or hands.
      Arm cover is branch bracers or nothing. Legs are a CHOICE — the cured hide skirt (thigh, stops
      at the knee) or branch greaves (shin), never both, because they share the slot.
- [x] **Layering IS the stone age's heavy armour.** Sackcloth tunic (skin) → cured hide vest (mid) →
      wicker shell (outer) stacks to **10 soak at 6.5 kg** — exactly one bronze boarhide jerkin, at
      nearly twice the weight, and half what a bronze pawn gets from stacking two of their own pieces
      (18). Wearing every primitive piece at once (22 soak, 10.0 kg) puts a strength-20 pawn **over
      laden**; that is the price. Cold tops out at 0.40 across eight garments against 0.30 for a
      single wool cloak.

## 3 — Clothing worn UNDER armour

There are no shirts and no trousers. The `bodyBase` slot holds gambesons and robes, and legs hold
armoured greaves — a pawn cannot simply be dressed.

- [x] A **shirt** line (`bodyBase`) and a **trouser** line (`greaves`) in **sackcloth** (tier 0) and
      **linen** (sleeves + hose, tiers 1–4 alongside the padded line).
- [ ] The **wool** rung of that ladder is not authored — `wool_cloak` is still the only wool garment.
- [x] They are clothing, not armour: negligible `defense`, real `coldResistance`, near-zero fatigue.

## 4 — Set holes are patched

Thirteen kits are incomplete, and three of them are not accidents but whole missing limbs of a line:

- [x] **greaves** for the four marksman sets (Deer, Elk, Owlbear, Hippogriff) — the archer line has
      never had leg armour at any age.
- [x] **bracers + greaves** for the gambeson line (Linen, Quilted, Arming, Rune-Woven) — no sleeves,
      no hose, at any age.
- [x] **gloves + boots** for the plate lines — Copper Scale, Steel Plate and Rune-Graven now close.
      **Iron Plate is left open deliberately**: ITEM-RULES sanctions heavy sets being incomplete, and
      the Iron Mail line already supplies gauntlets and iron-shod boots at that same age.
- [x] `boarhide_heavy` is a single piece calling itself a set — fold it in or fill it out.

## 5 — Names tell the truth about hide vs leather

The steel-age `sabretooth_hide` set is made of `sabretooth_leather`. At that age nothing is worn raw.
R5 lets it pass because its material map treats hide and leather as the same word.

- [x] Split them: a name saying **hide** requires a `hide`-category material, **leather** requires
      `leather`. **R7** enforces it.
- [x] Rename the offenders after what they are actually cut from.

## 6 — Dropped gear becomes real faction sets

Every dropped piece today is a one-off: goblins drop one vest, orcs drop two plates and a shield, and
kobolds drop *the goblin vest*. The tables can only say "drop only".

- [x] **Sets per species** — goblin, orc, kobold, gnoll — each with its own construction identity
      (goblin = scavenged scraps, orc = heavy iron, kobold = small and light, gnoll = bone and hide).
- [x] **Several ages per species**, with coverage that varies by set: a warband drops less than a
      warhost. A dropped set is never complete — that is what makes it loot and not a kit.
- [x] Kobolds stop dropping goblin gear.

## 7 — Shields get a line worth choosing

Five shields exist in the whole game, and the Steel and Runed ages have **none**.

- [x] A shield per age, and more than one where the age is long.
- [x] They differ on a real axis — block vs weight vs how fast they break — not on a number tier.

## 8 — The tree separates crafted from dropped

- [x] Each age splits into **crafted** and **dropped** before it splits into sets.
- [x] Dropped sets nest under the **species that drops them**, not one flat "drop only" bucket.
- [x] `no set` splits the same way, so a craftable one-off never sits next to enemy loot.

## Verification

Every section closes the same way, and a box is only ticked when all three pass:

- [x] `itemRules` + `armourCoverage` + `gearSorting` + `armourChain` green, `svelte-check` clean.
- [x] A **headless** run for anything newly craftable — real pawns, real ticks, stated delta.
- [x] The packed tables republished (`node scripts/dev-tools/pack.mjs geardb`, then the Artifact tool
      with the URL from `scripts/dev-tools/published.json`).
