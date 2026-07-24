<!-- LOC cap: 200 (created: 2026-07-24) -->

# ALCHEMY & BUTCHERY-LOOT EXPANSION (proposal)

> **Related:** [AUDIT.md](AUDIT.md) · [DESIGN](../../game/DESIGN.md) · [DECISIONS](../../game/DECISIONS.md)

Proposal only — nothing here is implemented yet. Prompted by the butchery audit: powerful beast traits are
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

- [ ] **Neuter raw eating.** Remove `grantsTraitOnConsume` from the four organs (they become recipe inputs).
      Eating one raw still *does* something — but only the downside: a sickness condition + a decent chance of
      a pure flaw, never the good trait. Raw beast-flesh should punish, not reward.
- [ ] **A 3-TIER draught ladder per organ** (`ageTier`-gated, NOT rarity — think `iron:1 → iron:2 → runed:1`
      or `copper → iron → runed`, whatever fits the effect). Each rung is a **distinct recipe** demanding more
      and better material than the last — organ + escalating rare reagents + a purified base (distilled spirit
      / gem-dust catalyst / rare fungus) at rising counts — plus a higher research/station gate. T1 is a crude,
      risky transfusion; T3 is the refined apothecary version.
- [ ] **The outcome is a weighted GAMBLE on drink** (`traitGamble` block on the draught):
      - a **good** result: the target trait alone (best case),
      - a **mixed** result: the target trait + a flaw (Faustian),
      - a **bad** result: a flaw only (the body rejected it).
- [ ] **Draught TIER × pawn alchemy × station shift BOTH the odds AND the pools** (the core of the direction):
      - **Odds** — a higher-tier draught (T3 > T1), a higher pawn **alchemy** stat, and a better **workstation**
        all push the weighting toward the good/mixed results and away from pure-flaw.
      - **Pools** — the same three factors unlock a **better draw**: T3 by a master alchemist at the apothecary
        can roll a *stronger/rarer* trait (beyond the organ's base trait) and pull flaws from a *milder* set; a
        T1 brew by a novice draws the base trait at best and the harsh flaw set.
- [ ] **Data hooks**: replace `grantsTraitOnConsume` with a `traitGamble` on the DRAUGHT item — target-trait
      pool by tier, flaw pool by tier, and a base odds table modified at drink-time by `getWorkModifiers(pawn,
      'alchemy')` (or the alchemy stat) + the crafting station's tier + the draught's own tier/quality (§Q).
      Extend `rollFlawTrait` into a pool-and-weight roll. Wire in `Pawns.ts`/`commands.ts §2h`.

## B. High-tier butchery loot → crafting (anatomy-driven)

Dead boss materials today: **`great_bone`**, **`ivory`**, **`great_tusk`** (no consumer); `great_fang`
(only `make_fang_reaver`) and the prestige pelts are under-used. Use the body plan (`limbmap.jsonc`) as the
return→material table so a beast's anatomy shows up in what it drops AND what that makes.

- [ ] **`great_bone`** → bone weapons/armour (great-bone maul, bone-plated cuirass upgrade), and a building
      material (bone totem / trophy frame). Heavy, cheap-ish, primitive-flavoured brute gear.
- [ ] **`ivory` / `great_tusk`** → carved prestige goods: ivory-inlaid weapon grips, ivory idol/trophy
      (high beauty furniture), tusk pike/spear. A value + beauty sink, not combat power.
- [ ] **`great_fang`** → expand beyond `fang_reaver`: fang necklace/charm (a fear or prestige trinket),
      fang-tipped ammo.
- [ ] **Prestige pelts** (`sabretooth_pelt`, `dire_wolf_pelt`, `cave_bear_pelt`) → trophy rugs / regal
      furniture (beauty + comfort) beyond the existing cloaks.
- [ ] **Anatomy pass**: audit `limbmap.jsonc` special parts (claws, scales, glands, horns, hearts) → ensure
      each maps to a butchery return item AND ≥1 recipe, so no distinctive part is a dead drop.

## C. Alchemy / potions / tonics breadth — 3 TIERS per effect

**Core gap: one potion/tonic per effect is too few.** Today each effect (might, vigor, venom coating…) is a
single flat item with no progression. **Expand every effect line to a 3-tier `ageTier` ladder** (T1→T2→T3):
each rung a distinct recipe with a higher tech/material/station gate, giving a **stronger/longer effect** (and
for the §A organ draughts, better odds + better trait pool). This applies **per trait-pool AND per
condition-application** — so a "might" line, a "venom coating" line, an "alpha-heart transfusion" line each
become three items, not one.

- [ ] **Tier every existing brew**: `potion_of_might`/`draught_of_vigor`/`elixir_of_grace`/`tonic_of_fortitude`,
      the `*_draught`/`*_tonic` buffs, and `venom_coating`/`caustic_coating` each get a T1/T2/T3 ladder. Effect
      magnitude + duration scale up the ladder; higher tiers demand rarer reagents + a better station.
- [ ] **More effect LINES** for under-covered ground (fear/terror, corrosion/armour-eat, bleed, slow coatings;
      perception/antidote/rest-mood tonics) — each authored as a 3-tier ladder from the start, not a one-off.
- [ ] **Reagent depth to support the tiers**: distilled bases (spirits), purified catalysts (gem-dust,
      quicklime), so the T2/T3 rungs demand a real supply chain — the same bases feed §A's trait draughts.

## D. Workstations & building recipes

- [ ] **Apothecary / advanced alchemy station** (tier above `alchemy_lab`): gates the high-tier trait
      draughts and best potions; its station tier is one of the three factors in the §A gamble.
- [ ] **Bone/trophy carver's bench**: the station for §B ivory/bone/tusk carving + trophy furniture.
- [ ] **Building materials from loot**: `great_bone` → a bone-totem/altar building; prestige pelts/ivory →
      high-beauty furniture, tying the loot chains back into the base-building loop.

## Acceptance (when built)

- [ ] **Every potion/tonic/coating effect is a 3-tier `ageTier` ladder** (T1/T2/T3), distinct from the
      per-instance `rarities.jsonc` quality roll — no effect is a single flat item.
- [ ] Effect magnitude/duration rises up the tier ladder; each rung has a strictly higher material/tech/station
      gate than the last.
- [ ] Raw-eating an organ never grants the good trait; the trait only comes from a brewed draught.
- [ ] Draught outcome odds AND trait/flaw pools measurably improve with draught tier × pawn alchemy × station
      (headless: same organ, low-tier/novice/basic-lab vs high-tier/master/apothecary → different outcome
      distributions over N brews).
- [ ] `great_bone`, `ivory`, `great_tusk` each have ≥1 crafting consumer; no boss/anatomy drop is a dead end.
- [ ] New alchemy/coating/tonic recipes each drive end-to-end headless (reagent sourced → brewed → effect).
