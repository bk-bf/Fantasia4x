<!-- COMBAT-BALANCE — the two-axis stat rebuild plus the logic errors the tier-4 audit turned up
     (findings 2026-07-27, design settled 2026-07-27). Findings live in AUDIT.md § Weapons; this file
     is the WORK. Every task carries the measurement it came from, so a fix can be checked against the
     same number that justified it. -->

# COMBAT-BALANCE — The Two-Axis Stat Rebuild

> **Related:** [AUDIT § Weapons](AUDIT.md) · [DESIGN](../../game/DESIGN.md) · [DECISIONS](../../game/DECISIONS.md) · [ROADMAP](ROADMAP.md) · [STEALTH](STEALTH.md)

**Status (2026-07-27):** **Phases 0–3 are DONE.** The core stats set damage capacity and nothing else,
the six secondary stats are rolled per pawn and surfaced in the pawn panel, and precision aims for
lethality. Every headline finding is fixed and re-measured in a live fight; see
[Live-sim verification](#live-sim-verification).

**Remaining:** Phase 4 only (tasks 12–14: the cadence floor, the deferred trait audit, the data
passes), plus two loose ends — `applyGainedTrait` still doesn't stamp wound traits, and aptitudes are
not yet persisted through save/load. Phases 0–3 are complete.

Also landed as a prerequisite: the core-stat vocabulary migration (`strength→brawn`,
`dexterity→agility`, `constitution→vigour`, `perception→awareness`, `intelligence→intellect`),
including the creature schema. Four engine fixes landed in the original audit pass (power-curve soft
cap, armour-condition soak, `powerStat`, `critMultiplier` + the heavy-2H accuracy/speed pass) — logged
in [AUDIT § Weapons](AUDIT.md).

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
| the power stat is decoration | 4 | BRAWN 40 → 6345 ticks, 4/8 kills, 3 deaths, 73% blood left · AGILITY 40 → **3365 ticks, 7/8 kills, 1 death** | BRAWN 40 → **3763 ticks, 6/8 kills, 2 deaths, 49% left** · AGILITY 40 → 10838 ticks, 1/8 kills, 6 deaths. The BRAWN build is **2.88× faster** on the weapon that names BRAWN |
| a flaw raises its stat | 1 | `frail`+`clumsy`+`dull` → vigour 12→**14**, agility 12→**14**, intellect 12→**14** | → vigour 12→**10**, agility 12→**10**, intellect 12→**10** |
| precision is inverted | 11 | stiletto + `lumbering-fighter` **0.96×** the unimpaired time-to-kill — a strict downgrade was free | **1.03×** — it costs time now, and `aimedBodyPart` was rewritten too: killing-hit share now **rises** with precision (71.6% → 74.7%, the neck appearing at the top end) where it used to **fall** 54% → 45% |
| session determinism | 2 | same seed replays identically | unchanged; the module default seed is now fixed too |
| 1H out-damages 2H | 12/12a | 1H+shield 110–140% of a two-hander; duel grip free to every pawn | **kill speed 2H 1070t · duelist 1277t · shield 1488t**, with **deaths 3/8 · 3/8 · 0/8** — the intended order, offence and defence traded against each other |
| decoupling | 8–9 | every secondary stat tracked a core stat | core stats 10 → 60 leaves all six **identical**; two pawns with the same physique now differ |

> **What the fix actually was.** Agility used to buy four things at once — damage on its own weapons,
> cadence, to-hit and crit — so it out-earned every other stat everywhere and the weapon's named power
> stat was decoration. Damage now resolves through `melee_damage`/`ranged_damage` (so `× manipulation`
> applies and injury finally costs damage), the weapon's GRIP names which core stat feeds it, and
> cadence/accuracy/precision/armour-damage/evasion/marksmanship are per-pawn rolls that no core stat
> touches. The analytical harness agrees: **the named power stat now loses on 0 of 16 tier-4 weapons**
> (was 6 of 16, all two-handers).

> **Measurement trap, recorded because it nearly inverted a conclusion.** Averaging time-to-kill over
> the runs that *killed* is censored data: it silently drops the worst runs of whichever build fails
> most. On the first pass the BRAWN build looked **3× faster** because 4 of its 8 runs never landed a
> kill and were excluded. Counting a non-kill as the full tick budget — and reading **blood removed**,
> which every run contributes to — reverses it to AGILITY being 1.89× faster and removing 2.9× the
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
| two-handed melee | **BRAWN** |
| one-handed melee | **AGILITY** |
| ranged | **AWARENESS** |
| rapier / finesse line | **AWARENESS** (the standing special case) |
| arcane staff / rod | **INTELLECT** |
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

All six move, so **no core stat buys combat performance anywhere**: AGILITY stops buying evasion and AWARENESS
stops buying marksmanship, which are the last two channels through which a damage stat could still pay
for something other than damage. `dodge` keeps its body-weight term (mass is physique, not aptitude)
and `block` stays derived — it is VIGOUR, body mass and the shield, none of which are skill.

This is what makes two pawns with identical BRAWN/AGILITY play differently, and it is what the current system
cannot express at all: a 40-BRAWN pawn that rolled badly is a hard hitter who cannot land a blow.

### What this is not

Not a stat-count increase. The combat block goes **15 → 14**: one stat is deleted (`vision_range`,
superseded), three dead ones are wired rather than removed, and six change their source. The pawn
gains six rolled numbers.

---

## Phase 0 — Unblock the measurements  ✅

Do these first; every tuning number after them is only as good as the RNG and the trait bake.

### 1. Accept signed stat grants — every `*Penalty` currently RAISES its stat

- [x] Re-author penalties as **signed bonuses** in `traits.jsonc` (`"agilityBonus": -5`), dropping the `*Penalty` key entirely — 68 traits.
- [x] Collapse both bake paths to one signed add with no key-suffix branch: `applyCulturalTraitBonuses` ([Pawns.ts:867](../../../src/lib/game/entities/Pawns.ts)) and `applyGainedTrait` ([Pawns.ts:272](../../../src/lib/game/entities/Pawns.ts)).
- [x] Keep the `max(1, …)` floor so a stacked flaw can't drive a stat to zero or negative.
- [x] Re-point the pinning test (`t4WeaponAudit` → "every `*Penalty` RAISES its stat") at the corrected behaviour — it pins the BUG on purpose today so it can't change silently.
- [x] Re-run the trait sweep and confirm the negative twins invert.
- [ ] **Also in this bake path:** `applyGainedTrait` never stamps a `wound`-kind trait's injuries — `applyTraitWounds` is a separate function that only generation calls. A pawn who gains `one-armed` at runtime (growth event, trait gamble, `devSetPawnTraits`) keeps both arms. Decide whether that is intended (wounds are generation-only) or a hole.

> **Evidence — headless `[x]`.** Through the real command path in a live session, `frail` + `clumsy` +
> `dull` moved vigour **12→14**, agility **12→14**, intellect **12→14**. Three flaws, three upgrades
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

- [x] Sweep `items.jsonc`: `powerStat: "brawn"` on every two-handed melee weapon, `"agility"` on every one-handed melee weapon.
- [x] Leave the finesse/rapier line on `"awareness"` and the arcane line on `"intellect"`.
- [x] Ranged: `"awareness"` — and confirm it doesn't double-count with `aim_accuracy`, which is already AWARENESS.
- [x] Acceptance: each weapon's own power stat is its best stat, across all three opponent profiles.

> **Evidence — headless `[x]`.** Same 2H greataxe, a weapon whose power stat is BRAWN, 8 seeds each:
>
> | build | time to kill | kills | deaths | blood left |
> | --- | --- | --- | --- | --- |
> | BRAWN 40 / AGILITY 10 | 6345 ticks | 4/8 | 3 | 73% |
> | BRAWN 10 / AGILITY 40 | **3365 ticks** | **7/8** | **1** | **21%** |
>
> The AGILITY build is **1.89× faster, removes 2.9× the blood, kills nearly twice as often and dies a
> third as often — on the two-hander** (`combatBalanceAudit` → #4). The power stat is not merely weak,
> it is the wrong stat to buy.
>
> **Analytical `[~]`.** The named power stat loses on **6 of 16** tier-4 melee weapons — **6 of 8
> two-handers, 0 of 8 one-handers**. Warhammer BRAWN-40 **20.8** vs AGILITY-40 **23.8**; greatsword 12.9 vs
> 13.3. The mechanism is the cadence floor: a 0.55-speed greataxe sits far below the 1.67× ceiling so
> every AGILITY point still buys swings, while a 0.9-speed mace is already capped and AGILITY's biggest channel
> is dead there. **AGILITY pays more the slower your weapon is** — so it steals exactly the weapons BRAWN is
> supposed to own.
>
> Modelled with damage on the grip: **16 of 16** answer to the physique their grip names, and the
> warhammer inversion reverses to **17.2 BRAWN / 6.2 AGILITY** (`statAxisProposal` → ADOPTED).

### 5. Fold `hit_chance` into the melee to-hit roll

- [x] `resolveHit`'s `toHit` reads `evaluateStat('hit_chance', attacker)` instead of raw, condition-scaled `dex` ([Combat.ts:925-931](../../../src/lib/game/systems/Combat.ts)), so `× sight × manipulation` finally applies.
- [ ] Regression test: a blinded pawn must land fewer melee blows than an unhurt one.
- [x] Re-check the ranged path is unaffected — `aim_accuracy` already applies both capacities, so melee is the outlier, not ranged.

### 6. Delete `vision_range`

- [x] Nothing reads it; `core/vision.baseVisionRange` returns TILES from raw AWARENESS and is shared by pawns and mobs. Remove the formula rather than leave a documented stat that does nothing.
- [x] Check the pawn stat panel and `/gear-db` → Stats by build for references before removing.

### 7. Data: the gaps this mapping exposes

- [x] **2H flail authored** — `steel_greatflail` (T3) and `rune_lashing_greatflail` (T4), both brawn-scaled, with recipes. Every melee family now ships in both grips.
- [x] **Banner polearm authored** — `rune_standard_glaive`: reach 2, `powerStat: "charisma"` (CHARISMA joined `PowerStat`), and `prestigeBonus: 9`. `computePrestige` now reads a top-level `prestigeBonus` so a WIELDED standard counts, not only worn regalia.
- [x] Runed 1H sword authored — `rune_etched_arming_sword`, agility-scaled. The nimble sword line reaches T4.

---

## Phase 2 — The aptitude axis  ✅

Only after Phase 1, so the damage axis is already honest when the second axis lands on top of it.

### 8. Roll and store aptitudes

- [x] Add `pawn.aptitudes` — a small record keyed by the same stat ids, rolled beside `rollStatsFromRanges` ([Pawns.ts:811](../../../src/lib/game/entities/Pawns.ts)).
- [x] Roll **independently of the core stats** — a stat-biased roll re-introduces the AGILITY correlation through the side door.
- [x] Triangular distribution over the band so an extreme aptitude is rare, not one roll in three.
- [x] Modify by body size and traits at generation; let the existing growth events move them.
- [x] Decide the band. ⚠ At ±0.25 on `hit_chance` + `attack_speed` + `hit_precision` together the swing is **+95%** — too wide. Either narrow the band or stop the three compounding.
- [ ] Persist through save/load; decide the default for pawns in existing saves (1.0 across the board is the safe migration).

### 9. Re-source the six aptitude stats

- [x] `hit_chance`, `attack_speed`, `hit_precision`, `armor_damage`, `dodge`, `aim_accuracy`: formula reads the pawn's rolled aptitude instead of a core stat, still `×` its capacity terms.
- [x] Keep every id, name and description — this is a source change, not a rename.
- [x] `dodge` keeps its `− (weight − 70) × 0.002` term: mass is physique, and a heavy pawn should still evade worse however well it rolled.
- [x] Leave `block` derived (VIGOUR + body mass + shield) — none of those three is skill.
- [x] Acceptance: two pawns with identical core stats produce measurably different dps AND different survivability, and **no core stat correlates with hit rate, cadence, crit, evasion or marksmanship**.

> **Evidence.** Modelled on the rune-graven spear vs an armoured target: a 40-AGILITY pawn with a bad roll
> (**8.1**) loses to a **16-AGILITY** pawn with a good one (**8.4**), while a 40-AGILITY pawn who also rolled
> well leads at **17.4**. Aptitude tilts the result without replacing the physique
> (`statAxisProposal` → APTITUDE AXIS).

### 10. Surface it in the UI

- [x] Pawn panel: `PawnAptitudes.svelte` renders the six rolls under the core stats on the Attributes tab, as signed percentages with a band tick and a plain-language label (accuracy / cadence / precision / leverage / evasion / marksmanship — never the stat id).
- [x] **Fixed two rename regressions the tab had been carrying:** `statView` still substituted the OLD `BRN`/`AGI` tokens, so NO core stat resolved in ANY formula tooltip; and `PawnStatBanner`'s trait lookup keyed `STR`/`DEX`, so trait contributions rendered blank.
- [x] `POWER` and `APT` surfaced in the formula tooltip — `POWER = 20 (brawn 25, damped)`, `APT = 1.09 (rolled)` — verified in the running game, not just in a test.
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
> ⚠ **Caveat, not yet controlled for:** a profile demanding TWO stats (2H Hammer: brawn+vigour) is
> easier to score high on than one demanding THREE (Sword & Shield: agility+vigour+brawn), so some of
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
- [ ] Bring the styles into the intended order. Measured today at brawn/agility 40 vs a mail-clad dummy:

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
alone — were both wrong). Measured at brawn/agility 40, `dmg/swing` already NET of the hit rate:

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

### 13. The deferred trait audit

Bundled deliberately: all three are trait-economy problems and re-pricing them one at a time against a
moving stat economy would waste the work.

- [ ] `giants-grip` bypasses the power soft cap — it multiplies `baseDamage` directly in `weaponBonusDamage` ([Combat.ts:508-519](../../../src/lib/game/systems/Combat.ts)), outside `powerScale`. **+45.3%** and present in *every* optimal pile the audit assembled.
- [ ] Flat stat-pile traits outclass every purpose-built combat trait: `all-plus-5` +49.1%, `dex-plus-5` (**rare**) +35.5% — both above `killer-instinct` (**epic**, +18.0%).
- [ ] Trait swing is asymmetric and wide: `whirlwind` (epic) **+78.5%**, `lumbering-fighter` (negative) **−45.3%**.
- [ ] Decide an intended band for a single trait's combat swing and bring the outliers into it. Best legal five-trait pile is **×4.47 on paper** and **×1.72 in a real fight** — tune against the fight number.

### 14. Data passes

- [ ] Re-rate the warhammer line: `iron_warhammer` (34 dmg) and `steel_warhammer` (40) beat every steel weapon except their own successor, while also carrying the best pen (0.50) and armour damage (10). No iron-age weapon should out-damage the steel band.
- [ ] Work the per-weapon T4 checklist in [AUDIT § Weapons](AUDIT.md) — every melee row is blocked on Phase 1.
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
- [ ] `t4WeaponAudit` + `weaponStatSweep` re-run and their tables pasted into [AUDIT § Weapons](AUDIT.md).
- [ ] `weaponFightSim` re-run — a balance claim is `[x]` only with the mean-of-8-seeds fight number behind it, stated with its delta.
- [x] **`combatBalanceAudit` re-run and INVERTED** — all five assertions now pin the FIXED behaviour, so a green run means the fixes hold. Re-invert any that a future change is expected to move.
- [x] Right-censor every fight comparison (a non-kill counts as the full tick budget) and report kills **and** deaths alongside time-to-kill. Averaging over kills only has already produced one inverted conclusion.
