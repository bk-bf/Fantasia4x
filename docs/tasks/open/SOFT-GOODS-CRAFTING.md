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
- [x] **DONE (2026-07-25):** step 1 flesh (`fleshed_<animal>_hide` ×17) inserted before cure (17 cure inputs
      rewired raw→fleshed); step 4 curry (`prime_<leather>` ×12) at the `curriers_bench` for beasts. Headless-verified:
      deer raw→flesh→cure→tan and wolf hide→…→`prime_wolf_leather` (fat consumed), animal identity intact end-to-end.
- [x] Retargeted `cave_bear_plate` (→ `prime_cave_bear_hide`) + `direwolf_warcloak` (→ `prime_direwolf_leather`); the
      rest of the beast-gear/rug/bed retarget accepts `category:leather` (prime qualifies) — extend per-piece as needed.

## B. `tailoring` work category + subjobs + tools
- New parent category **`tailoring`** (soft-goods) with construction-style SUBJOBS:
  - **`leatherwork`** — the active hide steps (flesh, curry) + sewing LEATHER gear.
  - **`weaving`** — basketry/wicker + cloth + sewing CLOTH gear (§C).
  - subjob stats key off the job id, falling back to `tailoring_*` (mirrors `repair_*` → `construction_*`).
- Tools (durable/non-organic): **`fleshing_scraper`** (bone t0 / iron t2) for step 1; **`curriers_kit`** (iron/steel)
  for step 4; **`sewing_kit`** (iron) → **`tailors_kit`** (steel) for sewn gear assembly. Each gates at the tier it
  logically appears; **primitive apparel is wicker/woven → needs no tool** (stays ungated).
- [x] **DONE:** `tailoring` parent + `leatherworking`/`weaving` leaf disciplines (own stats, own skills); the six
      tools (`bone_fleshing_scraper`/`iron_fleshing_knife`, `curriers_kit`/`steel_curriers_kit`, `sewing_kit`/`tailors_kit`)
      + recipes + the `curriers_bench`; flesh/curry gated on the leatherworking tool tier (a flint knife can't flesh).
- [~] Gating the ~18 sewn leather/cloth GEAR recipes on the kit is not yet applied per-piece (tools + gate mechanism
      exist; the flesh/curry steps ARE gated). Follow-up.

## C. `weaving` subjob — route wicker/basketry + cloth
Wicker/basket/wattle work IS weaving, not "general crafting" — and it's the right early path:
- [x] Move `woven_basket`, `wicker_frame`, `wattle_buckler`, `wicker_vest` → **weaving** (folded into `craft_spot`,
      tagged `weaving` — see §D; hand-woven, no tool).
- [x] Cloth weaving (`weave_linen/cotton/woolcloth`) already routes to **weaving** via the loom's `weavingEnabled`.

## D. Retire general `crafting` → specialised disciplines — **DONE (2026-07-25)**
**Generic `crafting` is fully DISSOLVED**: every craft now routes to a real discipline, guarded by
`recipeDiscipline.test.ts` (fails the moment a recipe has no route). Two enablers built:
- **Recipe-level `discipline` tag** (`Recipe.discipline`, resolved in `craftDiscipline.ts` BEFORE the station flag) —
  so one mixed station (`craft_spot`, `makers_bench`) routes each recipe to its own discipline. The 3 free spots
  (knapping/weaving/herbalist) were folded back into a single `craft_spot`; ~90 recipes tagged.
- Two new disciplines: **Pottery** (clay/ceramics/glass) and **Bonecarving** (a Stoneworking leaf — bone/antler/ivory
  is the hard-material family, keeping the stone specialist relevant late).

**Final discipline taxonomy** (all equal top-level Work-tab parents; leaves are INDEPENDENT skills — a weaver never
levels a leatherworker, guaranteed by `SKILL_CATEGORIES` + XP-to-leaf):
`metalworking · woodworking · tailoring{leatherworking, weaving} · stoneworking{knapping, masonry, lapidary,
bonecarving} · pottery · cooking{meals, butchery, baking, brewing} · alchemy{herbalism, potions}`
- [x] Routed: leather gear → leatherworking; bone/antler/ivory → bonecarving; bows → woodworking; clay/glass →
      pottery; smelt-prep (pig_iron/coke/charcoal/crucible_steel/mechanism) → metalworking; cordage/rope → weaving;
      mud_brick/quicklime → masonry; brines → leatherworking; stone tools → knapping; poultice → herbalism.
      Oddballs (flag for review): candle/torch → cooking; compost/fertiliser/resin → alchemy.
- [x] Per-leaf work stats (20) tuned to each craft; traits' generalist `crafting` key → `crafts` meta-key (applies to
      every craft discipline, not construction/harvest).

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
- [x] **Phase 1 (DONE):** `tailoring` + leatherwork/weaving + the kits + `curriers_bench`; active flesh (A1) + curry
      (A4) per-animal; beast gear retargeted to `prime_<leather>`.
- [x] **Phase 2 (DONE):** wicker/basketry + cloth → weaving (C). *(Wound-medicine pass — AUDIT §4 herbalism — still open.)*
- [x] **Phase 3 (DONE):** `crafting` fully dissolved into disciplines (D) via the recipe-`discipline` tag; +Pottery,
      +Bonecarving; ~90 recipes routed; per-leaf stats; traits' `crafts` meta-key.
- **BONUS (not originally specced):** tool/weapon **HANDLE chain** — Woodworking discipline + `wooden_haft`/`sanded_haft`/
  `seasoned_haft` (carve→sand→passive batch-soak at the `soaking_trough`); 22 iron/steel/bronze tool+weapon recipes
  swapped off raw `branch` onto crafted hafts. See Principles. Headless-verified (carve→soak→iron_axe).

## Open questions
- [x] Beast gear/rug/bed retarget — RESOLVED: beast **rugs** already animal-specific (`dire_wolf_rug`←pelt, etc. —
      identity already there; a FUR rug isn't leather, so no prime retarget); beast **gear**
      (`cave_bear_plate`/`direwolf_warcloak`) requires `prime_<leather>`; regular gear uses `category:leather`
      (prime qualifies). No per-animal beds exist. *(Rug→cured-fur realism is a minor tracked follow-up in AUDIT §3.)*
- [x] Oddball homes — RESOLVED (accepted): candle/torch → cooking; compost/fertiliser/resin → alchemy.
- [ ] Sewn iron+ gear kit-gating per-piece — **tracked in [AUDIT.md](AUDIT.md) §3 follow-ups** (recipe sweep; needs a
      `weaving` WORK_CATEGORY for cloth-apparel gating).
- [ ] End-to-end headless sweep of ALL new recipes/items/buildings — **tracked in [AUDIT.md](AUDIT.md) §3** (`craftAllNew.test.ts`).

## Acceptance (headless-verified)
- [x] A hide can't become leather without the ACTIVE flesh step (flint knife can't flesh — a t1 fleshing tool is needed).
- [x] A beast leather requires the active curry step → `prime_<leather>` (headless: wolf hide → … → prime, kit-gated).
- [x] `tailoring` splits into leatherworking/weaving in the Work tab; each is its OWN skill (independent leveling).
- [x] Per-animal identity survives end-to-end: `wolf_hide` → wolf-named prime leather → `direwolf_warcloak`.
- [~] Primitive wicker apparel crafts with NO tool (done); per-piece iron+ sewn-gear kit-gating is the follow-up above.
