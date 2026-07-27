<!-- COMBAT-BALANCE — the fix list coming out of the tier-4 weapon/stat/trait audit (2026-07-27).
     Findings live in AUDIT.md § Weapons; this file is the WORK. Every task carries the measurement it
     came from so a fix can be checked against the same number that justified it. -->

# COMBAT-BALANCE — Logic Errors & Stat-Economy Fixes

> **Related:** [AUDIT § Weapons](AUDIT.md) · [DESIGN](../../game/DESIGN.md) · [DECISIONS](../../game/DECISIONS.md) · [ROADMAP](ROADMAP.md) · [STEALTH](STEALTH.md)

**Status:** findings measured and recorded 2026-07-27; **no task below is started.** Four engine fixes
already landed in the same pass (power-curve soft cap, armour-condition soak, `powerStat`,
`critMultiplier` + the heavy-2H accuracy/speed pass) — those are logged as done in
[AUDIT § Weapons](AUDIT.md), not repeated here.

**How every number below was produced.** Two harnesses, and the distinction matters when checking a fix:

| harness | what it drives | evidence class |
| --- | --- | --- |
| `src/tests/game/systems/t4WeaponAudit.test.ts` | real `resolveHit` + real cadence, every T4 weapon × 5 stats × 113 traits × 3 opponents | analytical — `[~]` |
| `src/tests/game/systems/weaponStatSweep.test.ts` | real `resolveHit`, defence matrix / precision / proposal pricing | analytical — `[~]` |
| `src/tests/game/systems/weaponFightSim.test.ts` | `HeadlessSession`, 1v1 vs a live Orc Reaver, mean of 8 seeds | headless — `[x]` |

A balance claim is only `[x]` when the **fight sim** shows it. A sweep number is a supplement.

---

## P0 — Logic errors (code contradicts its own data or docs)

These are bugs, not tuning. Each is small, each is unambiguous, and #2 in particular means a whole
system silently doesn't apply.

### 1. Every `*Penalty` RAISES the stat it should lower
- [ ] Decide the fix direction: negate at the **bake sites** (subtract) or negate in the **data** (author penalties as negative). Bake-site is one line each and leaves 103 data entries untouched.
- [ ] Apply to `applyCulturalTraitBonuses` ([Pawns.ts:867](../../../src/lib/game/entities/Pawns.ts)) — generation.
- [ ] Apply to `applyGainedTrait` ([Pawns.ts:272](../../../src/lib/game/entities/Pawns.ts)) — growth events, trait gambles, `devSetPawnTraits`.
- [ ] Keep the `max(1, …)` floor so a stacked flaw can't drive a stat to zero or negative.
- [ ] Re-point the pinning test (`t4WeaponAudit` → "every `*Penalty` RAISES its stat") at the corrected behaviour — it currently pins the BUG on purpose so it can't change silently.
- [ ] Re-run the trait sweep and confirm the negative twins invert.

> **Evidence.** All 103 penalty entries in `traits.jsonc` are authored positive and both bake paths do
> `stats[k] = max(1, stats[k] + value)`. `frail` grants **+2 CON**, `clumsy` **+2 DEX**, `dull` **+2 INT**.
> The sweep shows a flaw scoring identically to its blessing:
>
> | trait | rarity | best-case dps |
> | --- | --- | --- |
> | `str-dex-plus-5` | epic | +45.4% |
> | `str-dex-minus-5` | **negative** | **+45.4%** |
> | `accursed-blood-5` | **epic, all-penalty** | **+49.1%** |
> | `all-plus-5` | legendary | +49.1% |
>
> ⚠ **Blast radius:** this moves every stat on every pawn in every existing save. It is a deliberate
> call, not a drive-by — expect to re-check encounter pacing after it lands.

### 2. `melee_damage` and `hit_chance` are never evaluated — melee ignores injury
- [ ] Decide per stat: **wire it in** or **delete the formula** from `stats.jsonc`. A documented stat that nothing reads is worse than no stat.
- [ ] `hit_chance` — if wiring: melee to-hit should read the stat (so `× sight × manipulation` applies) instead of raw `dex`, in `resolveHit`'s `toHit`.
- [ ] `melee_damage` — if wiring: fold it into the damage roll beside `powerScale`, or fold `manipulation` into `powerScale` directly. Careful not to double-count STR (the stat and `powerScale` both key off it).
- [ ] Add a regression test: a blinded / one-armed pawn must land fewer melee blows than an unhurt one.
- [ ] Re-check the ranged path still behaves — `aim_accuracy` already applies both capacities, so melee is the outlier, not ranged.

> **Evidence.** `evaluateStat('melee_damage')` and `evaluateStat('hit_chance')` have **zero callsites**
> outside tests. Melee to-hit is `60 + (dex−10) + accuracy×2 − (dodge−1)×50` off raw, condition-scaled
> DEX ([Combat.ts:533](../../../src/lib/game/systems/Combat.ts)); damage comes from `powerScale`.
> **So `sight` and `manipulation` do not affect melee at all** — a blinded pawn or one with a mangled arm
> hits exactly as often and as hard as an unhurt one, while the stat descriptions promise otherwise and
> the ranged path honours both.

### 3. `giants-grip` bypasses the power soft cap
- [ ] Move the trait's `melee_damage` bonus inside the damped path, or damp it separately — it currently multiplies `baseDamage` directly in `weaponBonusDamage` ([Combat.ts:508-519](../../../src/lib/game/systems/Combat.ts)), outside `powerScale`.
- [ ] Re-price it afterwards; it should stop being an auto-include in every optimal stack.

> **Evidence.** +45.3% (Orc Greataxe vs knight) and present in **every** trait pile the audit assembled,
> 1H and 2H alike. It is the one damage source the new cap cannot reach.

### 4. Precision can make a low-damage weapon WORSE
- [ ] Confirm the cause: instrument which `bodyPart` a dagger actually lands on at high vs low `hit_precision`.
- [ ] If confirmed — weight `aimedBodyPart`'s roll by whether the part can contribute to a kill, not by armour alone. "Find the gap" should not mean "keep stabbing the hand".
- [ ] Re-run the fight sim; `lumbering-fighter` on a stiletto must stop being an upgrade.

> **Evidence.** Headless, 8 seeds: stiletto + `lumbering-fighter` (`attack_speed ×0.6`,
> `hit_precision ×0.75`) kills an Orc Reaver in **1290 mean ticks vs 2500 unimpaired — ×1.94 FASTER
> while crippled.** Hypothesis (unverified): `aimedBodyPart` biases toward the least-armoured part, which
> for a dagger is an extremity.

### 5. The sim RNG defaults to a non-deterministic seed
- [ ] `new SeededRng()` falls back to `Date.now() ^ Math.random()` ([rng.ts:52](../../../src/lib/game/core/rng.ts)) — decide whether the module singleton should default to a fixed seed instead.
- [ ] Reseed in `lairEscalation.test.ts` (fails ~1 run in 3 in isolation).
- [ ] Sweep the suite for other tests that drive sim code without reseeding.

> **Why it's on a balance list:** every tuning measurement below is only as trustworthy as the RNG.
> Fix this **before** the tuning pass, not after.

---

## P1 — The stat economy (one problem, seen from two directions)

Tasks 6 and 7 are the same imbalance and should be designed together.

### 6. DEX is the best stat on 15 of 16 T4 melee weapons — including every STR weapon
- [ ] Pick the lever. STR buys **one** damped channel (damage, ≤4× since the soft cap); DEX buys **three** undamped ones (cadence to the interval floor, `+1` to-hit per point via `DEX_HIT_WEIGHT`, `+0.005` crit per point).
  - [ ] Option A — damp the melee to-hit term (diminishing, or lower `DEX_HIT_WEIGHT`).
  - [ ] Option B — give STR a second channel of its own (armour damage already scales on STR; a knock-down or stagger axis would fit the frontline fantasy).
  - [ ] Option C — make `hit_precision` cost DEX rather than come free with it.
- [ ] **Do not** loosen `POWER_SOFT_CAP` to chase parity — it would need ≈99, i.e. no cap, which reinstates the runaway that was just fixed.
- [ ] Acceptance: each weapon's own `powerStat` is its best stat, tested across all three opponent profiles.

> **Evidence.** Warhammer at stat 40 vs a raider: STR 19.1, **DEX 24.9**. Greatsword: STR 12.6, DEX 17.4.
> **The control case proves the mechanism** — the Rune-Banded Longstaff is the only weapon that still
> prefers STR (20.0 vs 12.3), because its speed already sits at the cadence cap so DEX's biggest channel
> is dead for it.

### 7. The cadence floor throws away the fast classes' only lever
- [ ] Decide whether `MIN_ATTACK_INTERVAL_TICKS` (72 against a 120 base → 1.67× ceiling) is the right ceiling now that stats grow to 62–100.
- [ ] Note the trap: a uniform speed rescale only **delays** the ceiling (dagger DEX 14 → DEX 32) and doubles as a 2H nerf. Measured, not guessed — see `weaponStatSweep` → "PROPOSAL C".
- [ ] Acceptance: a fast weapon's speed advantage survives into the stat range pawns actually reach.

> **Evidence.** Weapon `attackSpeed` multiplies *into* the `attack_speed` stat before the clamp, so a
> 1.5-speed dagger is at its ceiling by **DEX 14** while a 0.7 greatsword climbs until **DEX 56**. DEX
> therefore pays *more* the slower your weapon is — the opposite of the intent.

### 8. Flat stat-pile traits outclass every purpose-built combat trait
- [ ] Re-rate the `*-plus-N` family, or accept them as strictly-better and rebalance the designed combat traits upward.
- [ ] Acceptance: no `rare` stat-pile trait outperforms an `epic` combat trait.

> **Evidence.** `all-plus-5` +49.1%, `str-dex-plus-5` +45.4%, `dex-plus-5` (**rare**) +35.5% — all above
> `quick-striking` (+25.7%) and `killer-instinct` (**epic**, +18.0%). They win because they feed the DEX
> channels in #6.

### 9. Trait swing is asymmetric and very wide
- [ ] Decide an intended band for a single trait's combat swing, then bring the outliers into it.
- [ ] `whirlwind` (epic, `attack_speed ×1.5` + `hit_precision ×1.5`) — **+78.5%**, strongest in the game, top pick in every 2H pile.
- [ ] `lumbering-fighter` (negative) — **−45.3%**, roughly double the swing of the best positive common.
- [ ] Acceptance: best legal five-trait pile lands inside the agreed band. Currently **×4.47 on paper** (Rune-Sung Greatsword vs knight, 18.3 → 82.1 dps) and **×1.72 in a real fight** — tune against the fight number, not the sweep.

---

## P2 — Data passes

### 10. The warhammer line is out of band
- [ ] Re-rate `iron_warhammer` (34 dmg) and `steel_warhammer` (40) against their own family and the other 2H lines.
- [ ] Acceptance: no iron-age weapon out-damages the steel band.

> **Evidence.** Iron Warhammer beats every steel weapon except its own successor, while also carrying the
> best pen (0.50) and armour damage (10). Highest dps against all three opponent profiles at every stat
> level tested.

### 11. Per-weapon confirmation (the 20-row T4 tracker)
- [ ] Work the per-weapon checklist in [AUDIT § Weapons](AUDIT.md) once #6 lands — every melee row is blocked on the DEX finding, so none can be ticked before it.
- [ ] The 4 ranged/thrown T4 weapons still need their own pass; the melee sweep does not cover the ranged path.

---

## Sequencing

1. **#5** first — the RNG default, so everything after it is measurable.
2. **#1** and **#2** — small, unambiguous, and #2 restores a whole system (injury → melee).
3. **#6 + #7** together — one problem, two directions. The biggest design call in the list.
4. **#3, #4, #8, #9** — fall out of the above and re-price cheaply against the existing harnesses.
5. **#10, #11** — data passes, any time.

## Verification gate

- [ ] `pnpm check` clean.
- [ ] `pnpm test:related` on every edited file (full suite only if `Combat.ts` / `stats.jsonc` / `traits.jsonc` moved).
- [ ] `t4WeaponAudit` + `weaponStatSweep` re-run and their tables pasted into [AUDIT § Weapons](AUDIT.md).
- [ ] `weaponFightSim` re-run — a balance claim is `[x]` only with the mean-of-8-seeds fight number behind it, stated with its delta.
