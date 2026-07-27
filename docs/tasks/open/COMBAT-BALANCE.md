<!-- COMBAT-BALANCE — the two-axis stat rebuild plus the logic errors the tier-4 audit turned up
     (findings 2026-07-27, design settled 2026-07-27). Findings live in AUDIT.md § Weapons; this file
     is the WORK. Every task carries the measurement it came from, so a fix can be checked against the
     same number that justified it. -->

# COMBAT-BALANCE — The Two-Axis Stat Rebuild

> **Related:** [AUDIT § Weapons](AUDIT.md) · [DESIGN](../../game/DESIGN.md) · [DECISIONS](../../game/DECISIONS.md) · [ROADMAP](ROADMAP.md) · [STEALTH](STEALTH.md)

**Status (2026-07-27):** **the decoupling is DONE.** Phase 0 and Phase 1 are complete, and Phase 2's
engine half (tasks 8–9) with it — the core stats now set damage capacity and nothing else, and the six
secondary stats are rolled per pawn. Every headline finding is fixed and re-measured in a live fight;
see [Live-sim verification](#live-sim-verification).

**Remaining:** task 7 (author the 2H flail / banner polearm / runed 1H sword), task 10 (surface
aptitudes in the pawn panel), task 11 (precision → lethality scoring), and all of Phase 4 (12–14).

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
| precision is inverted | 11 | stiletto + `lumbering-fighter` **0.96×** the unimpaired time-to-kill — a strict downgrade was free | **1.03×** — it costs time now. ⚠ Only because the stats feeding it were fixed; `aimedBodyPart` still scores by armour alone, so **task 11 proper is still open** |
| session determinism | 2 | same seed replays identically | unchanged; the module default seed is now fixed too |
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
takes the family's two-hander, a nimble pawn its one-hander. **Exception: flail is 1H-only**, so a
strong pawn currently has no flail (task 7).

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

## Phase 0 — Unblock the measurements

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

## Phase 1 — Damage resolves through the stats

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

- [ ] **Author a 2H flail.** Flail is the one melee family with no two-handed version, so a strong pawn has no flail at any age (`statAxisProposal` → FAMILY REACH).
- [ ] **Author the banner polearm** — a CHARISMA-scaled reach weapon that raises the bearer's `prestige` (the stat already exists, fed by `SocialService`). Rapier-shaped: a special case that gives one more core stat a weapon to belong to.
- [ ] Check 1H sword coverage at the runed tier — the T4 band has no one-handed sword, so a nimble pawn's sword line stops at steel.

---

## Phase 2 — The aptitude axis

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

- [ ] Pawn panel: an aptitude block beside the core stats — it is the thing that distinguishes two pawns and it must be visible before it can matter to the player.
- [ ] `/gear-db` → **Stats by build**: re-point the "read by" column once the wiring changes, and drop the `✕ dead` markers the fixes clear.

---

## Phase 3 — Precision does what its description says

### 11. Aim for lethality, not for bare skin

- [ ] `aimedBodyPart` scores candidates by **what the part contains** (`organsOf` → `isVital` / `artery` / `isCritical`) plus `bleedRatio`, with armour as a **discount** rather than the whole criterion ([Combat.ts:795](../../../src/lib/game/systems/Combat.ts)).
- [ ] Let precision buy **candidate rolls** — fractional, so it pays smoothly. The shipped rule always rolls exactly 3 behind a probability gate, so a small target (the neck is 1.5% of the hit table) is almost never found however precise the fighter is.
- [ ] Re-run the fight sim; `lumbering-fighter` on a stiletto must stop being an upgrade.

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

Everything here was measured against the OLD stat economy and has to be re-measured once Phases 1–3
land; several may resolve on their own.

### 12. The cadence floor

- [ ] Re-measure first — the floor's damage was that AGILITY kept buying swings on slow weapons, and Phase 1 removes AGILITY from the damage of those weapons entirely.
- [ ] Then decide whether `MIN_ATTACK_INTERVAL_TICKS` (72 against a 120 base → 1.67× ceiling) is still the right ceiling.
- [ ] Note the trap: a uniform speed rescale only **delays** the ceiling and doubles as a 2H nerf. Measured, not guessed — `weaponStatSweep` → "PROPOSAL C".

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
