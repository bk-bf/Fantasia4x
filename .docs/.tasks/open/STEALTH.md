<!-- STEALTH — a specialised sneak build: size-driven stealth value vs creature detection, a hit-and-run
     assassin identity. Phase 1 = pawns only. Design locked with the user 2026-07-10; built 2026-07-14. -->

# STEALTH — Sneak Value, Detection Rolls & the Hit-and-Run Assassin

> **Related:** [DESIGN](../../game/DESIGN.md) · [DECISIONS](../../game/DECISIONS.md) (ADR-032) · [ROADMAP](ROADMAP.md) · [TRAITS (archived)](../archive/TRAITS-2026-07-10.md) · [ENTITIES_SPAWNING (archived)](../archive/ENTITIES_SPAWNING-2026-07-10.md) · [ENGINE-PERFORMANCE](../archive/ENGINE-PERFORMANCE.md)

**Status:** Phase 1 **built 2026-07-14** (landed as **ADR-032** — this spec's "ADR-031" draft number
was taken by hide wear in the interim). The **encounter balance pass is the one open item** (§12).
Phase 2 (screen-invisible stealthy creatures) stays deferred. Build-time deviations, each reconciling
the spec against systems that landed after it locked:

- `matted-hide` is NOT a new trait — the existing `downy-coat → thick-fur → winter-mane` pelt chain
  IS the beast tanky fork (ADR-029 moved natural armour onto the trait), and `getStealth` now drags
  stealth −0.04 per `naturalArmor` point generically, so ANY pelt/plating vetoes the prowl by itself.
- The generic personal trait ships as **`soft-tread`** (`light-footed` already exists as the
  dodge/knockdown trait).
- `chameleon-skin` keeps its id but is NAMED **"Chameleon Guise"** (ADR-028 naming law: no anatomy
  words in stat/attribute trait names).
- Armour `stealthMod` is **auto-derived from weight** (−0.03/kg) with an explicit value only on the
  soot-darkened jerkin — §13's recommended resolution of that dial.
- The stats.jsonc formula engine gained **`clamp()`** (it had none) for the DEX hard gate.

---

## 1. The Fantasy — a hit-and-run assassin, not a duelist

A **small, deft, lightly-armoured** pawn can cross a creature's vision undetected, land one devastating
opening strike (precision massively boosted), and is then **auto-revealed** — the only way to strike from
stealth again is to **break contact, leave vision, and re-approach**. That loop *is* the build: a phantom
that bleeds a target over multiple passes, never a stand-and-fight killer. It is deliberately **hard to
assemble** — you need small size **and** high DEX **and** intact movement **and** the right traits **and**
little/no armour. Nothing that exists today is stealthy (verified in §9).

Size is **by far the dominant driver** (smaller = quieter), DEX is a **hard gate** (below a floor, stealth
is literally zero), and armour/natural-armour **subtracts** from it. This is what keeps large lineages
(beast, werewolf) poor at stealth *for free* — their body mass tanks the base term with no special-casing.

## 2. Locked design decisions (from the 2026-07-10 Q&A)

- [x] **Always-on passive.** Every pawn's stealth value passively gates whether creatures *acquire* them as
  a target — no stance toggle. A nimble scout naturally avoids notice; the reward only fires when an
  undetected pawn actually lands a hit.
- [x] **Reward = ×3–4 on `hit_precision`** while undetected (final multiplier a tuning dial, §6). Doubling a
  ~0.05 base is too weak for a fully specialised build.
- [x] **A stealth strike auto-reveals** the pawn. No chain-backstab. To re-strike from stealth you must exit
  the creature's vision range and re-enter → **hit-and-run**.
- [x] **Re-stealth reuses the existing LOS give-up path** ([entityAI.ts](../../../src/lib/game/services/entity/entityAI.ts) `lastSeenX/Y` memory): break line-of-sight + leave
  vision → the mob forgets → the pawn is stealthable again.

## 3. Where it plugs in (all pre-existing machinery)

The detection half is a **filter on an existing gate**, not a new subsystem:

| Need | Existing hook | File |
| --- | --- | --- |
| "pawn is in a creature's vision" | `inVision = nearest within visionRange && hasLineOfSight(...)` | [entityAI.ts:594](../../../src/lib/game/services/entity/entityAI.ts#L594) |
| creature detection ingredients (PER + sight + nightVision + light + weather) | `effectiveVisionRange(mob, tileLight, weatherSightMul)` + `mob.effectiveLight` | [entityAI.ts:585-589](../../../src/lib/game/services/entity/entityAI.ts#L585) |
| night dampening helper | `dampenLightByNightVision(light, nightVision)` | [vision.ts:79](../../../src/lib/game/core/vision.ts#L79) |
| trait-summed derived value pattern to copy | `getNightVision()` (sums traits + living parts + conditions + def) | [vision.ts:14-61](../../../src/lib/game/core/vision.ts#L14) |
| the reward (crit → aimed vital part), **melee AND ranged** | `resolveHit` rolls `hit_precision + weapon.critMod` | [Combat.ts:789-804](../../../src/lib/game/systems/Combat.ts#L789) |
| weapon precision field | `weaponProperties.critMod` (added to attacker `hit_precision`) | [items.jsonc:3341](../../../src/lib/game/database/items.jsonc#L3341) |
| armour stealth field (exists, unused) | `armorProperties.stealthBonus` → **rename `stealthMod`** | [items.ts:515](../../../src/lib/game/core/types/items.ts#L515) |

Because `resolveHit` runs the same `hit_precision + critMod` crit for **both** melee and ranged shots, the
undetected-strike reward boosts a sneak-shot exactly like a dagger — **the ranged stealth class needs no
extra reward plumbing**, only precision (high-`critMod`) ranged weapons (§8).

## 4. The stealth value — `getStealth(pawn)`

Two layers, mirroring how `night_vision` works (a formula base + a summed trait/gear layer):

**Layer A — base (formula engine, `stats.jsonc`).** New `stealth` combat stat; multiplicative AND-gate so
*both* small size and high DEX are required, `× moving` so injury nullifies it:

```jsonc
{
  "id": "stealth",
  "category": "combat",
  "primaryStat": "dexterity",
  // sizeFactor (weight, dominant) × dexGate (hard floor at DEX 8) × moving
  "formula": "clamp(1 + (70 − weight) × 0.015, 0.2, 2.2) × clamp((DEX − 8) × 0.1, 0.0, 1.4) × moving",
  "description": "how easily the body goes unnoticed — a small, deft, sound-footed frame slips a watch that a big or clumsy one never could (× moving; a bad leg gives you away). Armour and a heavy tread cost it."
}
```

- `sizeFactor`: 40 kg → 1.45, 70 kg → 1.0, 120 kg → 0.25 (clamped 0.2–2.2). **Dominant term.**
- `dexGate`: DEX ≤ 8 → **0** (hard blocker); DEX 10 → 0.2; DEX 16 → 0.8; DEX 20 → 1.2 (clamp cap 1.4).
- Default pawn (70 kg, DEX 10): `1.0 × 0.2 × 1 = 0.2` → effectively a non-stealther.

**Layer B — `getStealth(pawn)` (new pure fn, `core/stealth.ts`, copy `getNightVision`'s shape):**

```
getStealth(pawn) = clamp(
    evaluateStat('stealth', pawn)                       // Layer A base
  + Σ trait.effects.stealth        (traits, §7)         // flat additive, like nightVision
  + Σ livingPart.grants.stealth    (body parts, future) // e.g. slime membrane
  + Σ equippedArmor.stealthMod     (gear, §8; negative) // heavy armour subtracts
, 0, ∞)
```

Additive (not multiplicative) trait bonuses — same choice `getNightVision` makes — so a `+0.5` chameleon
skin stays meaningful on a base that starts near 0.2. Target scale: master specialist ≈ **1.5–2.2**.

## 5. Detection roll (creature side)

Runs **only when the pawn is already `inVision` + has LOS** (so it rides the existing per-mob scan; no new
spatial sweep), on a **per-mob ~2 s timer** (not every tick), result cached between rolls.

```
detectionScore = clamp((mobPER − 8) × 0.12, 0, ∞) × dampenLightByNightVision(tileLight, getNightVision(mob))
proximityFrac  = 1 − dist / visionRange                    // 0 at the vision edge, 1 point-blank
pDetect        = clamp( 0.12 + (detectionScore − getStealth(pawn)) × 0.15 + proximityFrac × 0.25,
                        0.02, 0.85 )
```

- The **+0.25 proximity term** is your "detection is 25 % higher adjacent than at the border", as a flat
  additive on the per-check probability, ramping linearly with closeness.
- **On a detection success**, the mob acquires as normal — the existing hostile/prey FSM takes over.
- **On failure**, treat the candidate as *not in vision*: `nearestPawn` must **skip undetected candidates**
  ([entityHelpers.ts](../../../src/lib/game/services/entity/entityHelpers.ts) `nearestPawn`) so an undetected pawn can't body-block aggro for a visible ally behind them.
- **Night synergy is free**: `visionRange` already shrinks and `effectiveLight` already dims at night for
  low-`nightVision` creatures, so stealth is automatically stronger after dark against diurnal animals,
  while nocturnal predators (wolf 0.9, shadow_wraith 1.0) stay dangerous. Ties straight into the lunar work.

**Worked examples** (per 2 s check; constants are dials):

| Scenario | detScore | getStealth | at border | adjacent |
| --- | --- | --- | --- | --- |
| Specialist (1.6) vs Wolf (PER 8, day) | 0.0 | 1.6 | 0.02 (clamp) | ~0.13 |
| Specialist (1.6) vs Deer (PER 20, day) | 1.44 | 1.6 | ~0.10 | ~0.35 |
| Default pawn (0.2) vs Wolf | 0.0 | 0.2 | ~0.09 | ~0.34 |

Calibration note: sight-only detection makes **dull-eyed predators (wolf/boar, PER 6–9) easy to sneak** and
**sharp-eyed grazers (deer/elk, PER 20) hard**. That's acceptable for v1; a **hearing/smell channel** (heavy
gear = noise, canines = nose) is the realism upgrade parked for Phase 2 (§10). Validate the constants the
same way `threat-model.mjs` validates combat: pick targets so a full edge→adjacent approach leaves a
specialist ~40–60 % likely to cross a mid-PER animal undetected.

## 6. The reward — undetected strike

- While `pawn.detectedBy` does **not** contain the target mob, an attack against it evaluates
  `hit_precision × STEALTH_STRIKE_MULT` (start **3.5**, dial 3–4) inside `resolveHit` before the
  `+ critMod` add. This raises the chance of the aimed-vital-part crit ("finds a gap — an eye, the throat").
- **Immediately after the hit lands, mark the pawn detected** by that mob (and its pack via existing pack
  aggro) → auto-reveal. The bonus does **not** apply to the second swing.
- Applies to **melee and ranged** identically (shared `resolveHit` path) — no branch needed.

## 7. Trait proposals (`traits.jsonc`)

New additive effects key **`stealth`** (flat, consumed by `getStealth`). All strings player-facing —
imply, never instruct; no ADR/§ refs in `description`/`flavorLine`. Values are the tuning dials.

### 7a. The Beast lineage split (the user's ask: a moderately-*stealthy* OR a moderately-*tanky* beast)

A beast is not innately small, so even the stealth path only ever reaches **moderate** — the size term caps
it. The two paths are mutually-tensioned (armour kills stealth), and **Constant Howling** can veto the
stealth path outright.

```jsonc
// STEALTH path — soft-footed predator's tread. No natural armour → keeps the frame quiet.
{
  "id": "padded-prowl", "scope": "cultural", "rarity": "rare", "kind": "attribute",
  "lineage": ["beast"], "name": "Padded Prowl",
  "description": "They move on the balls of their feet, weight rolling silent through each step, the way a cat crosses a room.",
  "flavorLine": "you never hear them come into the room",
  "effects": { "stealth": 0.4 }
}
```
```jsonc
// TANKY path — a matted, hardened pelt: natural armour, but it rustles and bulks (stealthMod penalty).
{
  "id": "matted-hide", "scope": "cultural", "rarity": "rare", "kind": "naturalGear",
  "lineage": ["beast"], "name": "Matted Hide",
  "description": "A thick, felted pelt over a hardened hide that turns a claw or a careless blade.",
  "flavorLine": "blows land on them with a dull, padded sound",
  "selfCondition": "matted_hide",   // natural armour condition; its item carries stealthMod ≈ −0.5 (§8)
  "effects": {}
}
```
```jsonc
// NEGATIVE — vetoes stealth. If a pawn rolls this, a stealthy beast is off the table.
{
  "id": "constant-howling", "scope": "cultural", "rarity": "negative", "kind": "attribute",
  "lineage": ["beast", "werewolf"], "name": "Constant Howling",
  "description": "The throat is never wholly quiet — a low growl under the breath, a huff, the odd cry answered from the tree line.",
  "flavorLine": "even asleep they mutter and grumble at something",
  "effects": { "stealth": -1.5 }
}
```

**Net effect:** a stealthy beast requires a *small-ish, high-DEX* beast pawn that rolls **Padded Prowl**,
does **not** roll **Matted Hide** or **Constant Howling** — a genuinely nuanced, low-probability roll, which
is exactly the intended rarity. (Reconcile `matted-hide` with any existing beast fur/pelt trait; if a pelt
trait already grants cold resistance, `matted-hide` is the distinct *natural-armour* variant.)

### 7b. Other lineage / generic stealth traits

```jsonc
// AMPHIBIAN — colour-shifting hide.
{ "id": "chameleon-skin", "scope": "cultural", "rarity": "rare", "kind": "attribute",
  "lineage": ["amphibian"], "name": "Chameleon Skin",
  "description": "The skin drinks the colour of whatever lies behind it — bark, mud, wet stone — until the outline is simply gone.",
  "flavorLine": "against the reeds you lose them entirely", "effects": { "stealth": 0.5 } }

// ARACHNID — the ambush hunter's stillness.
{ "id": "ambush-stillness", "scope": "cultural", "rarity": "uncommon", "kind": "attribute",
  "lineage": ["arachnid"], "name": "Ambush Stillness",
  "description": "They can hold utterly motionless for as long as it takes, until the eye slides past them as part of the ground.",
  "flavorLine": "you'd swear the corner was empty a moment ago", "effects": { "stealth": 0.3 } }

// VAMPIRIC — a dusk-shroud (moderate; strongest in the dark it already loves).
{ "id": "duskshroud", "scope": "cultural", "rarity": "uncommon", "kind": "attribute",
  "lineage": ["vampiric"], "name": "Duskshroud",
  "description": "In low light the edges of them go soft and uncertain, as if the dark were reluctant to give them up.",
  "flavorLine": "at dusk you keep losing where they end and the shadow begins", "effects": { "stealth": 0.3 } }

// GENERIC (personal, non-lineage) — so a small vanilla race can build stealth too.
{ "id": "light-footed", "scope": "personal", "rarity": "uncommon", "kind": "attribute",
  "name": "Light-Footed",
  "description": "A quiet, economical way of moving that leaves the floorboards and the dry leaves undisturbed.",
  "flavorLine": "they cross a still room and nothing stirs", "effects": { "stealth": 0.25 } }

// FUTURE — slime lineage (does NOT exist yet in lineages.jsonc). Strongest bonus (see-through body).
// Ship only when the slime lineage lands; flagged here per the user's intent.
{ "id": "translucent-skin", "scope": "cultural", "rarity": "rare", "kind": "attribute",
  "lineage": ["slime"], "name": "Translucent Skin",
  "description": "Light passes half through them; at a distance they are little more than a smear of the wall behind.",
  "flavorLine": "you only catch them by the wet gleam", "effects": { "stealth": 0.6 } }
```

**Werewolf gets no additive stealth trait**: the transform's size/mass tanks the base term, and it shares
`constant-howling`. Beast/werewolf are moderate-at-most **by construction**, matching the brief.

## 8. Gear & weapon changes (`items.jsonc` / `items.ts`)

**Rename** `armorProperties.stealthBonus` → **`stealthMod`** (bonus *or* penalty; only a type-def reference
today, so the rename is a one-line change). `getStealth` sums equipped `stealthMod`.

**Armour boosts/subtracts stealth (`stealthMod`, additive, recommended values):**

| Armour class | `stealthMod` | Rationale |
| --- | --- | --- |
| none / cloth | 0 | baseline |
| soft leather / hide (light) | −0.1 | a whisper of bulk |
| a dedicated *padded/dark* stealth garment (new) | **+0.3** | the one armour that *helps* — see below |
| mail / scale | −0.4 | rings chime, weight in the tread |
| plate / heavy | −0.8 | zeroes out even a specialist |
| natural armour (`matted-hide`, quills, plate-hide) | −0.5 | the beast tanky↔stealth fork |

→ A stealth build wears **little or no armour** (reinforcing the glassy hit-and-run identity). Add **one new
light armour** (`shadowweave-cloak` / darkened padded jerkin) with `stealthMod: +0.3` and near-zero
protection — the deliberate stealth-gear choice.

**Weapons boost precision (`critMod`, already the mechanic) — both a melee and a ranged class:**

- **Melee (already served):** daggers/stiletto/punch-dagger already carry high `critMod` (0.12–0.15). No new
  data strictly needed; optionally tag them as the canonical stealth-melee line for UI/flavour.
- **Ranged (new — so precision is not melee-only):** the reward already flows through `resolveHit` for shots,
  so a precision ranged weapon completes the class:
  - **Blowgun** (new): very high `critMod` (~0.15), low base damage, silent theme, pairs with venom ammo
    (arachnid/`venom_bite` synergy). The archetypal ranged assassin tool.
  - **Hunting recurve / precision sling** variant: elevated `critMod` (~0.10) at the cost of `ranged_damage`,
    for a stealth archer that leans on the sneak-shot crit rather than raw draw power.
- *(Optional, advanced)* a **`silentWeapon` tag** that delays auto-reveal on a *ranged* stealth hit (the shot
  isn't traced to you) — a later perk, **not** in v1; v1 keeps auto-reveal uniform.

## 9. Constraint audit — nothing existing is stealthy

- **Every current pawn** (~70 kg, DEX ~10) → base ≈ 0.2; no current trait grants `stealth`. Non-stealthers. ✓
- **Beast / werewolf** → large mass tanks `sizeFactor` toward 0.25; no additive stealth unless they roll
  `padded-prowl`, and `constant-howling` / `matted-hide` can veto it → **moderate at most, by construction**. ✓
- **Arachnid / vampiric** → moderate additive (+0.3) only, and only if the underlying pawn is small+deft. ✓
- **`growth_impaired`-style −size traits** (if/when added) raise `sizeFactor` — a boon *only* on an
  already-small pawn, a wash on a big one. Falls out of the formula for free, as intended. ✓
- Because detection is **always-on passive**, re-run a balance pass on existing wolf/goblin encounters when
  tuning, so a mid-DEX scout doesn't accidentally trivialise them.

## 10. Phase 2 (deferred) — screen-invisible stealthy creatures

Extend the same roll to creatures: a creature with its own `stealth` value **vanishes from the player's view**
until a pawn with a **detection trait** (PER + sight + a new `stealthDetection` bonus) spots it. This is a
fog-of-war / render-gate concern (ADR-008 spatial visibility territory) plus the inverse of §5, and wants its
own pass. Also parks the **hearing/smell detection channel** (§5 realism upgrade). Out of scope for v1.

## 11. ADR-031 draft (add to `DECISIONS.md` + onboard into `codegraph.config.json` when built)

> ### ADR-031 [GAME]: Stealth as a Detection Filter on Existing Mob Vision (not a new subsystem)
> **Status:** Proposed. **Context.** A specialised sneak build needs a "creature notices pawn" gate.
> **Decision.** Stealth is a **filter inserted at the existing `inVision` gate** in `entityAI` — a per-mob
> ~2 s cached roll of `getStealth(pawn)` vs a PER/sight/nightVision detection score with a proximity term —
> **not** a parallel spatial system. `getStealth` mirrors `getNightVision` (formula base + summed
> trait/part/gear layer). The reward routes through the **existing `resolveHit` `hit_precision` crit** (so
> melee and ranged share it). **Consequences.** No new per-tick allocation or spatial sweep (rides the
> existing LOS-gated scan); `nearestPawn` gains a per-candidate stealth skip; the aggro-acquisition contract
> changes (always-on, affects all pawns) → needs an encounter balance pass.
>
> `codegraph.config.json` `adrRules`: likely `{ "adr": "ADR-031", "checkable": false, "reason": "runtime
> detection-roll behaviour, not a structural call-graph rule" }`.

## 12. Acceptance criteria

- [x] `stealth` stat added to `stats.jsonc` (size×DEX×moving base); `getStealth()` in `core/stealth.ts` sums
  base + trait `stealth` + part grants + armour `stealthMod`. *(2026-07-14 — `evaluateStat('stealth')`
  folds both layers; `compileFormula` gained `clamp()` for the DEX gate. `core/stealth.test.ts`.)*
- [x] `armorProperties.stealthBonus` renamed to `stealthMod`; summed by `getStealth`. *(2026-07-14 — with
  the weight-derived fallback, −0.03/kg, for unauthored pieces.)*
- [x] Detection roll wired at the `entityAI` `inVision` gate (per-mob ~2 s timer, cached; proximity +0.25;
  night dampening via `dampenLightByNightVision`); `nearestPawn` skips undetected candidates.
  *(2026-07-14 — `entityHelpers.isPawnDetected`, cache in `Mob.stealthChecks` (ENTITY_DROP-stripped,
  in-place mutation), jittered retry stamp; skip loop costs nothing while no stealther is in sight.)*
- [x] Undetected strike applies `×STEALTH_STRIKE_MULT` to `hit_precision` in `resolveHit`, then auto-reveals
  (self + pack); verified for **both** melee and ranged. *(2026-07-14 — mult 3.5 before `critMod`, under
  the existing 0.6 crit cap; reveal in `performAttack` on LANDED pawn→mob hits, packmates = shared
  lair/party within 12 tiles. Melee and ranged share the one `resolveHit` crit line.)*
- [x] Re-stealth reuses the LOS give-up / `lastSeen` forget path. *(2026-07-14 — the give-up return also
  clears `stealthChecks`; elsewhere a detected entry expires after ~30 s unseen, so grazers can be
  re-stalked.)*
- [x] Traits added: `padded-prowl`, ~~`matted-hide`~~, `constant-howling` (beast split); `chameleon-skin`,
  `ambush-stillness`, `duskshroud`, ~~`light-footed`~~ `soft-tread`; `translucent-skin` gated behind a
  future slime lineage. All pass `traitRegistry.test.ts`; all strings player-facing (no jargon).
  *(2026-07-14 — matted-hide folded into the existing thick-fur pelt chain via the generic
  natural-armour drag; translucent-skin is a commented block beside chameleon-skin until slime lands.)*
- [x] New stealth gear: one `stealthMod +0.3` light garment; **blowgun** + precision-ranged variant with
  high `critMod`; natural-armour `stealthMod` penalties set. *(2026-07-14 — `soot_darkened_jerkin`,
  `blowgun` (critMod 0.15) + `blow_dart`, `hunting_recurve` (critMod 0.10, drawPower 1.2 vs war bow's
  1.7); all craftable at the makers_bench. Natural-armour penalty = −0.04/`naturalArmor` point.)*
- [x] Constraint audit re-verified: no existing pawn/creature ≥ ~0.3 stealth without deliberate build.
  *(2026-07-14 — enforced by `core/stealth.test.ts` §9 suite: default pawn ≈ 0.2, positive `stealth`
  effects whitelisted, big beast + prowl stays < 1.0.)*
- [ ] Encounter balance pass after always-on detection lands. *(OPEN — mobs no longer acquire pawns
  instantly: ~9 %/check at the vision border, ~34 % adjacent for a default pawn. Playtest wolf/goblin
  encounters and tune §13 dials in `core/stealth.ts`.)*
- [x] ~~ADR-031~~ **ADR-032** written into `DECISIONS.md` + onboarded into `codegraph.config.json`.
  *(2026-07-14 — the draft number was taken by hide wear.)*
- [x] `.docs/game/DESIGN.md` (combat/mechanics) + `ARCHITECTURE.md` (new `core/stealth.ts`) updated.
  *(2026-07-14.)*

## 13. Open tuning dials

- `STEALTH_STRIKE_MULT` (3–4), detection `BASE`/`SLOPE` (0.12 / 0.15), proximity cap (0.25), `pDetect` clamp
  (0.02–0.85), check cadence (2 s vs 3 s).
- `sizeFactor`/`dexGate` coefficients and the DEX floor (8).
- Per-trait `stealth` values and per-armour `stealthMod` values (§7–8).
- **Decide:** derive armour `stealthMod` automatically from weight/`movementPenalty` vs hand-author per item
  (auto = less data entry, physically honest — recommended).
