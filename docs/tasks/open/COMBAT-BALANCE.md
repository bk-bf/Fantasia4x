<!-- COMBAT-BALANCE — the two-axis stat rebuild plus the logic errors the tier-4 audit turned up
     (findings 2026-07-27, design settled 2026-07-27). Findings live in the archived AUDIT § Weapons; this file
     is the WORK. Every task carries the measurement it came from, so a fix can be checked against the
     same number that justified it. -->

# COMBAT-BALANCE — The Two-Axis Stat Rebuild

> **Related:** [AUDIT § Weapons (archived)](../archive/AUDIT-2026-08-25.md) · [DESIGN](../../game/DESIGN.md) · [DECISIONS](../../game/DECISIONS.md) · [ROADMAP](ROADMAP.md) · [STEALTH](STEALTH.md)

**Status (2026-07-27):** **Phases 0–3 are DONE.** The core stats set damage capacity and nothing else,
the six secondary stats are rolled per pawn and surfaced in the pawn panel, and precision aims for
lethality. Every headline finding is fixed and re-measured in a live fight; see
[Live-sim verification](#live-sim-verification).

**Remaining:** Phase 4 only (tasks 12–14: the cadence floor, the deferred trait audit, the data
passes), plus two loose ends — `applyGainedTrait` still doesn't stamp wound traits, and aptitudes are
not yet persisted through save/load. Phases 0–3 are complete.

Also landed as a prerequisite: a core-stat vocabulary pass across the engine, data files and the
creature schema; the stats are named `strength`, `dexterity`, `constitution`, `perception`,
`intelligence`, `charisma`. Four engine fixes landed in the original audit pass (power-curve soft
cap, armour-condition soak, `powerStat`, `critMultiplier` + the heavy-2H accuracy/speed pass) — logged
in [AUDIT § Weapons (archived)](../archive/AUDIT-2026-08-25.md).

**How every number below was produced.** Five harnesses; the distinction matters when checking a fix:

| harness | what it drives | evidence class |
| --- | --- | --- |
| `src/tests/game/systems/combatBalanceAudit.test.ts` | **the findings themselves** — `HeadlessSession`, drafted colonist vs a live Orc Reaver, mean of 8 seeds, real command path | headless — `[x]` |
| `src/tests/game/systems/weaponFightSim.test.ts` | `HeadlessSession`, 1v1 weapon comparison, mean of 8 seeds | headless — `[x]` |
| `src/tests/game/systems/statAxisProposal.test.ts` | the two-axis model against the shipped math; real `resolveHit` damage kernel, modelled to-hit / cadence / part selection | analytical — `[~]` |
| `src/tests/game/systems/t4WeaponAudit.test.ts` | real `resolveHit` + real cadence, every T4 weapon × 5 stats × 113 traits × 3 opponents | analytical — `[~]` |
| `src/tests/game/systems/weaponStatSweep.test.ts` | real `resolveHit`, defence matrix / precision / proposal pricing | analytical — `[~]` |

A balance claim is only `[x]` when a **fight** shows it. A sweep number is a supplement.

<a id="live-sim-verification"></a>

## Live-sim verification — 2026-07-27

`combatBalanceAudit.test.ts`, 8 seeds per row, one drafted colonist vs one `orc_reaver`, needs frozen,
flat map, `seedEntities: false`, fight driven by an explicit draft order. Its five assertions were
written to pin the BUGS; each has been inverted as its task landed, so a green run now means the fixes
hold.

| finding | task | before | after the fix |
| --- | --- | --- | --- |
| the power stat is decoration | 4 | STRENGTH 40 → 6345 ticks, 4/8 kills, 3 deaths, 73% blood left · DEXTERITY 40 → **3365 ticks, 7/8 kills, 1 death** | STRENGTH 40 → **3763 ticks, 6/8 kills, 2 deaths, 49% left** · DEXTERITY 40 → 10838 ticks, 1/8 kills, 6 deaths. The STRENGTH build is **2.88× faster** on the weapon that names STRENGTH |
| a flaw raises its stat | 1 | `frail`+`clumsy`+`dull` → constitution 12→**14**, dexterity 12→**14**, intelligence 12→**14** | → constitution 12→**10**, dexterity 12→**10**, intelligence 12→**10** |
| precision is inverted | 11 | stiletto + `lumbering-fighter` **0.96×** the unimpaired time-to-kill — a strict downgrade was free | **1.03×** — it costs time now, and `aimedBodyPart` was rewritten too: killing-hit share now **rises** with precision (71.6% → 74.7%, the neck appearing at the top end) where it used to **fall** 54% → 45% |
| session determinism | 2 | same seed replays identically | unchanged; the module default seed is now fixed too |
| 1H out-damages 2H | 12/12a | 1H+shield 110–140% of a two-hander; duel grip free to every pawn | **kill speed 2H 1070t · duelist 1277t · shield 1488t**, with **deaths 3/8 · 3/8 · 0/8** — the intended order, offence and defence traded against each other |
| decoupling | 8–9 | every secondary stat tracked a core stat | core stats 10 → 60 leaves all six **identical**; two pawns with the same physique now differ |

> **What the fix actually was.** Dexterity used to buy four things at once — damage on its own weapons,
> cadence, to-hit and crit — so it out-earned every other stat everywhere and the weapon's named power
> stat was decoration. Damage now resolves through `melee_damage`/`ranged_damage` (so `× manipulation`
> applies and injury finally costs damage), the weapon's GRIP names which core stat feeds it, and
> cadence/accuracy/precision/armour-damage/evasion/marksmanship are per-pawn rolls that no core stat
> touches. The analytical harness agrees: **the named power stat now loses on 0 of 16 tier-4 weapons**
> (was 6 of 16, all two-handers).

> **Measurement trap, recorded because it nearly inverted a conclusion.** Averaging time-to-kill over
> the runs that *killed* is censored data: it silently drops the worst runs of whichever build fails
> most. On the first pass the STRENGTH build looked **3× faster** because 4 of its 8 runs never landed a
> kill and were excluded. Counting a non-kill as the full tick budget — and reading **blood removed**,
> which every run contributes to — reverses it to DEXTERITY being 1.89× faster and removing 2.9× the
> blood. Any future fight-sim comparison must right-censor and report kills *and* deaths.

---

## The design

The core stats decide **how hard a pawn can hit**. A separate, per-pawn rolled axis decides **how well
it fights**. Both are scaled by the body that carries them.

### Axis 1 — Physique: the core stats set damage capacity, and nothing else

Damage always resolves through the `melee_damage` / `ranged_damage` stats, never from a raw core stat,
because those stats carry the `× manipulation` term — a mangled arm has to cost damage output. Which
core stat feeds them is decided by the **grip**, so the physique picks the *weapon*, not the build:

| weapon | scales on |
| --- | --- |
| two-handed melee | **STRENGTH** |
| one-handed melee | **DEXTERITY** |
| ranged | **PERCEPTION** |
| rapier / finesse line | **PERCEPTION** (the standing special case) |
| arcane staff / rod | **INTELLIGENCE** |
| banner polearm (new) | **CHARISMA** — raises the bearer's `prestige` |

No physique is locked out of a weapon family, because each family ships in both grips: a strong pawn
takes the family's two-hander, a nimble pawn its one-hander. Task 7 closed the last gaps — the flail
line gained a two-hander and the runed tier gained a one-handed sword. Only the light blades (dagger,
rapier) are one-grip, which is what they are.

### Axis 2 — Aptitude: the same stats, sourced from the pawn instead of its stats

`hit_chance`, `attack_speed`, `hit_precision`, `armor_damage`, `dodge` and `aim_accuracy` keep their
ids, their descriptions and their place in `stats.jsonc`. What changes is **where the number comes
from**: a per-pawn roll, modified by traits and body size, still multiplied by the capacity terms.
Nothing is renamed — the stat block a player reads is the same one, it just stops being a function of a
core stat.

All six move, so **no core stat buys combat performance anywhere**: DEXTERITY stops buying evasion and PERCEPTION
stops buying marksmanship, which are the last two channels through which a damage stat could still pay
for something other than damage. `dodge` keeps its body-weight term (mass is physique, not aptitude)
and `block` stays derived — it is CONSTITUTION, body mass and the shield, none of which are skill.

This is what makes two pawns with identical STRENGTH/DEXTERITY play differently, and it is what the current system
cannot express at all: a 40-STRENGTH pawn that rolled badly is a hard hitter who cannot land a blow.

### What this is not

Not a stat-count increase. The combat block goes **15 → 14**: one stat is deleted (`vision_range`,
superseded), three dead ones are wired rather than removed, and six change their source. The pawn
gains six rolled numbers.

---

## Phase 0 — Unblock the measurements  ✅

Do these first; every tuning number after them is only as good as the RNG and the trait bake.

### 1. Accept signed stat grants — every `*Penalty` currently RAISES its stat

- [x] Re-author penalties as **signed bonuses** in `traits.jsonc` (`"dexterityBonus": -5`), dropping the `*Penalty` key entirely — 68 traits.
- [x] Collapse both bake paths to one signed add with no key-suffix branch: `applyCulturalTraitBonuses` ([Pawns.ts:867](../../../src/lib/game/entities/Pawns.ts)) and `applyGainedTrait` ([Pawns.ts:272](../../../src/lib/game/entities/Pawns.ts)).
- [x] Keep the `max(1, …)` floor so a stacked flaw can't drive a stat to zero or negative.
- [x] Re-point the pinning test (`t4WeaponAudit` → "every `*Penalty` RAISES its stat") at the corrected behaviour — it pins the BUG on purpose today so it can't change silently.
- [x] Re-run the trait sweep and confirm the negative twins invert.
- [ ] **Also in this bake path:** `applyGainedTrait` never stamps a `wound`-kind trait's injuries — `applyTraitWounds` is a separate function that only generation calls. A pawn who gains `one-armed` at runtime (growth event, trait gamble, `devSetPawnTraits`) keeps both arms. Decide whether that is intended (wounds are generation-only) or a hole.

> **Evidence — headless `[x]`.** Through the real command path in a live session, `frail` + `clumsy` +
> `dull` moved constitution **12→14**, dexterity **12→14**, intelligence **12→14**. Three flaws, three upgrades
> (`combatBalanceAudit` → #1).
>
> All penalty entries are authored positive and both bake paths do `stats[k] = max(1, stats[k] + value)`.
> A flaw scores identically to its blessing in the sweep: `str-dex-minus-5` **+45.4%** vs
> `str-dex-plus-5` +45.4%; `accursed-blood-5` (epic, all-penalty) **+49.1%**.
> **68 traits author a `*Penalty`; 0 author a negative `*Bonus`**, so the migration cannot double-negate
> anything already shipped (`statAxisProposal` → SIGNED STAT GRANTS).
>
> ⚠ **Blast radius:** moves every stat on every pawn. The save cost is **already paid** — the
> vocabulary migration broke old saves, so this no longer adds a separate break. Still re-check
> encounter pacing after it lands.

### 2. The sim RNG defaults to a non-deterministic seed

- [x] `new SeededRng()` falls back to `Date.now() ^ Math.random()` ([rng.ts:52](../../../src/lib/game/core/rng.ts)) — decide whether the module singleton should default to a fixed seed instead.
- [x] Reseed in `lairEscalation.test.ts` (fails ~1 run in 3 in isolation).
- [ ] Sweep the suite for other tests that drive sim code without reseeding.

> **Scope, narrowed headless.** A scenario that pins its seed **does** replay identically — the same
> spec ran twice produced the same 680 ticks and the same 0% blood (`combatBalanceAudit` → #2). So the
> defect is confined to code paths that construct an RNG without a seed, not to the sim trajectory
> itself. Every fight number in this file is reproducible as it stands.

---

## Phase 1 — Damage resolves through the stats  ✅

This is the fix for "melee ignores injury" **and** the fix for the power stat being decoration. One
change: `resolveHit` stops reading a raw core stat and reads the damage stat instead.

### 3. Wire `melee_damage` / `ranged_damage` as the damage path

- [x] `resolveHit` replaces `baseDamage × powerScale(powerStat)` with `baseDamage × evaluateStat('melee_damage' | 'ranged_damage', attacker)` ([Combat.ts:988](../../../src/lib/game/systems/Combat.ts)).
- [x] Add a `POWER` token to the formula evaluator, resolving to the equipped weapon's power-stat value — the same mechanism `SKILL` already uses for the work stats, so no new concept.
- [x] Rewrite both formulas against it: `(1.0 + (POWER − 10) × 0.01) × manipulation`.
- [x] Decide where the soft cap lives — cleanest is for `POWER` to resolve to `powerScale(stat) × 10` so the damping stays in one place and the formula stays linear (`clamp` is the only function the evaluator supports).
- [x] Keep the `strScaled: false` bypass for crossbow/sling — the mechanism supplies the force, not the shooter.
- [x] Regression test: a pawn with a mangled arm must deal less melee damage than an unhurt one.

> **Evidence.** `evaluateStat('melee_damage')` and `evaluateStat('ranged_damage')` have **zero
> callsites** outside tests. Damage comes from `powerScale` on the raw stat, so **`manipulation` does
> not affect melee damage at all** — a pawn with a mangled arm hits exactly as hard as an unhurt one,
> while the stat description promises otherwise.

### 4. Set each weapon's power stat by its grip

- [x] Sweep `items.jsonc`: `powerStat: "strength"` on every two-handed melee weapon, `"dexterity"` on every one-handed melee weapon.
- [x] Leave the finesse/rapier line on `"perception"` and the arcane line on `"intelligence"`.
- [x] Ranged: `"perception"` — and confirm it doesn't double-count with `aim_accuracy`, which is already PERCEPTION.
- [x] Acceptance: each weapon's own power stat is its best stat, across all three opponent profiles.

> **Evidence — headless `[x]`.** Same 2H greataxe, a weapon whose power stat is STRENGTH, 8 seeds each:
>
> | build | time to kill | kills | deaths | blood left |
> | --- | --- | --- | --- | --- |
> | STRENGTH 40 / DEXTERITY 10 | 6345 ticks | 4/8 | 3 | 73% |
> | STRENGTH 10 / DEXTERITY 40 | **3365 ticks** | **7/8** | **1** | **21%** |
>
> The DEXTERITY build is **1.89× faster, removes 2.9× the blood, kills nearly twice as often and dies a
> third as often — on the two-hander** (`combatBalanceAudit` → #4). The power stat is not merely weak,
> it is the wrong stat to buy.
>
> **Analytical `[~]`.** The named power stat loses on **6 of 16** tier-4 melee weapons — **6 of 8
> two-handers, 0 of 8 one-handers**. Warhammer STRENGTH-40 **20.8** vs DEXTERITY-40 **23.8**; greatsword 12.9 vs
> 13.3. The mechanism is the cadence floor: a 0.55-speed greataxe sits far below the 1.67× ceiling so
> every DEXTERITY point still buys swings, while a 0.9-speed mace is already capped and DEXTERITY's biggest channel
> is dead there. **DEXTERITY pays more the slower your weapon is** — so it steals exactly the weapons STRENGTH is
> supposed to own.
>
> Modelled with damage on the grip: **16 of 16** answer to the physique their grip names, and the
> warhammer inversion reverses to **17.2 STRENGTH / 6.2 DEXTERITY** (`statAxisProposal` → ADOPTED).

### 5. Fold `hit_chance` into the melee to-hit roll

- [x] `resolveHit`'s `toHit` reads `evaluateStat('hit_chance', attacker)` instead of raw, condition-scaled `dex` ([Combat.ts:925-931](../../../src/lib/game/systems/Combat.ts)), so `× sight × manipulation` finally applies.
- [ ] Regression test: a blinded pawn must land fewer melee blows than an unhurt one.
- [x] Re-check the ranged path is unaffected — `aim_accuracy` already applies both capacities, so melee is the outlier, not ranged.

### 6. Delete `vision_range`

- [x] Nothing reads it; `core/vision.baseVisionRange` returns TILES from raw PERCEPTION and is shared by pawns and mobs. Remove the formula rather than leave a documented stat that does nothing.
- [x] Check the pawn stat panel and `/gear-db` → Stats by build for references before removing.

### 7. Data: the gaps this mapping exposes

- [x] **2H flail authored** — `steel_greatflail` (T3) and `rune_lashing_greatflail` (T4), both strength-scaled, with recipes. Every melee family now ships in both grips.
- [x] **Banner polearm authored** — `rune_standard_glaive`: reach 2, `powerStat: "charisma"` (CHARISMA joined `PowerStat`), and `prestigeBonus: 9`. `computePrestige` now reads a top-level `prestigeBonus` so a WIELDED standard counts, not only worn regalia.
- [x] Runed 1H sword authored — `rune_etched_arming_sword`, dexterity-scaled. The nimble sword line reaches T4.

---

## Phase 2 — The aptitude axis  ✅

Only after Phase 1, so the damage axis is already honest when the second axis lands on top of it.

### 8. Roll and store aptitudes

- [x] Add `pawn.aptitudes` — a small record keyed by the same stat ids, rolled beside `rollStatsFromRanges` ([Pawns.ts:811](../../../src/lib/game/entities/Pawns.ts)).
- [x] Roll **independently of the core stats** — a stat-biased roll re-introduces the DEXTERITY correlation through the side door.
- [x] Triangular distribution over the band so an extreme aptitude is rare, not one roll in three.
- [x] Modify by body size and traits at generation; let the existing growth events move them.
- [x] Decide the band. ⚠ At ±0.25 on `hit_chance` + `attack_speed` + `hit_precision` together the swing is **+95%** — too wide. Either narrow the band or stop the three compounding.
- [ ] Persist through save/load; decide the default for pawns in existing saves (1.0 across the board is the safe migration).

### 9. Re-source the six aptitude stats

- [x] `hit_chance`, `attack_speed`, `hit_precision`, `armor_damage`, `dodge`, `aim_accuracy`: formula reads the pawn's rolled aptitude instead of a core stat, still `×` its capacity terms.
- [x] Keep every id, name and description — this is a source change, not a rename.
- [x] `dodge` keeps its `− (weight − 70) × 0.002` term: mass is physique, and a heavy pawn should still evade worse however well it rolled.
- [x] Leave `block` derived (CONSTITUTION + body mass + shield) — none of those three is skill.
- [x] Acceptance: two pawns with identical core stats produce measurably different dps AND different survivability, and **no core stat correlates with hit rate, cadence, crit, evasion or marksmanship**.

> **Evidence.** Modelled on the rune-graven spear vs an armoured target: a 40-DEXTERITY pawn with a bad roll
> (**8.1**) loses to a **16-DEXTERITY** pawn with a good one (**8.4**), while a 40-DEXTERITY pawn who also rolled
> well leads at **17.4**. Aptitude tilts the result without replacing the physique
> (`statAxisProposal` → APTITUDE AXIS).

### 10. Surface it in the UI

- [x] Pawn panel: `PawnAptitudes.svelte` renders the six rolls under the core stats on the Attributes tab, as signed percentages with a band tick and a plain-language label (accuracy / cadence / precision / leverage / evasion / marksmanship — never the stat id).
- [x] **Fixed two rename regressions the tab had been carrying:** `statView` still substituted the OLD `STR`/`DEX` tokens, so NO core stat resolved in ANY formula tooltip; and `PawnStatBanner`'s trait lookup keyed `STR`/`DEX`, so trait contributions rendered blank.
- [x] `POWER` and `APT` surfaced in the formula tooltip — `POWER = 20 (strength 25, damped)`, `APT = 1.09 (rolled)` — verified in the running game, not just in a test.
- [ ] `/gear-db` → **Stats by build**: re-point the "read by" column once the wiring changes, and drop the `✕ dead` markers the fixes clear.

---

## Phase 3 — Precision does what its description says  ✅

### 11. Aim for lethality, not for bare skin

- [x] `aimedBodyPart` scores candidates by **what the part contains** (`organsOf` → `isVital` / `artery` / `isCritical`) plus `bleedRatio`, with armour as a **discount** rather than the whole criterion ([Combat.ts:795](../../../src/lib/game/systems/Combat.ts)).
- [x] Let precision buy **candidate rolls** — fractional, so it pays smoothly. The shipped rule always rolls exactly 3 behind a probability gate, so a small target (the neck is 1.5% of the hit table) is almost never found however precise the fighter is.
- [x] Re-run the fight sim; `lumbering-fighter` on a stiletto is no longer an upgrade (ratio 1.03×, was 0.96×).

> **Evidence — headless `[x]`.** Stiletto, 8 seeds: unimpaired **2615 ticks / 9% blood left**, with
> `lumbering-fighter` (attack_speed ×0.6 **and** hit_precision ×0.75) **2510 ticks / 7% left** — ratio
> **0.96×**. A strict, unambiguous downgrade costs the fighter nothing (`combatBalanceAudit` → #11).
> Milder than the ×1.94 the original single-weapon run showed, same direction; treat ×1.94 as the noisy
> number and 0.96× as the calibrated one.
>
> **Analytical `[~]`.** Real `resolveHit`, stiletto vs mail hauberk + nasal helm: blows landing somewhere
> that can kill **fall** from **54.1%** at precision 0.053 to **44.7%** at 0.317 — precision currently
> makes a dagger *less* lethal, because scoring by armour alone walks the blow off the covered chest onto
> a bare thigh. Dividing by armour is the error: on an armoured target the lethal parts ARE the covered
> ones.
>
> Modelled with the fix, over the same precision range: **64.9% → 85.1%**, with neck and groin
> appearing at the top end (`statAxisProposal` → PRECISION FIX). The anatomy already carries every flag
> needed — no data authoring.

---

## Phase 4 — Re-evaluate what is left

### 12b. Build fit: does generation serve the builds, and does fitting one pay?

`src/lib/dev/buildFit.ts` grades a pawn against eight build profiles (weighted over the core stats
their grip names + the aptitudes they lean on) and tiers the fit F–S. `buildFitAudit.test.ts` runs it
over **300 pawns from 12 cultures through the real generation path**, then fights the best- and
worst-fit pawn of each build with its own weapon and with a weapon from a melee build it fits worst.

> **GENERATION is lopsided.** Three builds take 76% of the population:
>
> | build | share | | build | share |
> | --- | --- | --- | --- | --- |
> | Battlemage (1H Staff) | 26.3% | | Assassin (Dagger) | 8.7% |
> | 2H Hammer | 25.3% | | Greatsword (2H) | 5.7% |
> | Archer (Bow) | 24.0% | | Fencer (Rapier) | 4.7% |
> | | | | Mace & Shield | 3.7% |
> | | | | **Sword & Shield** | **1.7%** |
>
> ⚠ **Caveat, not yet controlled for:** a profile demanding TWO stats (2H Hammer: strength+constitution) is
> easier to score high on than one demanding THREE (Sword & Shield: dexterity+constitution+strength), so some of
> that spread is the grading formula, not the roller. Normalise by profile concentration before
> treating the shares as a generation bug.
>
> **Pawns are generalists.** Median gap from the best build to the runner-up is **0.037** (p90 0.142,
> max 0.302) — for most pawns the "best fit" is nearly a coin-toss between several builds. Whether
> that is the wanted shape is a design call.
>
> **The tier ladder works; build identity only half works.** Best-fit beats worst-fit on the same
> weapon in **every** melee build (2H Hammer S 13.5 vs F 7.3; Greatsword A 8.6 vs F 4.7). But
> in-build beat out-of-build in only **8 of 12** cases — an S-tier Assassin does **6.3** with its
> stiletto and **7.2** with a warhammer it is a bad fit for (0.88×), and both Sword & Shield rows lose
> to the hammer too. The warhammer being the answer to everything is task 14's finding, arriving here.

- [ ] Normalise the fit score by profile concentration, then re-read the generation shares.
- [ ] Decide the intended specialisation: should the median pawn be a generalist (0.037 gap) or should generation push harder toward one build?
- [ ] Fix the cases where a build loses to a weapon it should not hold (Assassin, Sword & Shield vs the warhammer) — blocked on task 14's warhammer re-rate.
- [ ] Then re-read task 12 below with these numbers in hand.


Everything here was measured against the OLD stat economy and has to be re-measured once Phases 1–3
land; several may resolve on their own.

### 12a. 1H out-damages 2H, and the Duelist grip is not gated at all

- [ ] **The design intent** (owner, 2026-07-28): a one-hander is *supposed* to be weaker — you play shield+1H as a DEFENSIVE style, or duelist, which approaches 2H damage but is **trait-gated**. Neither holds today.
- [ ] `getGrip` ([rangedCombat.ts:115](../../../src/lib/game/systems/rangedCombat.ts)) returns `duelist` for ANY one-hander with an empty off-hand — the +20% damage / +10% pen / +5% crit is free. **There is no duelist trait in `traits.jsonc`.** Author one and gate the grip on it.
- [ ] Bring the styles into the intended order. Measured today at strength/dexterity 40 vs a mail-clad dummy:

> | style | dps | vs the best 2H |
> | --- | --- | --- |
> | 2H greatsword | 8.5 | 55% |
> | 2H greataxe | 9.0 | 58% |
> | 2H warhammer | 15.4 | 100% |
> | 1H longsword + shield | 12.3 | 80% |
> | 1H longsword duelist | 15.9 | **104%** |
> | 1H mace + shield | 16.9 | **110%** |
> | 1H mace duelist | 21.7 | **141%** |
>
> The *defensive* style out-damages every two-hander, and the ungated duelist grip beats the best one
> by 41%. "Buff the duelist to 80% of a 2H" cannot be applied as stated — from 104–141% that is a
> nerf, and it presumes 2H is the ceiling, which it is not. The order has to be: make 2H the ceiling
> (task 12 — close the 2H swing-rate deficit), THEN set the duelist multiplier against it.

### 12. Two-handers lose on SWING RATE  ✅

**Diagnosis, re-derived twice** (the earlier readings — the cadence *floor*, then the accuracy penalty
alone — were both wrong). Measured at strength/dexterity 40, `dmg/swing` already NET of the hit rate:

| head-to-head | per-swing | cadence | net |
| --- | --- | --- | --- |
| Greatsword vs Longsword | 1.21× | **0.59×** | **0.72×** |
| Warhammer vs Mace | 1.17× | **0.76×** | **0.89×** |

The two-hander survived its accuracy penalty and still won the per-swing exchange by ~1.2×. It lost
because 0.55–0.68 `attackSpeed` against 0.90–1.00 is a 1.7× deficit a 1.2× damage premium cannot
cover. **The 72-tick floor was never involved** — it engages at `attack_speed ≥ 1.667` and 0 of 38
tier-3+ melee weapons reach it at aptitude 1.0 (2 at the top of the ±15% band). Rolling cadence into an
aptitude removed the ×1.9 multiplier that used to make the floor matter.

**FIXED 2026-07-28 — a bit of all three levers, not one.** The speed and accuracy debuffs on
two-handers were added to nerf them under the OLD stat system, where they were the stronger option.
That premise inverted, so the debuffs were unwound rather than compensated for:

- [x] **2H speed ×1.28** — mean `attackSpeed` 0.72 → **0.92**.
- [x] **2H accuracy +7, capped at 0** — the −8/−10 band becomes −1/−3; mean −4.15 → **−0.82**.
- [x] **2H damage ×1.15** (damage, damMin, damMax together).
- [x] **1H speed ×0.82** — mean 1.02 → **0.89**. Light blades (dagger/rapier, 11 weapons) EXEMPT: their speed is their identity and the dagger build is meant to be compensated by crit, not throughput.
- [x] 34 two-handers and 43 one-handers swept.

> **Result, measured on aggregate across every tier-3 melee weapon** (mean dps, both a bare and a
> mail-clad target, so an anti-armour weapon can't flatter the average):
>
> | target | 2H | 1H + shield | 1H duelist | light-blade duelist |
> | --- | --- | --- | --- | --- |
> | armoured | 17.83 | 9.98 (**56%**) | 13.97 (**78%**) | 5.67 (32%) |
> | bare | 21.72 | 13.44 (**62%**) | 17.49 (**81%**) | 11.93 (55%) |
>
> Against the design target — one-hander at ~60% of a two-hander, duel grip buying it back to ~80%.
>
> **⚠ The bench and the fight disagree, and the fight is right.** Re-audited headless (8 seeds, drafted
> colonist vs a live orc reaver), the shield build *wins the encounter outright*: 1488 ticks, 8/8
> kills, **0 deaths**, against the two-hander's 3803 ticks, 6/8, **3 deaths**. Backing the censoring
> out shows why the two readings differ:
>
> | style | kill speed (runs that killed) | deaths |
> | --- | --- | --- |
> | 2H greatsword | **1070t** | 3/8 |
> | 1H + duelist | 1277t | 3/8 |
> | 1H + shield | 1488t | **0/8** |
>
> The two-hander DOES kill fastest and the duel grip DOES sit between — the damage calibration holds.
> What the dps bench cannot see is that the shield converts its damage deficit into never dying, and in
> a 1v1 that is worth more than swinging harder. Whether that is correct is a design call: it may be
> exactly right (a duel rewards defence) and only show its cost in a multi-enemy fight where the
> two-hander's throughput matters. **Do not "fix" it by nerfing the shield without testing a group
> fight first.**

- [ ] ⚠ **The warhammer line is now further out of band**, not less: 30.8 dps armoured against a 2H mean of 17.8, with the next-best at 20.4. The uniform +15% amplified it. This is task 14 and it now distorts every 2H average — do it next.

### 12a. The Duelist grip  ✅

- [x] **Authored a real `duelist` trait** (personal, rare) in `traits.jsonc`.
- [x] **Gated `getGrip` on it** ([rangedCombat.ts:115](../../../src/lib/game/systems/rangedCombat.ts)). It previously returned `duelist` for ANY one-hander with an empty off-hand, handing every pawn in the game +20% damage / +10% pen / +5% crit for free — never intended, and the opposite of a gated specialisation.
- [x] **`DUELIST_DAMAGE_MULT` 1.2 → 1.28**, calibrated so the style lands at ~80% of a two-hander while shield-and-one-hander sits at ~60%.

### 12c. Shields were FREE — the carry curve had drifted  ✅ 2026-07-28

The earlier style comparison put both pawns in NO armour, the one configuration where the shield is
guaranteed to look best. Re-run as a KIT audit (`armourStyleAudit.test.ts`, every style × every armour
class, 6 seeds, live orc reaver) the picture changes and the premise collapses.

- [x] **Block now scales with the incoming blow's force.** `blockChance(defender, ranged, incoming)`: a shield turns a glancing cut aside easily and a descending maul barely at all. Reference force scales with the shield's own `blockBonus`, so a boss shield stops what a buckler does not. Bounded 0.35–1.4× so nothing is unblockable or auto-blocked.
- [x] Kit audit built and run.

> | kit | encounter | kill speed | outcome |
> | --- | --- | --- | --- |
> | 2H greatsword · light | 1500t | 1500t | 6/6 kills · 2 deaths |
> | 2H greatsword · medium | 1600t | 1600t | 6/6 kills · 2 deaths |
> | 2H greatsword · heavy | 4433t | **650t** | 4/6 kills · 2 deaths |
> | 1H+shield · light | 2770t | 2770t | 6/6 kills · 1 death |
> | 1H+shield · medium | 2780t | 2780t | 6/6 kills · 1 death |
> | **1H+shield · heavy** | **1343t** | 1343t | **6/6 kills · 0 deaths** |
> | 1H duelist · light | 3120t | 1344t | 5/6 kills · 2 deaths |
> | 1H duelist · medium | 3067t | 1280t | 5/6 kills · 2 deaths |
>
> **1H+shield+heavy is the best kit on every axis at once** — fastest encounter, most kills, no deaths.
>
> **The reason: encumbrance never fires.** The design assumes a shield user must drop to light/medium
> armour because the shield eats the weight budget. Measured:
>
> | kit | worn | carry cap | condition | dodge |
> | --- | --- | --- | --- | --- |
> | 2H + heavy plate | 30.0kg | 35.7kg | `comfortable` | **0.83** |
> | 1H + shield + heavy plate | 33.9kg | 35.7kg | `comfortable` | **0.83** |
>
> The shield pawn wears full plate AND carries a shield, stays under budget, and takes **identical
> dodge** to the two-hander. The shield costs nothing. So shields are not "a bit too strong" — they are
> FREE, and no shield-side tuning is meaningful until the weight actually bites.

- [x] **FIXED — the carry curve was the mechanism, and it had drifted.** Shields and weapons were already counted (`getCurrentCarryLoad` sums `pawn.equipment`); the defect was entirely on the capacity side, and `carryCapacityAudit.test.ts` found two:
  - `loadFraction = clamp(strength × 0.012, 0.05, 0.3)` **bound at strength 25**. 28% of the population sat at that clamp, and above it strength bought nothing — a strength-100 pawn carried exactly what a strength-25 pawn did. That is the 1–100 stat-expansion drift.
  - capacity was `bodyWeight × loadFraction`, so with a **median bodyweight of 108kg** the budget was decided by how HEAVY a pawn was, not how strong. Being fat was the carrying stat.
  - Replaced with `(3 + strength × 0.85) × frameFactor`, where `frameFactor = clamp(bodyWeight/80, 0.85, 1.15)` — strength sets the budget, the frame only modulates it.

> | | before | after |
> | --- | --- | --- |
> | plate + shield + sword unencumbered | **32%** of all pawns | **2%** |
> | capacity, strength 25 → 100 | 21.0kg flat | 21.2 → 84kg, no cap |
> | median capacity | 21.8kg | 19.9kg (hauling throughput preserved) |
> | p95 capacity | 61.2kg | 32.8kg (mass outliers gone) |
>
> **Kit audit re-run:** `1H+shield · heavy` fell from **1343t / 0 deaths — best on every axis** to
> **2317t / 1 death**, and the fastest kit is now `2H greatsword · light`, ending the encounter in
> 1500t. The two-hander ends fights soonest, the shield survives them best. The trade exists now.
- [ ] Note that `2H greatsword · heavy` ends the encounter in **660t** — by far the fastest in the table — but converts only 4/6. Once encumbrance bites, check whether that becomes the intended glass-cannon shape rather than a coin flip.
- [ ] Re-run `armourStyleAudit` after any encumbrance change; it is the gate for this task.

### 12d. The style identities were never in the sim  ✅ 2026-07-28

**The goal, finally written down as numbers** (it had never been, which is why the previous three
passes circled):

| | `attack_speed` | `hit_chance` | damage per landed hit | throughput | armour |
| --- | --- | --- | --- | --- | --- |
| Two-handed | low | lower | devastating | 100 (reference) | heavy — it has no shield |
| One-handed + shield | high | high | modest | ~60 | what its strength affords |
| Duelist (1H, trait) | high | high | between the two | ~80 | light |

Armour class is meant to be a read of the pawn: high strength / low dodge → heavy; low strength / high
dodge → light; middling at both → medium, paid for with strength.

**What the sim was actually doing** (`_stylePremiseProbe.test.ts`, 6 seeds each, real swings captured
off the combat sink rather than inferred from ticks-to-kill):

- Weapon identity was real (2H 312t between swings / 47% landed / 71.4 per hit vs 1H 194t / 83% / 30.4)
  but the RATIO was inverted — 1H throughput was **121%** of the two-hander's, and mace-and-shield
  **176%**, against a 60% target.
- Armour identity did not exist **at all**: plate cost **0.9% dodge and 0% `attack_speed`**, and
  protection rose monotonically with weight. No pawn had any reason to wear light armour.

- [x] **A · the stat decoupling had orphaned 88 condition stages.** `dodge` / `hit_chance` /
      `attack_speed` became pure aptitude reads, but 88 stages across 51 conditions still expressed
      their effect as an `dexterity`/`strength` multiplier written back when dexterity *was* dodge. They had
      silently degraded to damage-only: `encumbered · overloaded` (`dexterity 0.45`) left evasion
      untouched, `winded` claimed in its own description to leave a fighter "barely able to swing,
      barely able to dodge" and did neither, and `quickness`/`grace` granted no swing rate. Restored
      the channel on all 67 stages that name a core stat the combat stats used to read, derived from
      the existing multiplier and damped (dodge 0.70, `attack_speed` 0.45, `hit_chance` 0.40) so a
      condition no longer moves evasion as hard as raw dexterity once did. `windchilled` maps to
      `hit_chance` only — wind spoils the shot, it does not make you evade worse.
- [x] **B · a lower load tier, and armour stiffness as its own channel.**
  - New **`laden`** condition, 60% → 100% of capacity, **combat-only** (dodge / `attack_speed` /
    `hit_chance`, no `moveSpeed`, no `workEfficiency`) so a hauler at 80% of budget is never slowed for
    it and it cannot read as a punishment for carrying the day's logs. `encumbered` keeps its old
    100% → 140% band and stacks on top.
  - `armorProperties.movementPenalty` was a **dead field** — written into a bonuses object in
    [PawnEquipment.ts:406](../../../src/lib/game/core/PawnEquipment.ts) and read by nothing, while the
    item tooltip promised the player a penalty the sim never applied. Now `wornStiffness` sums it and
    it multiplies dodge in `resolveHit`, capped at 0.45. This is the half of the trade weight alone
    cannot express: a strength build affords plate without going `laden`, and the suit still costs it
    evasion. Tooltip relabelled to "Evasion penalty".
  - `fatiguePerTurn` is still dead — authored on every armour piece, read only by the tooltip.
- [x] **C · the grips swapped ends of the `attack_speed` axis.** They were on the *same* end: 1H mean
      **0.887**, 2H mean **0.921** — two-handers were on average the faster grip, and `steel_warhammer`
      (0.87) out-swung `steel_longsword` (0.82). The previous pass had taken the 60% target out of 1H
      speed, which is the one axis a one-hander is supposed to own; it belonged in damage.
  - 42 one-handers: `attackSpeed` mean **0.764 → 1.137**, scaled so the heavier head is the slower one.
  - 23 two-handed sluggers (reach 1): mean **0.766 → 0.690**, likewise damage-ranked, which drops
    `steel_warhammer` to 0.62 — the slowest in the game rather than the fastest 2H.
  - Untouched by design: 2H reach ≥ 2 (staves, spears, polearms — a reach identity, already fast), 1H
    daggers (≥ 1.30), and the finesse line (rapier/estoc, whose case *is* speed plus accuracy).
  - The same 41 one-handers took **damage ×0.62** (`damage`/`damMin`/`damMax` together), so speed and
    damage moved as a pair.

**Measured after, same probe** (medium armour on every style, the only kit where the weapon is the
variable — bare-vs-bare flatters the shield, and heavy is over a strength-30 budget):

| style | ticks between swings | landed | per landed hit | throughput |
| --- | --- | --- | --- | --- |
| 2H greatsword | 255t | 33% | 75.1 | 98.3 |
| 1H longsword + shield | 218t | 85% | 15.4 | **60.2 → 61% of the two-hander** |
| 1H duelist | 143t | 66% | 22.8 | 105.5 |

Armour now costs what it should: plate takes **−36.9%** off effective dodge (0.778 → 0.491), and a
strength-30 fighter in full plate plus shield sits at `laden` 1.00 **and** `encumbered` 0.40 — heavy
armour is a strength-45 kit, which is the intended gate.

- [ ] **Heavy armour is still the worse defensive answer than a shield.** In the intended matchup
      (strength 45 in plate with a greatsword vs dexterity 45 behind a shield in light) the two-hander is
      hit on **73%** of incoming swings against the shield build's **67%**, and converts 4/6 against
      6/6. Plate buys soak but hands back so much dodge that the shield build is both safer and level
      on damage (106.6 vs 107.7). Either `STIFFNESS_DODGE_CAP` is too harsh or block is too strong —
      measure before touching either.
- [ ] **`steel_warhammer` still reads ~2× the greatsword** (192–208 vs 98–108 throughput) even after
      becoming the slowest 2H. Its 46 damage is the remaining cause. This is task 14 and it distorts
      every 2H average.
- [ ] Fold `_stylePremiseProbe.test.ts` into a permanent regression gate (it is the only harness that
      measures the MECHANISM — swings, landed share, damage per landed hit — rather than ticks-to-kill).

### 12f. The armour-vs-shield comparison was a category error  ✅ 2026-07-28

The earlier reading — "heavy armour is a worse defensive answer than a shield" — compared two different
layers. **Armour is MITIGATION** (what a landed blow does); **a shield belongs to NEGATION alongside
dodge** (whether it lands at all). A two-hander in plate being hit more often than a shield user is the
trade it took, not a defect. Owner's framing, 2026-07-28.

`styleMatchups.test.ts` tests what is actually diagnostic: pawn vs pawn, equal stats pinned at the
**spawn ceiling (20)** rather than the 30–45 fixtures — balance read at stats no colonist can reach is
not balance.

- [x] **FLOOR — no issue.** Against a NAKED shield user (full dodge, no stiffness, no load), the
      armoured two-hander wins **5–1**, and the naked two-hander **4–2**: plate earns its slot. The bare
      shield user does hold out (lands 80% of its swings) but achieves nothing — **6.7 damage per landed
      hit against the two-hander's 48.1, biggest blow 79**. Exactly the intended shape: hard to finish,
      decided by one connection.

- [ ] **CYCLE — not a cycle.** Intended `1H+shield > 2H > polearm 2H > 1H+shield`; measured a strict
      ordering, **polearm > 2H > 1H+shield**, with only the third leg correct:

  | matchup | result | intended |
  | --- | --- | --- |
  | 1H+shield · medium vs 2H · heavy | **2–4** | 1H+shield should lead |
  | 2H · heavy vs polearm · medium | **1–5** | 2H should lead |
  | polearm · medium vs 1H+shield · medium | **4–2** | ✅ |

  Two causes, both traceable to decisions made earlier in this same phase:

  - **Polearms were exempted from the 2H speed cut** (task 12d left reach ≥ 2 alone as "a reach identity,
    already fast"). That leaves `steel_halberd` at `attackSpeed` **1.09** with 23 damage and reach 2 — a
    one-hander's swing rate with two-handed reach. It lands **81%** against the greatsword's 58%. It is
    strictly better than the weapon it is supposed to lose to.
  - **The 1H damage cut was calibrated against the wrong target.** ×0.62 was set in a pawn-vs-MOB fight
    (an orc reaver, natural armour). Against an ARMOURED pawn, ADR-029 subtractive mitigation eats
    almost all of a 12-damage longsword blow: 1H+shield lands 68–72% of its swings for **6.9–7.2 per
    hit**, against 43.8 coming back. The intended 60% throughput holds against a mob and collapses to
    roughly a sixth against armour.

- [ ] Re-rate the reach ≥ 2 two-handers against the sluggers rather than exempting them.
- [ ] Re-derive the 1H damage cut against an ARMOURED opponent, not a mob — subtractive armour makes the
      two calibrations completely different problems.
- [ ] Re-run every task 12d number at the spawn ceiling; they were all measured at strength 30–45.

### 12g. The weapon meta, measured properly  ✅ 2026-07-28

`weaponMeta.test.ts` — 22 styles (every steel-tier weapon; one-handers in BOTH configurations, behind a
shield and as a trained duelist; the assassin as a matched PAIR of daggers), equal stats at the spawn
ceiling of 20. Two sweeps, ~7,000 duels.

**Dual wield now exists.** There was no such thing before: `getGrip` returned the neutral `oneHanded`
grip whenever the off hand held anything that was not a shield, so a second dagger was never swung — it
only blocked the duelist grip, making two daggers strictly WORSE than one. Added `offHandable` to the
eight daggers, a `dualWield` grip, an off-hand slot resolver (a second dagger goes to the free hand
instead of swapping out the first, the same occupancy rule rings use), and the pair's payout: ×1.4
working rate, +0.08 crit, +0.08 penetration, ×1.05 damage. Verified in the sim — a stiletto in each hand
resolves to `dualWield` at attack_speed 2.268 against a single dagger's 1.5.

- [x] **THE ARMOUR SPLIT IS REAL, and it is the balance to keep.** Attacker always naked, target's armour
      the only variable, 63 fights per style per class:

  | | bare target, top 5 | plated target, top 5 |
  | --- | --- | --- |
  | 1 | greatflail (2H) 54 wins | **greataxe (2H) 61** |
  | 2 | **mace + shield 50** | greatflail (2H) 54 |
  | 3 | **rapier + shield 48** | greatsword (2H) 52 |
  | 4 | warhammer (2H) 48 | greatcleaver (2H) 52 |
  | 5 | **flail + shield 46** | mace + shield 48 |

  Against plate the top four are ALL two-handers; against bare flesh three of the top five are
  one-handers behind shields. The movement is unambiguous: greatcleaver **+10 places**, greataxe **+5**,
  greatsword **+4** when the target armours up, while cleaver + shield falls **8**, rapier + shield **6**
  and halberd **5**. Cause is ADR-029 subtractive mitigation — a big weapon loses a slice off a large
  number, a light one loses nearly the whole number. **No flat damage buff is needed, and the bleeding
  idea can stay parked.**

- [ ] ⚠ **`mace + shield` is the outlier: 107 wins of 126, helpless against NOTHING.** It beats 17 of its
      21 opponents at 5-or-6 out of 6, including every two-hander. `flail + shield` is second at 97, also
      with no losing matchup. The blunt one-handers carry a 1.3 blunt multiplier and much better
      penetration on top of damage that the flat ×0.62 one-handed cut left them, because they started
      higher than the swords did. That cut did not land evenly and this is where it shows.
- [ ] ⚠ **Twin daggers are NOT a counter build** — the intended design, but not the measured one. 33 wins
      of 126, and the only opponents it takes 5-of-6 from are `broadaxe duelist` and `boar spear duelist`,
      the two weakest styles in the game. It is helpless against six styles. It needs an ACCURACY source,
      not more precision: it lands 53 swings in 100, and precision cannot help a swing that never lands.
- [ ] ⚠ **Three duelist configurations dominate nothing at all**: `broadaxe duelist` (28 wins),
      `cleaver duelist` (27), `boar spear duelist` (18). A style with no favourable matchup anywhere is
      not a trade-off, it is a dead option.
- [x] **Real counters DO exist**, so the rock-paper-scissors shape is reachable: `rapier duelist` takes
      the greatsword 5-of-6 and the greataxe 5-of-6 (the anti-two-hander), `flail duelist` takes the
      halberd 6-of-6, and `warhammer` takes the greatflail 5-of-6.
- [x] **One-handed spears cost one less stamina per swing** (all eight; steel boar spear 2 → 1), making
      them the cheapest melee weapon to swing and the loadout a low-stamina pawn or a pure tank can keep
      using after everything else has run them dry.

### 12h. Loose ends closed  ✅ 2026-07-28

- [x] **Wound traits are stamped when GAINED, not only at generation.** `applyGainedTrait` baked stat
      grants, grafts, silk and body mods but never `trait.wounds`, so a pawn who became `one-eyed`
      mid-life kept both eyes and the trait was a name with no body behind it. `applyTraitWounds` now
      takes an optional single trait — stamping is not idempotent, so the gained path must never re-run
      the whole set or every wound the pawn was born with is stamped twice.
- [x] **`armorProperties.fatiguePerTurn` is wired.** 50 armour pieces author it, cleanly graded by class
      (light 0.01–0.2, medium 0.08–0.4, heavy 0.1–0.9), and NOTHING read it — the field existed only to
      be printed in a tooltip promising the player a cost the sim never charged. Now added to the fatigue
      need. Scaled by 0.18: the raw values were authored against a much larger base than the 0.32 this
      uses, and a full plate harness sums to 1.74, five times the base. At 0.18 a full harness roughly
      DOUBLES the resting fatigue rate — a real reason to take it off in camp, not a reason never to wear it.
- [x] **Precision searches harder.** `PRECISION_CANDIDATE_SPAN` 6 → 14. It was calibrated when the gate
      topped out near 0.06, so the entire span bought a third of one extra look; it now reaches ~0.42 on a
      crit-heavy weapon, giving ~9 looks against a poor fighter's 3.7. This does NOT make eyes common and
      is not meant to: an eye is 0.2 of ~70 total hit weight, under 1% per look, and a deliberate
      eye-thrust being rare is the anatomy being honest. The gain shows up on the reachable maim targets.
- [x] **Build shares are even.** Per-build z-calibration was not enough on its own: five builds compete
      for dexterity, while `intelligence` is wanted by the Battlemage ALONE and is uncorrelated with every
      physical stat (measured |r| ≤ 0.05), so it won its argmax unopposed and took 27 pawns in 100 against
      an even share of 11. A per-build offset, solved by clamped iterative correction, evens the shares
      without reordering pawns inside a build. Now 5.7%–15.3% across nine builds, with the tier ladder
      still spread S 8% / A 13% / B 18% / C 25% / D 19% / F 17%.
- [x] **The collapse test was asserting the wrong thing.** A downed pawn with nobody to tend it does not
      get back up, and should not: pawn clotting is deliberately sparse so that "bleeding stays a
      treat-or-die threat… leaving room for a caretaker to make it (or not)" ([Wounds.ts:236](../../../src/lib/game/core/Wounds.ts)),
      and the scenario has exactly ONE pawn. Traced to 72,000 ticks the arc is real and not a hang: blood
      98.6% → 33.6%, bleeding clots, an untended infection starts climbing. The test now asserts the
      designed shape — goes down, draft releases, stays down, still alive to be saved, still bleeding.

- [x] **`combatBalanceAudit` #12 DELETED (owner's call, 2026-07-28) — but the finding it caught stands.**
      Re-run at the spawn ceiling (it had been measuring strength 30, above what a colonist can reach) it
      read: two-hander kills fastest at **2,170t** ✅, but the shield style dies **MOST — 5 deaths in 8
      against the two-hander's 3**, where the design says the shield is precisely what the one-hander
      bought with its damage. The assertion was correct and the game is wrong.

      Only that ONE test was removed, not the file: the other five pin the two-handed/STRENGTH decoupling
      (#4), the signed trait-grant fix (#1), the downgrade cost (#11), mob stat bands, and sim
      determinism (#2) — all still green and all worth keeping.

      **The claim is now tracked HERE instead of by a red test**, so it must not be lost: a one-hander
      behind a shield is supposed to die LESS than a two-hander, and currently dies more. Re-assert it
      once the one-handed damage re-derivation below lands.

### 12i. Weapon identities, and the default build  ✅ 2026-07-28

**Sword and shield is the DEFAULT, not one option among nine.** The even nine-way split from 12h was
wrong — it made every build equally easy to reach, so nothing was a fallback and nothing was special
("too easy to make a build"). `INTENDED_SHARE` now gives sword-and-shield the widest door at 26% and
narrows the specialists; the calibrator solves for those shares instead of 1/N. Measured over 300
pawns: Sword & Shield **28%**, Archer 12.3%, 2H Hammer 11.7%, Mace & Shield 11.3%, Greatsword 9%,
Duelist 7.7%, Assassin 7.7%, Battlemage 6.7%, Fencer 5.7%. The tier ladder is untouched by this — the
offset is a per-build constant, so it moves WHICH build a pawn lands in, never their rank inside it
(S 8.3% / A 13% / B 17% / C 29.7% / D 14.7% / F 17.3%).

- [x] **1H spears lose their reach.** All eight go reach 2 → **1**, the same as every other one-hander.
- [x] **2H spears keep exactly one tile of reach** (steel pike 3 → 2; the rest were already 2).
- [x] **1H spear accuracy +3, 1H sword accuracy +2.** The ask was "+10% and +5%"; melee to-hit is
      `60 + accuracy × 2` points, so +10% ≈ 6 points ≈ accuracy +3, and +5% ≈ 3 points ≈ +1.5, rounded
      to +2. Nine of these weapons had no `accuracy` field at all (defaulting to 0) and needed it added.
- [x] **2H spears slowed to 0.762** — the reach-1 two-handed sluggers average 0.693, so this is exactly
      10% faster than the rest of the two-handers, down from 1.15–1.28. Their damage was already well
      below the other two-handers (pike 17 against greatsword 31) and was left alone.
- [x] **`partPreference` — where a weapon WANTS to land.** New weapon property, a chance to redirect a
      landed blow onto a named location, matched by substring so a plan that names its parts differently
      still resolves. 1H flails ask for the head **5%**, 2H flails **10%**, daggers ask for the **neck
      8%**.
  - Daggers target the NECK, not the carotid directly: the carotid is an internal part (`hitWeight 0`)
    that the existing organ-penetration roll finds *on* a neck hit, so preferring the neck delivers both
    through anatomy that already exists rather than letting a blow select an organ out of nowhere.
  - **It is not free**, which is the "should make them less accurate overall" the owner called for: the
    total preference is charged straight back as a to-hit penalty at `PREFERENCE_ACCURACY_COST = 40`
    points per 1.0, so a 2H flail gives up 4 points (~7% of its hit chance) and a dagger 3.2. Derived
    from the preference itself, so it can never be authored away.
- [x] **`pierceThrough` — the pike's actual case.** A thrust carries into whoever stands one tile
      further along the same line and strikes the SAME body part for a fraction of the damage. On the
      iron `framea` and the steel `steel_pike` at **50%**. It does nothing at all in a duel, which is the
      point: it is a weapon for a rank.
  - [ ] **80% for T4+ is authored but unreachable — there is no tier-4 two-handed spear.** The T4
        polearms are the `rune_etched_halberd` and the `rune_standard_glaive`, neither of which is a
        spear. Either add one, or decide the line tops out at steel.
- [x] **One-handed spears cost one less stamina** (all eight; steel boar spear 2 → 1), making them the
      cheapest melee weapon to swing and the loadout a low-stamina pawn or a pure tank can still use when
      everything else has run them dry.

- [ ] **None of 12i is measured yet.** The numbers above are authored, type-checked and unit-green, but
      no headless re-audit has been run since — `weaponMeta` and `styleMatchups` both need re-running
      before any claim about what these changes DID.

### 13. The deferred trait audit

Bundled deliberately: all three are trait-economy problems and re-pricing them one at a time against a
moving stat economy would waste the work.

- [ ] `giants-grip` bypasses the power soft cap — it multiplies `baseDamage` directly in `weaponBonusDamage` ([Combat.ts:508-519](../../../src/lib/game/systems/Combat.ts)), outside `powerScale`. **+45.3%** and present in *every* optimal pile the audit assembled.
- [ ] Flat stat-pile traits outclass every purpose-built combat trait: `all-plus-5` +49.1%, `dex-plus-5` (**rare**) +35.5% — both above `killer-instinct` (**epic**, +18.0%).
- [ ] Trait swing is asymmetric and wide: `whirlwind` (epic) **+78.5%**, `lumbering-fighter` (negative) **−45.3%**.
- [ ] Decide an intended band for a single trait's combat swing and bring the outliers into it. Best legal five-trait pile is **×4.47 on paper** and **×1.72 in a real fight** — tune against the fight number.

### 14. Data passes

- [ ] Re-rate the warhammer line: `iron_warhammer` (34 dmg) and `steel_warhammer` (40) beat every steel weapon except their own successor, while also carrying the best pen (0.50) and armour damage (10). No iron-age weapon should out-damage the steel band.
- [ ] Work the per-weapon T4 checklist, now tracked as [t4-weapon-fight-verification](../../issues/t4-weapon-fight-verification.md) — every melee row is blocked on Phase 1.
- [ ] The 4 ranged/thrown T4 weapons need their own pass; the melee sweep does not cover the ranged path.

---

## Sequencing

1. **Phase 0** (1, 2) — the trait bake and the RNG, so everything after is measurable.
2. **Phase 1** (3–7) — damage through the stats, power stat by grip. The biggest single win: it fixes the injury hole and the power-stat inversion in one change.
3. **Phase 2** (8–10) — the aptitude axis, on top of an honest damage axis.
4. **Phase 3** (11) — precision.
5. **Phase 4** (12–14) — re-measure, then the trait audit and the data passes.

## Verification gate

- [x] `pnpm check` clean.
- [x] Full suite green — **167 files / 1187 tests** (Combat.ts, stats.jsonc and traits.jsonc all moved, so the full run was the required gate).
- [x] `statAxisProposal` re-pointed at the shipped math — the modelled proposal became direct engine assertions; the two PROPOSAL-pricing tests in `weaponStatSweep` were deleted (the options they priced are decided and shipped).
- [ ] `t4WeaponAudit` + `weaponStatSweep` re-run and their tables recorded on [t4-weapon-fight-verification](../../issues/t4-weapon-fight-verification.md).
- [ ] `weaponFightSim` re-run — a balance claim is `[x]` only with the mean-of-8-seeds fight number behind it, stated with its delta.
- [x] **`combatBalanceAudit` re-run and INVERTED** — all five assertions now pin the FIXED behaviour, so a green run means the fixes hold. Re-invert any that a future change is expected to move.
- [x] Right-censor every fight comparison (a non-kill counts as the full tick budget) and report kills **and** deaths alongside time-to-kill. Averaging over kills only has already produced one inverted conclusion.
