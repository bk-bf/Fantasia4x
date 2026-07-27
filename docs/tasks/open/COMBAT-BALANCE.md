<!-- COMBAT-BALANCE — the two-axis stat rebuild plus the logic errors the tier-4 audit turned up
     (findings 2026-07-27, design settled 2026-07-27). Findings live in AUDIT.md § Weapons; this file
     is the WORK. Every task carries the measurement it came from, so a fix can be checked against the
     same number that justified it. -->

# COMBAT-BALANCE — The Two-Axis Stat Rebuild

> **Related:** [AUDIT § Weapons](AUDIT.md) · [DESIGN](../../game/DESIGN.md) · [DECISIONS](../../game/DECISIONS.md) · [ROADMAP](ROADMAP.md) · [STEALTH](STEALTH.md)

**Status:** design settled, **no task below is started.** Four engine fixes already landed in the audit
pass (power-curve soft cap, armour-condition soak, `powerStat`, `critMultiplier` + the heavy-2H
accuracy/speed pass) — logged as done in [AUDIT § Weapons](AUDIT.md), not repeated here.

**How every number below was produced.** Four harnesses; the distinction matters when checking a fix:

| harness | what it drives | evidence class |
| --- | --- | --- |
| `src/tests/game/systems/statAxisProposal.test.ts` | the two-axis model against the shipped math; real `resolveHit` damage kernel, modelled to-hit / cadence / part selection | analytical — `[~]` |
| `src/tests/game/systems/t4WeaponAudit.test.ts` | real `resolveHit` + real cadence, every T4 weapon × 5 stats × 113 traits × 3 opponents | analytical — `[~]` |
| `src/tests/game/systems/weaponStatSweep.test.ts` | real `resolveHit`, defence matrix / precision / proposal pricing | analytical — `[~]` |
| `src/tests/game/systems/weaponFightSim.test.ts` | `HeadlessSession`, 1v1 vs a live Orc Reaver, mean of 8 seeds | headless — `[x]` |

A balance claim is only `[x]` when the **fight sim** shows it. A sweep number is a supplement.

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

- [ ] Re-author penalties as **signed bonuses** in `traits.jsonc` (`"agilityBonus": -5`), dropping the `*Penalty` key entirely — 68 traits.
- [ ] Collapse both bake paths to one signed add with no key-suffix branch: `applyCulturalTraitBonuses` ([Pawns.ts:867](../../../src/lib/game/entities/Pawns.ts)) and `applyGainedTrait` ([Pawns.ts:272](../../../src/lib/game/entities/Pawns.ts)).
- [ ] Keep the `max(1, …)` floor so a stacked flaw can't drive a stat to zero or negative.
- [ ] Re-point the pinning test (`t4WeaponAudit` → "every `*Penalty` RAISES its stat") at the corrected behaviour — it pins the BUG on purpose today so it can't change silently.
- [ ] Re-run the trait sweep and confirm the negative twins invert.

> **Evidence.** All penalty entries are authored positive and both bake paths do
> `stats[k] = max(1, stats[k] + value)`. `frail` grants **+2 VIGOUR**, `clumsy` **+2 AGILITY**, `dull` **+2 INTELLECT**.
> A flaw scores identically to its blessing: `str-dex-minus-5` **+45.4%** vs `str-dex-plus-5` +45.4%;
> `accursed-blood-5` (epic, all-penalty) **+49.1%**.
> **68 traits author a `*Penalty`; 0 author a negative `*Bonus`**, so the migration cannot double-negate
> anything already shipped (`statAxisProposal` → SIGNED STAT GRANTS).
>
> ⚠ **Blast radius:** this moves every stat on every pawn in every existing save. Expect to re-check
> encounter pacing after it lands.

### 2. The sim RNG defaults to a non-deterministic seed

- [ ] `new SeededRng()` falls back to `Date.now() ^ Math.random()` ([rng.ts:52](../../../src/lib/game/core/rng.ts)) — decide whether the module singleton should default to a fixed seed instead.
- [ ] Reseed in `lairEscalation.test.ts` (fails ~1 run in 3 in isolation).
- [ ] Sweep the suite for other tests that drive sim code without reseeding.

---

## Phase 1 — Damage resolves through the stats

This is the fix for "melee ignores injury" **and** the fix for the power stat being decoration. One
change: `resolveHit` stops reading a raw core stat and reads the damage stat instead.

### 3. Wire `melee_damage` / `ranged_damage` as the damage path

- [ ] `resolveHit` replaces `baseDamage × powerScale(powerStat)` with `baseDamage × evaluateStat('melee_damage' | 'ranged_damage', attacker)` ([Combat.ts:988](../../../src/lib/game/systems/Combat.ts)).
- [ ] Add a `POWER` token to the formula evaluator, resolving to the equipped weapon's power-stat value — the same mechanism `SKILL` already uses for the work stats, so no new concept.
- [ ] Rewrite both formulas against it: `(1.0 + (POWER − 10) × 0.01) × manipulation`.
- [ ] Decide where the soft cap lives — cleanest is for `POWER` to resolve to `powerScale(stat) × 10` so the damping stays in one place and the formula stays linear (`clamp` is the only function the evaluator supports).
- [ ] Keep the `strScaled: false` bypass for crossbow/sling — the mechanism supplies the force, not the shooter.
- [ ] Regression test: a pawn with a mangled arm must deal less melee damage than an unhurt one.

> **Evidence.** `evaluateStat('melee_damage')` and `evaluateStat('ranged_damage')` have **zero
> callsites** outside tests. Damage comes from `powerScale` on the raw stat, so **`manipulation` does
> not affect melee damage at all** — a pawn with a mangled arm hits exactly as hard as an unhurt one,
> while the stat description promises otherwise.

### 4. Set each weapon's power stat by its grip

- [ ] Sweep `items.jsonc`: `powerStat: "brawn"` on every two-handed melee weapon, `"agility"` on every one-handed melee weapon.
- [ ] Leave the finesse/rapier line on `"awareness"` and the arcane line on `"intellect"`.
- [ ] Ranged: `"awareness"` — and confirm it doesn't double-count with `aim_accuracy`, which is already AWARENESS.
- [ ] Acceptance: each weapon's own power stat is its best stat, across all three opponent profiles.

> **Evidence.** Today the named power stat loses on **6 of 16** tier-4 melee weapons — **6 of 8
> two-handers, 0 of 8 one-handers**. Warhammer BRAWN-40 **20.8** vs AGILITY-40 **23.8**; greatsword 12.9 vs
> 13.3. The mechanism is the cadence floor: a 0.55-speed greataxe sits far below the 1.67× ceiling so
> every AGILITY point still buys swings, while a 0.9-speed mace is already capped and AGILITY's biggest channel
> is dead there. **AGILITY pays more the slower your weapon is** — so it steals exactly the weapons BRAWN is
> supposed to own.
>
> Modelled with damage on the grip: **16 of 16** answer to the physique their grip names, and the
> warhammer inversion reverses to **17.2 BRAWN / 6.2 AGILITY** (`statAxisProposal` → ADOPTED).

### 5. Fold `hit_chance` into the melee to-hit roll

- [ ] `resolveHit`'s `toHit` reads `evaluateStat('hit_chance', attacker)` instead of raw, condition-scaled `dex` ([Combat.ts:925-931](../../../src/lib/game/systems/Combat.ts)), so `× sight × manipulation` finally applies.
- [ ] Regression test: a blinded pawn must land fewer melee blows than an unhurt one.
- [ ] Re-check the ranged path is unaffected — `aim_accuracy` already applies both capacities, so melee is the outlier, not ranged.

### 6. Delete `vision_range`

- [ ] Nothing reads it; `core/vision.baseVisionRange` returns TILES from raw AWARENESS and is shared by pawns and mobs. Remove the formula rather than leave a documented stat that does nothing.
- [ ] Check the pawn stat panel and `/gear-db` → Stats by build for references before removing.

### 7. Data: the gaps this mapping exposes

- [ ] **Author a 2H flail.** Flail is the one melee family with no two-handed version, so a strong pawn has no flail at any age (`statAxisProposal` → FAMILY REACH).
- [ ] **Author the banner polearm** — a CHARISMA-scaled reach weapon that raises the bearer's `prestige` (the stat already exists, fed by `SocialService`). Rapier-shaped: a special case that gives one more core stat a weapon to belong to.
- [ ] Check 1H sword coverage at the runed tier — the T4 band has no one-handed sword, so a nimble pawn's sword line stops at steel.

---

## Phase 2 — The aptitude axis

Only after Phase 1, so the damage axis is already honest when the second axis lands on top of it.

### 8. Roll and store aptitudes

- [ ] Add `pawn.aptitudes` — a small record keyed by the same stat ids, rolled beside `rollStatsFromRanges` ([Pawns.ts:811](../../../src/lib/game/entities/Pawns.ts)).
- [ ] Roll **independently of the core stats** — a stat-biased roll re-introduces the AGILITY correlation through the side door.
- [ ] Triangular distribution over the band so an extreme aptitude is rare, not one roll in three.
- [ ] Modify by body size and traits at generation; let the existing growth events move them.
- [ ] Decide the band. ⚠ At ±0.25 on `hit_chance` + `attack_speed` + `hit_precision` together the swing is **+95%** — too wide. Either narrow the band or stop the three compounding.
- [ ] Persist through save/load; decide the default for pawns in existing saves (1.0 across the board is the safe migration).

### 9. Re-source the six aptitude stats

- [ ] `hit_chance`, `attack_speed`, `hit_precision`, `armor_damage`, `dodge`, `aim_accuracy`: formula reads the pawn's rolled aptitude instead of a core stat, still `×` its capacity terms.
- [ ] Keep every id, name and description — this is a source change, not a rename.
- [ ] `dodge` keeps its `− (weight − 70) × 0.002` term: mass is physique, and a heavy pawn should still evade worse however well it rolled.
- [ ] Leave `block` derived (VIGOUR + body mass + shield) — none of those three is skill.
- [ ] Acceptance: two pawns with identical core stats produce measurably different dps AND different survivability, and **no core stat correlates with hit rate, cadence, crit, evasion or marksmanship**.

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

> **Evidence.** Real `resolveHit`, stiletto vs mail hauberk + nasal helm: blows landing somewhere that
> can kill **fall** from **54.1%** at precision 0.053 to **44.7%** at 0.317 — precision currently makes
> a dagger *less* lethal, because scoring by armour alone walks the blow off the covered chest onto a
> bare thigh. Dividing by armour is the error: on an armoured target the lethal parts ARE the covered
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

- [ ] `pnpm check` clean.
- [ ] `pnpm test:related` on every edited file (full suite if `Combat.ts` / `stats.jsonc` / `traits.jsonc` moved).
- [ ] `statAxisProposal` re-pointed at the shipped math — every model it currently owns should collapse into a direct engine assertion once the engine does the thing.
- [ ] `t4WeaponAudit` + `weaponStatSweep` re-run and their tables pasted into [AUDIT § Weapons](AUDIT.md).
- [ ] `weaponFightSim` re-run — a balance claim is `[x]` only with the mean-of-8-seeds fight number behind it, stated with its delta.
