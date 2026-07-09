<!-- LINEAGES-II — the transform/feeding subsystems + deep lineage content that LINEAGES (archived
     2026-07-09) deferred. COMPLETE 2026-07-10: everything below shipped except silver-sensitivity
     (data-blocked — no silver weapons exist yet) and Wanderlust (blocked on a recreation need). -->

# LINEAGES-II — transforms, feeding, and the deep lineage content ✅ COMPLETE 2026-07-10

> **Related:** [LINEAGES (archived)](LINEAGES-2026-07-09.md) · [TRAITS](../open/TRAITS.md) · [game/DESIGN](../../game/DESIGN.md) · [ROADMAP](../open/ROADMAP.md)

## §1 · Werewolf — the transform subsystem

The werewolf is a normal humanoid whose power is locked behind the `werewolf` transform condition on
full-moon nights:

- [x] **Moon phase** — a proper lunar counter in `EnvironmentService` (pure function of the absolute
      day; 30-day cycle, 8 phases, `isFullMoon` = a 3-night window). **Topbar** celestial readout: the
      sun's arc while it's up (Sunrise → High Sun → Sunset), the moon's phase at night, gold on a full
      moon. Covered by `environment.test.ts`.
- [x] **Transform condition** (`werewolf`) — granted by the Wolf Blood marker's `selfCondition`,
      `activateWhen {fullMoon, ambientLight ≤ 0.35}` (a new `fullMoon` predicate on the condition
      graph): +STR/+CON/+speed, dulled wits, full dark-sight while it holds (condition `grants`
      nightVision — a new channel read by `getNightVision`), lifts at moonset on its own.
- [x] **Moonlit Claws** — a transform-gated weapon: the trait's `naturalWeaponsWhen: "werewolf"` gate
      (new Trait field, checked in Combat's weapon collection) + the `moonlit-claws` item (stronger
      than any waking claw, heavy bloodletting).
- [x] **Lunar Aggression** — rides the transform (`activateWhen {hasCondition: werewolf}`): harder
      blows, no patience for tools (workEfficiency ×0.6).
- [x] **Blood meter** — `needs.bloodHunger` (0–100, "BLOODLUST" row in the needs panel), fills ~2/hour;
      the werewolf's Red Hunger (`bloodNeed: 'carcass'`) is pushed back down by eating raw meat
      (−20/meal) and whole carcasses (−80). At 100 the `bloodthirst` condition seizes the pawn.
- [x] **Lose-control hunt** — DECIDED + BUILT as a **drafted-uncontrollable pawn** off the collapse
      precedent: `bloodthirst` carries `fsmState: "BloodHunt"`; the conditions pass forces the state and
      refuses the draft every tick while it holds. The `handleBloodHunt` FSM handler chases the NEAREST
      living thing — beast or colonist — `tickCombat`'s BloodHunt branch lands the swings, a dropped
      quarry is devoured on the spot (sated → control returns). No need interrupts: the hunger outranks
      hunger.
- [x] **Deed hooks** — `moonlightHours` (full-moon night, open sky, hourly) and `nightKills` (a kill at
      low ambient light) both live.
- [ ] Wanderlust — still deferred: wants a recreation/fun need that doesn't exist yet.

## §2 · Vampiric — the feeding subsystem

- [x] **Routine feeding** — Blood Hunger (`bloodNeed: 'humanoid'`): at 70+ the vampire helps itself to
      the nearest colonist within 12 tiles — `feedOnVictim` stamps a REAL small neck puncture (bleeds a
      little until it clots or is dressed) + drains 12 blood; the victim's low blood flows through the
      existing blood-loss machinery. The feeder is sated. (v1 abstraction: no walk-up animation — the
      feed resolves on the hourly cadence.)
- [x] **Blood Thirst lose-control** — unfed to 100, the same `bloodthirst`/BloodHunt machinery seizes
      the vampire; a PAWN victim in reach is DRUNK FROM (feedOnVictim), not beaten down.
- [x] Old `vampiric` bundle flattened (see §4); `drewHumanoidBlood` awakening deed live.
      Covered by `lineages.test.ts` (feeding + sating tests).

## §3 · Arachnid / Amphibian — remaining machinery

- [x] **Silk Spinners** — grafts a real `spinneret` organ (hittable, losable — new limbmap part); while
      it lives it spins 1 `raw_silk` into the pawn's pack every ~6 in-game hours (hourly cadence, gated
      on a cached flag).
- [x] **Deed hooks** — `waterHours` (deep swamp or wading beside water, hourly), `fishedCount` (a
      harvest that lands fish — `category: "fish"` — counts as a fishing action), `ateFish` (fish
      meals), `ateInsect` (vermin flesh: rat/stirge/spider).
- [x] **Amphibian Palate** (−) — `dietRestriction: 'aquatic'`: only fish register as food.
- [x] **Torpid Blood** (−) — the amphibian cold-sluggishness: `cold_torpor` ACTIVE at coldExposure ≥ 30
      (slow hands, slow feet). *(Named Torpid Blood — `cold-blooded` was already the thermal flaw.)*
- [x] **Murk Eyes** — amphibian nightVision attribute.
- [ ] **Silver-sensitivity** — DATA-BLOCKED: no silver weapons exist yet (`silver_bar` is the only
      silver item). The hook lands with the first silver weapon rather than shipping dead code.

## §4 · Old-heritage flatten — DONE (closes the last TRAITS §0c item)

All **14** bundles (the 11 heritages + `amphibious`/`vampiric`/`dragon-heritage`) flattened into the
lineage model — the nested `subCapabilities` array no longer exists anywhere:

- [x] Every banner → a pure lineage MARKER (`lineage` set, empty effects; resistances stay in the
      `resistances` block); stat riders moved into `stat` members (Stone Vigor, Tidal Vigor, Dragon's
      Might…); the 61 subcapabilities re-emitted as top-level lineage members with proper kinds and
      rarities; armor lines staged (pebbled-skin → granite-hide → living-rock).
- [x] Duplicates of the new-lineage members dropped (arachnid-venom, arachnid-many-eyed, wall-crawler,
      bloodsucking-fangs, sun-cursed, vampire-strength); `blood-hunger` became the §2 feeding trait;
      `webbing` (web-shot) survives as an arachnid member.
- [x] `Culture.drawPawnTraits` born-in roll: a lineage marker takes one slot + ONE random S1 member of
      its lineage (higher stages come by EVOLUTION) — replaces the subCapability expansion.
- [x] Registry-test ban: a granter kind carries NO effects (claw-family hand-replacements exempt by
      owner decision: rending/ripping/crushing/burrowing claws + chitin-plating). Trait audit: clean.
- [x] Farseer / Crustacean awakening deeds LIVE: `starlitHours` (night hours under open sky — Path B on
      Spider Eyes) and `bluntHitsTaken` (crushing blows endured — Path B on Gills).

## §5 · Design questions — ALL RESOLVED 2026-07-09 (owner decisions)

- [x] **Moon-phase model** → a proper lunar counter (§1), exposed in the topbar with the sun's arc.
- [x] **Lose-control hunt** → a drafted-uncontrollable pawn off the collapse `fsmState` precedent (§1).
- [x] **Awakening meters** → no hard cap; traits decide. One meter per lineage per gateway (random
      condition from the pool), deduped across gateways; ≤ 2 gateways per pawn at the draw (the second
      ~1-in-20); ONE parent lineage ever — awakening clears all meters, no second awakening.
- [x] **rawDietDays** → counted in MEALS on the existing `ateRawMeat` counter (`raw-living`, range
      [220, 300]) — no per-day diet state.

## Verification

`check` 0 errors · full suite green (887/888 — the 1 failure is the pre-existing firewood-recipe
drift, unrelated) · `lineages.test.ts` ×13 · `environment.test.ts` lunar/sun tests · trait registry +
expansion suites updated to the flat model.
