<!-- LOC cap: 240 (created: 2026-07-25) -->

# SOFT-GOODS CRAFTING — tailoring, realistic per-animal leather & discipline specialisation

> **Related:** [AUDIT.md](AUDIT.md) · [DESIGN](../../game/DESIGN.md) · [DECISIONS](../../game/DECISIONS.md)

**Status (2026-07-25): PROPOSED — design locked in chat, not yet built.** Prompted by the tool-tier-parity
audit: `leatherworking` was a phantom tool-gate on a purely PASSIVE tanning chain (raw pelt → hang with ash →
soak in brine → leather) — no active work, no tool, i.e. just hauling + waiting. Meanwhile generic `crafting`
is a grab-bag and early–mid apparel is thin (t0 = 7 pieces, no cloth base layer, no primitive footwear). This
reworks soft-goods crafting into real ACTIVE jobs under a new `tailoring` category, a historically-grounded
per-animal leather chain, and specialised disciplines that replace the generic crafting bucket.

## Principles (apply throughout)
- **Tool = durable, strictly NON-organic** (metal + at most a leather/thread/wood binding) → it gives **SPEED**.
  **Organic = consumable** (herb / oil / food / medicine) → it gives **QUALITY**. The two are used together. Never
  craft a durable tool from a raw consumable ("herbal kit from one woundwort" is the anti-pattern).
- **Handles are crafted, progressively (reversed 2026-07-25).** A raw `branch` hafts a STONE tool (a hand-axe *is* a
  stick + stone — correct), but a metal head wants a real handle, gated by **carpentry**, not just ore: copper/bronze
  use a carved `wooden_haft`; iron/steel need a **`seasoned_haft`** — carve+sand a batch (active woodworking), then
  **soak** the batch at a passive soaking trough (the iron-age reward: load six, walk away). No soak → no robust iron
  tool. Hilted blades (swords/daggers) keep their leather grip; arrows keep their branch shaft. **DONE + headless-verified.**
- **Preserve ANIMAL IDENTITY end-to-end.** A wolf stays a wolf: `wolf_pelt → … → wolf_leather → prime_wolf_leather`
  → a wolf-flavoured cloak / rug / bed. A wolfskin coat reads far more immersive than a generic "leather coat".
  **Generic leather is reserved for boring animals** you'd never want gear to reference (rat/vermin). The flavour
  propagates all the way into gear, furniture, rugs and beds.
- **Tanning is PASSIVE material processing** (like smelting ore → bar), NOT a tailoring subjob. The ACTIVE hide
  steps (flesh, curry) and the sewing/assembly ARE tailoring.

## A. Leather chain — active steps around the passive core, per-animal, tiered
Insert active leatherwork steps around the existing passive cure/tan, keeping the 17-species split at every stage.
`<animal>` = each existing species (buckskin/wolf/boar/elk/ox/bear/cave_bear/owlbear/sabretooth/mammoth/direwolf/
jackal/goat…; rat/rabbit stay the "boring", near-generic line).

| # | Step | Kind | Station | Tool / consumable | Output |
|---|---|---|---|---|---|
| 1 | **Flesh & scrape** (strip flesh/fat/membrane) | **ACTIVE** (leatherwork) | scraping beam / makers_bench | **fleshing scraper** (bone t0 → iron t2) | `fleshed_<animal>_hide` |
| 2 | **Cure** (draw out moisture) | passive⚙ | hide_rack | ash×2 / salt | `cured_<animal>_pelt` *(exists)* |
| 3 | **Tan** (brine / bark) | passive⚙ | tanning bucket | `tanning_brine` | `<animal>_leather` *(exists)* |
| 4 | **Curry & finish** (oil, slick, work supple) | **ACTIVE** (leatherwork) | currier's bench | **currier's kit / slicker** (iron+) + fat/oil consumable → QUALITY | `prime_<animal>_leather` |

- **Common hides = 1 active step** (flesh → cure → tan). **Beast/prime hides = 2 active steps** (…+ curry) — the
  "higher tier is more involved" the design wants; `prime_<animal>_leather` is the input for top-tier beast gear/furniture.
- [ ] Insert step 1 (`fleshed_<animal>_hide`) before cure; cure/tan take the fleshed hide (small input rename).
- [ ] Add step 4 curry for BEAST/prime species only → `prime_<animal>_leather`.
- [ ] Retarget top-tier beast gear/rugs/beds to `prime_<animal>_leather` (the wolfskin warcloak needs *finished*
      wolf leather, not a raw tan) — so the flavour reads through into the highest-value pieces.

## B. `tailoring` work category + subjobs + tools
- New parent category **`tailoring`** (soft-goods) with construction-style SUBJOBS:
  - **`leatherwork`** — the active hide steps (flesh, curry) + sewing LEATHER gear.
  - **`weaving`** — basketry/wicker + cloth + sewing CLOTH gear (§C).
  - subjob stats key off the job id, falling back to `tailoring_*` (mirrors `repair_*` → `construction_*`).
- Tools (durable/non-organic): **`fleshing_scraper`** (bone t0 / iron t2) for step 1; **`curriers_kit`** (iron/steel)
  for step 4; **`sewing_kit`** (iron) → **`tailors_kit`** (steel) for sewn gear assembly. Each gates at the tier it
  logically appears; **primitive apparel is wicker/woven → needs no tool** (stays ungated).
- [ ] Add `tailoring` to WORK_CATEGORIES + CRAFT_DISCIPLINES; add `tailoring_speed/quality` + subjob stats.
- [ ] Gate the ~18 active leather/cloth GEAR recipes on the appropriate kit (iron+); passive tanning stays ungated.

## C. `weaving` subjob — route wicker/basketry + cloth
Wicker/basket/wattle work IS weaving, not "general crafting" — and it's the right early path:
- [ ] Move `woven_basket`, `wicker_frame`, `wattle_buckler`, `wicker_vest` off craft_spot/generic → **weaving**
      (hand-woven; station = a simple weaving spot; no metal tool early).
- [ ] Cloth weaving (`weave_linen/cotton/woolcloth` @loom) → **weaving**; sewn cloth apparel → weaving + sewing kit.

## D. Retire general `crafting` → specialised disciplines (each with a lifelong through-line)
`craft_spot` is a grab-bag; route each output to its real discipline so skill / tool / Work-tab slider all follow.
**Design guard: no discipline may go obsolete** — every specialist must stay useful into late game (so specialising
never strands a pawn). Parent disciplines with construction-style **{subjobs}**:

- **`metalworking`** (blacksmithing) — smelt / forge metal tools, weapons, armour.
- **`tailoring`** {**leatherwork**, **weaving**} — soft goods; weaving stays relevant late as the thread/fabric line (§A–§C).
- **`woodworking`** — planks, furniture, wooden tools, bows, carts.
- **`stoneworking`** {**knapping** (chipped stone tools) → **masonry** (dressed blocks / walls / querns) → **lapidary**
  (cut / polished gems)} — **the knapping-obsolescence FIX**: knapping is just the EARLY face of one stone-shaping
  skill that carries the specialist all game (flint tools → granite walls → cut rubies), not a dead-end stone-age job.
- **`cooking`** {**butchery** (carcass → meat/hide/bone), **baking** (bread / pies @oven), **brewing** (ale / wine /
  cider @fermenter), meals @campfire} — one food-craft family.
- **`alchemy`** {**herbalism** (gather + prepare herbal medicines / poultices / salves — feeds the caretaking medicine
  pass, AUDIT §4), potions / tonics / coatings} — herbalism is the plant-prep face, alchemy proper the reagent face.

- [ ] **Route the craft_spot grab-bag:** stone tools (flint knife/axe/hammer/sickle/chopper, digging stick, wooden
      tongs) → **knapping** (stoneworking); `wicker_vest` → **weaving**; `chewed_poultice` → **herbalism** (alchemy);
      `cordage`/`torch`/`mud_brick` → **woodworking** / a thin survival residual.
- [ ] Move existing `masons_bench`/`lapidary_bench` recipes under `stoneworking`; `oven`/`fermenter` under `cooking`.
- End state: **no generic `crafting` bucket** — every craft routes to a discipline whose specialist stays relevant.
  **Biggest, most invasive part — do LAST.**

## E. Class/build-driven gear & apparel coverage
Gear is designed **build-first**, not as a free list: the **class/build map ([AUDIT.md](AUDIT.md) §1)** is the driver
and the GATE — every apparel/weapon add (early-mid fills AND boss-themed high-end) must earn its place by filling a
gap in the grid, deliberately slotted to a build.
- [ ] **Build the grid `build × tier`** (bruiser/duelist/marksman/tank/scout/artisan/medic/face × primitive1-3 →
      copper → bronze → iron → steel → runed → **boss-themed**): mark per cell whether a viable **weapon + armour
      (per slot) + role-tool** exists. Empties = the fill backlog; this grid gates every add below. Flag builds with
      no viable path at a tier (e.g. no light/quiet armour for a mid-game scout) as priority fills.
- [ ] **Early–mid fills (t0–t2)** — driven by the grid's early empties, per build lean (light vs warm), feeding off
      §B/§C: the missing CLOTH base layer (`bast_fiber_tunic`/`nettle_shift`, `woven_grass_cloak`), fur/hide pieces
      (`fur_wrap`/`hide_leggings`/`hide_cap`), the missing primitive FOOT slot (`hide_moccasins`/`bark_sandals`).
- [ ] **Boss-themed gear (T4 → double for T5)** — the apex of the animal-identity principle AND the grid's top row:
      **every great/boss mob** (great wolf/bear/boar/weaver, broodmother, sabretooth, cave bear, direwolf, mammoth,
      hippogriff…) gets a CRAFTABLE piece/set themed after IT — from its `prime_<animal>_leather` + fang/bone/pelt/
      horn, NOT a generic "beast plate" — and deliberately slotted to a build (direwolf warcloak → scout/skirmisher,
      cave-bear plate → tank…). Some exist (Direwolf Warcloak, Cave Bear Plate, Horned Helm); extend to a themed
      weapon/armour/trophy per boss so a T5 kill visibly reads on the pawn who wears its coat.
- [ ] Keep the grid in sync with the AUDIT class/build audit — this section is its GEAR-supply side.

## Phasing
- [x] **Phase 0 — job-registry unification (2026-07-25):** crafts now nest under a parent category the same
      way Construction nests Build/Repair, instead of being flat top-level disciplines. `jobs.jsonc` → `{jobs,
      disciplines}` (nested tree); new pure `services/jobs/disciplineTree.ts` parses it; a craft resolves to a
      LEAF discipline (stat/quality/tools) under a PARENT category (labor priority/XP). New parents `tailoring`
      {leatherwork, weaving}, `stoneworking` {knapping, masonry, lapidary}; `cooking` gains {meals, butchery,
      baking, brewing}; `alchemy` gains {herbalism, potions}; `metalworking` stays flat. Leaves share the parent
      skill (like repair→construction). Verified: `pnpm check` 0 errors, full suite 1141/1141, leather-chain +
      butchery headless E2E green, Work tab nests via `getSubjobsForCategory`. New leaves route as B/C/D wire
      their stations; only existing-flag stations (tannery→Leatherwork, butcher→Butchery, campfire→Meals,
      apothecary→Potions, anvil→Metalworking) route live so far. **Station routing then completed** (added
      leaf effect-flags): looms→Weaving, masons_bench→Masonry, lapidary_bench→Lapidary (fixing its old
      mis-route to alchemy), oven/quern→Baking, fermenter→Brewing, hide_rack→Leatherwork. Only **Knapping**
      and **Herbalism** stay unrouted — they need per-recipe splits out of the mixed `craft_spot` (tail of D).
- [ ] **Phase 1 (fix now):** `tailoring` category + leatherwork/weaving subjobs + the kits; the active flesh (A1)
      + curry (A4) steps, per-animal; retarget beast gear to `prime_<animal>_leather`. The "fix tailoring & tools" deliverable.
- [ ] **Phase 2:** route wicker/basketry + cloth into weaving (C); the wound-medicine pass (AUDIT §4, herbalism).
- [ ] **Phase 3:** the broad `crafting` → specialised-discipline reshuffle (D). Touches many recipes; last.

## Open questions
- [ ] Curry: a dedicated `curriers_bench`, or fold the active curry into the beast-tanning area as an active pre-step? (lean: one new `curriers_bench`.)
- [ ] Flesh output: per-animal `fleshed_<animal>_hide` (17 new items, keeps identity cleanly) vs a shared `fleshed_hide`
      that re-splits at tan (fewer items, muddier). Lean: **per-animal**, to keep flavour unbroken.
- [ ] `knapping` as a real new discipline vs folding stone tools into a residual `crafting`.

## Acceptance (headless-verifiable when built)
- [ ] A hide can't become leather without the ACTIVE flesh step (a colony with no scraper stalls at the raw pelt).
- [ ] A beast leather requires the active curry step → `prime_<animal>_leather` (headless: pelt → … → prime, kit-gated).
- [ ] `tailoring` splits into leatherwork/weaving in the Work tab; each subjob's speed/quality respond to skill + kit tier.
- [ ] Per-animal identity survives end-to-end: `wolf_pelt` drives a wolf-named leather → a wolf-named piece of gear/rug.
- [ ] Primitive wicker apparel still crafts with NO tool; iron+ sewn gear requires the kit.
