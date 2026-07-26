<!-- LOC cap: 320 (created: 2026-07-26) -->

# BUILD ARCHETYPES — the pawn-build lens + a stats / traits / gear / lineage coverage audit

> **Related:** [AUDIT.md](AUDIT.md) · [ROADMAP](ROADMAP.md) · [DESIGN](../../game/DESIGN.md) · [DECISIONS](../../game/DECISIONS.md)
> · **Visual companion (color-coded coverage grids):** [Build Archetypes artifact](https://claude.ai/code/artifact/f87ef907-46e2-4015-a455-b698799eea4f)
> — this `.md` is the tracked working doc (checkboxes/backlog); the artifact is the at-a-glance face. Keep both in sync.

**Status (2026-07-26): AUDIT COMPLETE, FILLS PROPOSED — not yet built.** We're striving for distinct pawn BUILDS off
`stats.jsonc`/`traits.jsonc`, but the builds live nowhere, so coverage gaps are invisible and we *hope* they emerge.
This spec makes them explicit: it defines the canonical builds, then audits the four systems that should reinforce
them — **stat requirements, traits, gear, lineages** — against that lens, marking every gap. It's the DEMAND side; the
soft-goods gear rework ([archived](../archive/SOFT-GOODS-CRAFTING-2026-07-26.md)) is one supply source.

**Ground truths (verified against source):** the engine has **6 base stats — no Wisdom** (STR DEX CON PER INT CHA).
Tiers are numeric `tier` 0–4: **t0 primitive · (copper) · t1 bronze+leather · t2 iron · t3 steel · t4 boss/runed**.
*(2026-07-26: a thin **copper** stepping stone was added — `copper_axe`/`copper_pick`/`copper_knife`/`copper_dagger`,
soft, forged at the copper-age hearth, filling the empty stone→iron tool rung. Pick re-tier: `stone_pick`→tier 0, so
**tin now needs a copper pick** — a real metallurgical gate before bronze.)* Primitive is one band, not three. The only build-like concept that exists is the 10 **culture
archetypes** (racial stat leans, none CHA-led) — there is **no player-chosen class/role system**; builds are steered
only coarsely, via culture + background (a weighted bias, never a guarantee) and, once in life, lineage awakening.

## The build lens — 9 archetypes (the 8 named + Mage)
Each build = the stat(s) that unlock its combat/work stats (formula-justified), the body capacity it's chokepointed on,
and the gear it wants. **Weapon damage scales: default → STR; `finesse` (rapier/estoc) → PER; `arcane` (staves) → INT.**

| Build | Lead stat(s) | Capacity gate | Key stats it unlocks (formula) | Wants |
|---|---|---|---|---|
| **Bruiser** | STR (+CON) | manipulation | melee_damage `1+(STR-10)·.01`, armor_damage `·.02`; clears heavy `wieldRequirement` (14–24) | mauls/greataxes/cleavers, heavy plate, carry |
| **Tank** | CON (+mass) | braces w/o moving | block `.03+(CON-10)·.006+(wt-70)·.0015` (+shield), knockdown_resist, stamina, resistances | 1H+shield, heaviest plate |
| **Duelist** | DEX (finesse→PER) | manipulation+moving | hit_chance/attack_speed `1+(DEX-10)·.03`, dodge, hit_precision; finesse dmg = base·PER/10 | finesse blades, LIGHT/medium armour |
| **Marksman** | PER (+STR draw, DEX cadence) | **sight**+manipulation | aim_accuracy `1+(PER-10)·.04`, aim_range, vision_range; bow dmg rides STR·drawPower | bows/crossbows, quivers, bracers, aim gear |
| **Scout** | DEX/PER + LOW weight | moving+sight | stealth `clamp(1+(70-wt)·.015)·clamp((DEX-8)·.1)·moving`, movement_speed, vision_range | sling/dagger, LIGHT+QUIET kit, night-sight |
| **Artisan** | INT/DEX | manip+sight+consciousness | `*_quality`/`*_speed` (SKILL-driven ×(manip+sight+consc)/3) | tiered crafting tools, work apron |
| **Medic** | INT (+CON) | manip+sight+blood_filtration | caretaking_quality (INT·SKILL); self heal_rate `1+(CON-10)·.05`×blood_filtration | physician's kit + wound medicines |
| **Face** | CHA | **talking** (jaw) | trade/oratory/beauty/prestige — **CHA touches NOTHING else** | prestige regalia, circlets, gem stat-rings |
| **Mage** ⭐NEW | INT | manipulation+sight | arcane staff dmg = base·INT/10 (`ember/frost/spark → pyre/rime/tempest`); no spell system yet | staves, mage robes, INT gear |

## Audit 1 — STAT REQUIREMENTS (do stats gate/enable each build?) — mostly SOUND
- [x] Combat stats map cleanly to STR/DEX/CON/PER (see table). Ranged is a deliberate 2-axis split: **PER = precision**
      (aim_accuracy, aim_range), **DEX = cadence** (aim_speed, reload). Crossbow/sling are `strScaled:false` (ignore STR);
      self/war bow ride STR·drawPower — so a marksman genuinely wants PER **and** some STR, a crossbowman pure DEX+PER.
- [x] Heavy weapons carry a STR `wieldRequirement` (14–24); under it → the staged `overmatched` condition. This is the
      real stat GATE that makes STR matter for bruisers/tanks.
- [ ] **GAP — CHA is a dead-end stat.** No work category, `combatMods`, or `workSpeed` reads CHA; it feeds only
      trade/oratory/beauty/prestige — all social, all ×`talking`. The Face build is "supported" only as far as those four
      social stats are used. **Decision needed (see below): give CHA a real sink or accept Face = pure social.**
- [ ] **GAP — no Wisdom, so Medic/Mage/Marksman "wisdom/faith/perception" intuition all collapse onto INT/PER.** Fine,
      but INT is overloaded (artisan + medic + mage + research). Consider whether Medic should key partly off a *skill*
      (caretaking) rather than raw INT so it's not just "the smart pawn heals best."
- [ ] Manipulation + sight are shared chokepoints for Marksman AND Artisan AND Mage — an arm/eye wound guts three builds
      at once. Intended (realism), but note it when balancing wound frequency.

## Audit 2 — TRAITS (does each build have perks that reinforce it?)
Rating = count + whether ungated (personal, not lineage/cultural-locked). Assignment is ~random (no per-trait pick).

| Build | Support | Notes / gap |
|---|---|---|
| Artisan | ★★★★ | Largest group — the full `*-hand`/`master-*` work-specialist ladders |
| Bruiser | ★★★★ | Full STR ladder + combos + melee combatMods (killer-instinct, whirlwind…) |
| Tank | ★★★★ | Deep CON + natural-armour lines — **but the armour half is mostly lineage-gated** |
| Duelist | ★★★ | Full DEX ladder + melee combatMods |
| Marksman | ★★½ | PER+DEX ("Dead-Shot") good; ranged combatMods only 2 rungs each + `cultural`-gated |
| **Scout** | ★★ GAP | Only `soft-tread` (+0.25) is a NON-lineage stealth trait; everything stronger is lineage-locked |
| **Face** | ★½ GAP | Good CHA ladder but CHA has no mechanical sink (Audit 1) — the number does almost nothing |
| **Medic** | ★ GAP | Only TWO positive caretaking traits (`nurturing`, `field-surgeon`); no "healer" identity/combo |

- [ ] **FILL — Scout:** add ≥2 ungated (personal) stealth/soft-step traits (a mid rung `feather-step` +0.4, an epic
      `ghost-in-the-reeds` +0.6) so a non-lineage pawn can reach a real stealth value.
- [ ] **FILL — Medic:** add a caretaking-quality mid trait + a "field-medic"/"herb-lore" combo (caretaking + herbalism),
      and a cultural `healer` identity so a culture can lean medic.
- [ ] **FILL — Face:** conditional on the CHA-sink decision — if CHA gets a real mechanic, add trait rungs that scale it
      (a `natural-leader` work/oratory boost); if not, Face stays cosmetic and we stop pretending it's a build.
- [ ] Note the built-in tensions (design them, don't fix): `str-for-dex`/`rangy`/`stocky`/`gaunt` push builds apart;
      natural-weapon traits carry an anti-Artisan/anti-Face rider (dex penalty + crafts ×0.7); armour weight vetoes
      stealth — **so a heavy-hide Tank can't be a Scout, by design.**

## Audit 3 — GEAR (build × tier grid: present ✓ / thin ~ / missing ✗)
Player-craftable only. Tiers t0 prim · t1 bronze · t2 iron · t3 steel · t4 boss.

| Build (primary gear) | t0 | t1 | t2 | t3 | t4 |
|---|---|---|---|---|---|
| Bruiser (blunt/cleave + heavy plate) | ✓ club/maul | ~ bone maul only (no metal mace) | ✓ mace/warhammer | ✓ mace/warhammer/flail/cleaver | ✓ fang_reaver |
| Tank (1H+shield, heaviest plate) | ✓ buckler | ✓ rawhide shield | ✓ iron_boss_shield | ✗ **no steel shield** | — |
| Duelist (finesse blade + light) | ✗ **none** | ✗ **none** | ✓ iron_estoc | ✓ steel_rapier | — |
| Marksman (bow/xbow + quiver) | ~ sling | ✓ self_bow | ✓ war_bow/crossbow + quivers | ✗ **no t3 bow OR quiver — hard stop** | — |
| Scout (light+quiet kit) | ✓ light limbs/body | ~ soot jerkin + rangers_hood | ✗ **no light head/gloves/boots/limbs/cloak** | ✗ **same** | — |
| Artisan (crafting tools) | ✓ | ✓ | ✓ | ✓ tiered stone→iron→steel | — |
| Medic (physician gear) | ✗ **poultice only** | ✗ | ✗ | ✗ | ✗ |
| Face (prestige regalia) | ~ | ✓ cloak/robes | ✓ circlets/torcs/gem rings | ✓ crowns/ceremonial | — |
| Mage (staff + robes) | ✗ | ✓ ember/frost/spark staff + arcane_robe (t2) | ✓ pyre/rime/tempest | ✗ **no t3 staff** | — |

**Slot × tier holes (the apparel side, feeds the soft-goods §E backlog):**
- [ ] **Boots — the headline hole:** no t0, no t3, and **no light/medium boots after t1** → Scout has no quiet footwear
      mid/late (only heavy iron_shod_boots). Add `hide_moccasins`/`bark_sandals` (t0), a light `padded_boots`/`ranger_boots`
      (t2), steel `sabatons` (t3).
- [ ] **Gloves — no t0, no t3, no light after t1.** Add t0 wraps, a light t2/t3 glove, steel gauntlets.
- [ ] **Light head above t1 = none** (t2+ is medium/heavy). Add a light iron/steel-era hood/cap for scout/mage.
- [ ] **Light limbs (arms/legs/shoulders) exist ONLY at t0** — no light-limb set mid/late for scout/duelist.
- [ ] **Cloak — no t0, no t2/t3, no dedicated STEALTH cloak** (marksmans_cloak is aim-themed). Add a quiet scout cloak.
- [ ] **Gorget = a single item ever** (iron t2). **Shield = no steel.** **bodyOuter = no player t0/t1.**
- [ ] **Weapon-family holes:** no t0/t1 SWORD; no finesse before iron (Duelist has nothing t0–t1); AXE dead-ends at iron
      (no steel axe); CLEAVER + FLAIL only at t3; no t3 RANGED at all; no metal mace at bronze.
- [ ] **Boss-themed gear is a small hand-picked set** (direwolf_warcloak, cave_bear_plate, horned_helm, fang set) — most
      bosses (dragon/serpent/raptor/spider/mammoth/hippogriff…) lack a themed craftable, though their drops exist.

## Audit 4 — LINEAGES (does a bloodline reinforce each build?)
18 lineages (trait-marker-derived, mutation trees). Not hereditary; one per pawn; steered by awakening deeds.

| Build | Lineage support | Note |
|---|---|---|
| Bruiser | ★★★★ | beast/werewolf/vampiric/dragon/colossus(+3 STR)/stoneblood |
| Tank | ★★★★ | stoneblood(+26 armour)/crustacean/dragon/colossus/amphibian |
| Duelist | ★★★ | arachnid(+2 DEX)/stormborn(+3 DEX)/shadeborn |
| Scout | ★★★ | echoborn/shadeborn/beast/farseer/amphibian/vampiric (vision+stealth) |
| Medic | ★★ | sporeborn/wildblooded/dragon — healRate only, no medic *skill* |
| Artisan | ★ | only farseer (+3 INT) |
| Face | ★ GAP | only wildblooded (+3 CHA); most lineages PENALISE CHA → net-negative |
| **Marksman** | ✗ **ZERO** | no lineage grants any ranged/aim bonus |

- [ ] **FILL — Marksman lineage:** add a raptor/hawk/"Sky-blood" bloodline (PER + aim + a wing graft that DOESN'T block
      the `back` cloak slot, or accept the trade). The whole build has no bloodline — the clearest single gap in the game.
- [ ] **DECISION — Mage bloodline:** lineages grant NO spells; magic is an INT+staff *gear/skills* track (`farseer`
      feeds it). Either (a) leave Mage as gear-only + `farseer`, or (b) add an arcane bloodline once the referenced-but-
      unbuilt MAGIC-SKILLS system lands. Recommend (a) for now — don't front-run the magic system.
- [x] Note: lineage body-parts **BLOCK** equipment slots (`blocksSlots`) — winged/furred/clawed pawns lose slots. A
      lineage is a trade, not pure upside; keep gear fills aware (a clawed bruiser can't wear gloves).

## Cross-cutting decisions (resolve before filling)
- [ ] **① Is Mage a real 9th build?** Staves exist and scale INT, so mechanically yes. But it has no spell depth (the
      MAGIC-SKILLS node system is referenced, unbuilt). **Recommend: list Mage as a build, gear-supported now, deep later.**
- [ ] **② Does CHA get a mechanical sink?** Face is the weakest build because CHA drives only social stats. Options: a
      `leadership`/`diplomacy` work category (colony-wide mood/trade/visitor outcomes), or CHA-scaled trade/recruit
      mechanics. Until then, Face is a social-layer role, not a combat/work build — **say so and stop auditing it as one.**
- [ ] **③ Marksman is the most systematically starved** — thin traits, ZERO lineages, no t3 weapon/quiver. Prioritise its
      three fills (traits rung, Sky-blood lineage, steel bow + quiver) as one coherent pass.
- [ ] **④ Scout & Medic** are the other two real gaps: Scout on GEAR (light/quiet kit t2–t3) + ungated stealth traits;
      Medic on ROLE-GEAR (physician's kit + tiered wound medicines — the AUDIT §4 medicine pass) + traits.

## Priority backlog (fill order — most-starved first)
- [ ] **P1 Marksman pass:** steel bow + steel/t3 quiver; 1–2 personal ranged combatMod rungs; a Sky-blood/raptor lineage.
- [ ] **P2 Scout pass:** light/quiet head+gloves+boots+limbs+cloak at t2–t3; ≥2 ungated stealth traits.
- [ ] **P3 Medic pass:** physician's/surgeon's kit (tool=speed) + wound-specific tiered medicines (AUDIT §4); healer traits + cultural identity.
- [ ] **P4 Face decision + fill:** resolve CHA-sink (decision ②); if yes, CHA work category + trait rungs.
- [ ] **P5 Slot/family evenness:** fill the sword/finesse/axe/cleaver/flail tier holes + the boots/gloves/gorget/shield gaps; one themed craftable per remaining boss. *(Copper tool rung added 2026-07-26; copper WEAPONS still thin — only `copper_dagger`.)*
- [ ] **P6 Harvest tool-axis — metal SCYTHES** (tracked 2026-07-26, user idea): a scythe line (copper→iron→steel) trading yield for SPEED that **sweeps 3 grass tiles per swing** for fast hay — the mirror of the sickle (yield over speed). The scythe *claps* yield on non-grass so it can't harvest crops until a high tier where it "redeems itself"; both scale up sharply with tier. Needs 3 new harvest mechanics: **(a) multi-tile harvest** (one job clears 3 adjacent grass tiles — today it's one tile/job), **(b) target-dependent yield** (`toolBoost` is flat; scythe yield depends on grass vs crop), **(c) a type gate that lifts by tier**. A focused `harvest.ts` pass + a scythe tool line — its own increment, not a data add.

## Acceptance (how we know builds are "intentional")
- [ ] Every build has ≥1 viable weapon + armour set + role-tool at EVERY reachable tier (the Audit 3 grid has no ✗ in a build's core row), OR the gap is a documented deliberate choice.
- [ ] Every build has ≥3 ungated supporting traits a player can plausibly roll toward via culture+background.
- [ ] Every COMBAT build has ≥1 lineage that reinforces it (Marksman's zero is closed).
- [ ] The CHA-sink + Mage decisions are made and reflected in the build list (no phantom builds).
