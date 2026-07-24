<!-- LOC cap: 200 (created: 2026-07-24) -->

# ALCHEMY & BUTCHERY-LOOT EXPANSION

> **Related:** [AUDIT.md](../open/AUDIT.md) · [DESIGN](../../game/DESIGN.md) · [DECISIONS](../../game/DECISIONS.md)
>
> **Archived 2026-07-24 — COMPLETE.** All of §A–§D implemented and headless-verified; see the status line below.

**Status (2026-07-24): COMPLETE — §A, §B, §C, §D all IMPLEMENTED & headless-verified** (`alchemyChain.test.ts`,
`combatSim.test.ts`, `butcheryAudit.test.ts`). Every checkbox and acceptance criterion below is ticked: the
Faustian trait draughts, the full loot→crafting chains (bone/ivory/tusk/fang/claw/antler/horn, no dead drops),
the 3-tier ladder on every effect + 6 net-new lines + the sugarcane→sugar→spirit reagent chain (pot-gated), and
the Apothecary + Bone Carver's Bench. Original framing: Prompted by the butchery audit: powerful beast traits are
currently handed out for eating an organ **raw**, and several boss loot drops (`great_bone`, `ivory`,
`great_tusk`) have no consumer. This reworks the trait path into a **risky, tiered alchemical craft** and
turns the anatomy loot into real crafting/building chains.

> **Two orthogonal axes — do not conflate.** (1) **TIER** = a tech-progression LADDER, exactly like the
> weapon/building `ageTier` (`primitive → copper → bronze → iron → steel → runed`). Every potion/tonic/coating
> gets one; today they have NONE (each effect is a single flat item). (2) **RARITY/QUALITY** = the per-instance
> `rarities.jsonc` roll (§Q — Plain…Famed), a quality of one crafted unit. This proposal is about **TIER**:
> **every effect becomes a 3-step ladder** (T1→T2→T3), each a distinct recipe demanding more + better material,
> higher pawn **alchemy**, and a better **workstation**. Rarity still layers on top per unit, independently.

## A. Trait-organ rework — Faustian, tiered, no free lunch

**Problem.** Four organs — `alpha_heart`→feral-adrenaline, `direwolf_hackles`→thick-hide,
`sabretooth_glands`→killer-instinct, `owlbear_pineal`→keen-senses — use `grantsTraitOnConsume` (Pawns.ts).
Eating one **raw** grants the good trait for certain, plus one `rollFlawTrait` flaw. No alchemy, no skill,
no station, no real risk of *not* getting the prize. That trivialises the best traits in the game.

**Design.** The organ is a REAGENT, not a snack. The coveted trait only comes from **brewing it into a
tiered draught**, and even then the result is a gamble whose odds AND reward-pool scale with investment.

- [x] **Neuter raw eating.** Remove `grantsTraitOnConsume` from the four organs (they become recipe inputs).
      Eating one raw still *does* something — but only the downside: a sickness condition + a decent chance of
      a pure flaw, never the good trait. Raw beast-flesh should punish, not reward.
- [x] **A 3-TIER draught ladder per organ** (`ageTier`-gated, NOT rarity — think `iron:1 → iron:2 → runed:1`
      or `copper → iron → runed`, whatever fits the effect). Each rung is a **distinct recipe** demanding more
      and better material than the last — organ + escalating rare reagents + a purified base (distilled spirit
      / gem-dust catalyst / rare fungus) at rising counts — plus a higher research/station gate. T1 is a crude,
      risky transfusion; T3 is the refined apothecary version.
- [x] **The outcome is a weighted GAMBLE on drink** (`traitGamble` block on the draught):
      - a **good** result: the target trait alone (best case),
      - a **mixed** result: the target trait + a flaw (Faustian),
      - a **bad** result: a flaw only (the body rejected it).
- [x] **Draught TIER × pawn alchemy × station shift BOTH the odds AND the pools** (the core of the direction):
      - **Odds** — a higher-tier draught (T3 > T1), a higher pawn **alchemy** stat, and a better **workstation**
        all push the weighting toward the good/mixed results and away from pure-flaw.
      - **Pools** — the same three factors unlock a **better draw**: T3 by a master alchemist at the apothecary
        can roll a *stronger/rarer* trait (beyond the organ's base trait) and pull flaws from a *milder* set; a
        T1 brew by a novice draws the base trait at best and the harsh flaw set.
- [x] **Data hooks**: replace `grantsTraitOnConsume` with a `traitGamble` on the DRAUGHT item — target-trait
      pool by tier, flaw pool by tier, and a base odds table modified at drink-time by `getWorkModifiers(pawn,
      'alchemy')` (or the alchemy stat) + the crafting station's tier + the draught's own tier/quality (§Q).
      Extend `rollFlawTrait` into a pool-and-weight roll. Wire in `Pawns.ts`/`commands.ts §2h`.

## B. High-tier butchery loot → crafting (anatomy-driven)

Dead boss materials today: **`great_bone`**, **`ivory`**, **`great_tusk`** (no consumer); `great_fang`
(only `make_fang_reaver`) and the prestige pelts are under-used. Use the body plan (`limbmap.jsonc`) as the
return→material table so a beast's anatomy shows up in what it drops AND what that makes.

- [x] **`great_bone`** → bone weapons/armour (great-bone maul, bone-plated cuirass upgrade), and a building
      material (bone totem / trophy frame). Heavy, cheap-ish, primitive-flavoured brute gear.
- [x] **`ivory` / `great_tusk`** → carved prestige goods: ivory-inlaid weapon grips, ivory idol/trophy
      (high beauty furniture), tusk pike/spear. A value + beauty sink, not combat power.
- [x] **`great_fang` — DONE.** Beyond `fang_reaver`: **`fang_charm`** (amulet, grants Might — a predator
      fang-and-claw neck-piece, also a second claw sink) and **`fang_arrow`** (fang-tipped ammo, ×10 per fang,
      a keen cutting head that bleeds hard). Headless: flensed/stocked fang → both craft.
- [x] **Prestige pelts — DONE.** Three trophy rugs — **`dire_wolf_rug`** (comfort 0.45 / beauty 0.6),
      **`cave_bear_rug`** (0.5 / 0.65), **`sabretooth_rug`** (0.45 / 0.7) — finer than the plain bear rug, a
      beauty+comfort sink competing with the warcloaks. Furniture defs verified (`butcheryAudit.test.ts`).
- [x] **Anatomy pass — DONE.** Audited every carcass drop vs `limbmap.jsonc`: **scales** (`croc_scaled_hide`),
      **glands** (`venom_sac`/`raw_silk`/`owlbear_bile`/`sabretooth_glands`/`caustic_bile`) and **hearts**
      (`alpha_heart`) already mapped + consumed. The two dead families — **claws/talons** and **antlers/horns** —
      are now closed: `predator_claw` (drops from 10 clawed predators → fang_charm + claw_totem + barbed arrow),
      `antler_rack` (deer/elk) and `curved_horn` (goat/aurochs) → the shared `barbed_bone_arrow`. Headless A→Z:
      butcher wolf/deer/goat ⇒ claw/antler/horn drop ⇒ every consumer crafts (`butcheryAudit.test.ts` `[ANATOMY]`).

## C. Alchemy / potions / tonics breadth — 3 TIERS per effect

**Core gap: one potion/tonic per effect is too few.** Today each effect (might, vigor, venom coating…) is a
single flat item with no progression. **Expand every effect line to a 3-tier `ageTier` ladder** (T1→T2→T3):
each rung a distinct recipe with a higher tech/material/station gate, giving a **stronger/longer effect** (and
for the §A organ draughts, better odds + better trait pool). This applies **per trait-pool AND per
condition-application** — so a "might" line, a "venom coating" line, an "alpha-heart transfusion" line each
become three items, not one.

- [x] **Tier every existing brew — DONE.** All 12 buff/coating lines (`potion_of_might`, `draught_of_vigor`,
      `elixir_of_grace`, `tonic_of_fortitude`, `bloodrage_draught`, `ironhide_tonic`, `vigor_draught`,
      `calming_draught`, `nightglow_draught`, `frenzy_draught`, `venom_coating`, `caustic_coating`) kept as T1
      and given **Greater (T2)** + **Grand (T3)** rungs — buff duration ×1.6/×2.5 (e.g. 1200→1920→3000), coating
      chance +0.15/+0.30 (0.6→0.75→0.9) & longer, escalating reagents; T2 at the lab, T3 at the apothecary.
      Verified headless (`alchemyChain.test.ts`).
- [x] **More effect LINES — DONE.** Six net-new lines, each a 3-tier ladder (T1 lab / T2 lab / T3 apothecary):
      **slow** (`tanglefoot_coating` → `hamstrung`), **fear** (`dread_coating` → new `cowed` condition),
      **perception** (`farsight_tonic` → `keen_senses`), **antidote** (`antivenin_tonic` → cures active
      envenomed/nausea/dysentery + a `toxin_immune` window — the counter to the venom/caustic coatings),
      **rest-mood** (`restful_tonic` → `refreshed`), and a **sharpness** coating replacing the dropped
      bleed line: `honing_oil`/`keen_edge_oil`/`razors_grace` carry a `coatingEffect.bleedMult` that
      MULTIPLIES the swung weapon's own `bloodletting` (unclottable-wound) proc — multiplicative by design,
      so a maul (crush, no bleed proc) stays at 0 however keen the oil, while a cutting blade's non-clotting
      rate climbs (0.18 → 0.53 at T3). Verified headless in combat (`combatSim.test.ts` `[SHARP]`) + the
      brew/effect chains (`alchemyChain.test.ts`). Bleed stays a physical wound (no timed-`bleeding` pill).
- [x] **Reagent depth — DONE.** Two intermediate crafts are the new T2/T3 bases: `fermented_mash` (grain +
      `sugar`, the sugar itself refined from a foraged `sugarcane` wetland reed → `refine_sugar` at the campfire,
      **gated on a clay cooking pot** — boiling cane juice needs a vessel, headless A/B: no pot ⇒ 0 sugar, pot ⇒ boils)
      distilled at the lab into **`distilled_spirit`** (the T2 carrier), and `gem_dust` refined at the
      apothecary into **`purified_catalyst`** (the T3 catalyst). All 12 existing Greater/Grand brews (and every
      new line) were rewired to consume the base/catalyst instead of escalating raw `gem_dust` counts, so the
      tier ladder now gates on a real supply chain. Verified headless (`alchemyChain.test.ts` `[ALCH reagents]`).

## D. Workstations & building recipes

- [x] **Apothecary / advanced alchemy station** (tier above `alchemy_lab`): gates the high-tier trait
      draughts and best potions; its station tier is one of the three factors in the §A gamble.
- [x] **Bone/trophy carver's bench**: the station for §B ivory/bone/tusk carving + trophy furniture.
- [x] **Building materials from loot**: `great_bone` → a bone-totem/altar building; prestige pelts/ivory →
      high-beauty furniture, tying the loot chains back into the base-building loop.

## Acceptance (when built)

- [x] **Every potion/tonic/coating effect is a 3-tier `ageTier` ladder** (T1/T2/T3), distinct from the
      per-instance `rarities.jsonc` quality roll — no effect is a single flat item.
- [x] Effect magnitude/duration rises up the tier ladder; each rung has a strictly higher material/tech/station
      gate than the last.
- [x] Raw-eating an organ never grants the good trait; the trait only comes from a brewed draught.
- [x] Draught outcome odds AND trait/flaw pools measurably improve with draught tier × pawn alchemy × station
      (headless: same organ, low-tier/novice/basic-lab vs high-tier/master/apothecary → different outcome
      distributions over N brews).
- [x] `great_bone`, `ivory`, `great_tusk` each have ≥1 crafting consumer; no boss/anatomy drop is a dead end
      (verified by a dead-drop cross-audit: every carcass output is consumed by a recipe, building, or cooking).
- [x] New alchemy/coating/tonic recipes each drive end-to-end headless (reagent sourced → brewed → effect).
