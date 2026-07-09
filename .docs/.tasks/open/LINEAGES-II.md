<!-- LINEAGES-II — the transform/feeding subsystems + content that LINEAGES (archived 2026-07-09)
     deliberately deferred. LINEAGES delivered the full mechanism (schema, deeds, awakening meters,
     growth-event progression) and the data-only catalogs; this spec is everything that needs NEW
     machinery. -->

# LINEAGES-II — transforms, feeding, and the deep lineage content

> **Related:** [LINEAGES (archived)](../archive/LINEAGES-2026-07-09.md) · [TRAITS](TRAITS.md) · [game/DESIGN](../../game/DESIGN.md) · [ROADMAP](ROADMAP.md)

## §1 · Werewolf — the transform subsystem

The werewolf is a normal humanoid whose power is locked behind a `werewolf` transform condition on
full-moon nights. Members exist and are shared with Beast (claws, fangs, fur, eyes, feral surge); this
adds the transform machinery:

- [x] **Moon phase** — DONE 2026-07-09: a proper lunar counter in `EnvironmentService` — a pure function
      of the absolute day (deterministic, save/load-safe, no drifting state). `LUNAR_CYCLE_DAYS = 30`
      (3 moons a season, 12 a year), 8 named phases, `isFullMoon` = a 3-night window (days 14–16).
      **Topbar**: a celestial readout next to the time of day tracks the sun (☀ up 06:00–18:59 / ☾ down)
      and shows the moon's phase, gold-highlighted on a full moon. Covered by `environment.test.ts`.
- [x] **`moonlightHours` deed** — LIVE: full-moon night hours under the open sky accrue on the hourly
      env cadence in PawnStateMachine (beside `wetHours`), so the werewolf's signature awakening path
      works today.
- [ ] **Transform condition** (`werewolf`) — `activateWhen` full-moon night; on activate: gear slots
      blocked/taken over by natural weapons + armor, stat swing (Lupine Might +STR), Night Eyes S3
      while transformed (S1 capped otherwise — the stage-cap override needs a hook).
- [ ] **Moonlit Claws / Lunar Aggression** — transform-gated members.
- [ ] **Blood meter** — a new need kept full by killing + eating fresh carcasses; drained → `bloodthirst`
      fires the **lose-control hunt mode**. DECIDED: the pawn stays a pawn — a **drafted-uncontrollable
      pawn**, built off the collapse precedent: a condition can already force an FSM state via its
      `fsmState` field (health.ts — `collapse` → `Collapsed` is the first user, documented as "the
      precedent for future condition-driven FSM states"). `bloodthirst` gets `fsmState: <hunt state>`;
      while active the player's draft/move commands are refused (as with a collapsed pawn) and the FSM
      hunts + devours the nearest prey — *including colonists* — until fed, then control returns.
- [ ] **`nightKills` deed hook** (kill at low ambient light).
- [ ] Wanderlust — still deferred (wants a recreation/fun need that doesn't exist yet).

## §2 · Vampiric — the feeding subsystem

Marker + members shipped (Night Blood, Feeding Fangs, Unnatural Vigor, Sun-Scorned, venom line shared);
the `drewHumanoidBlood` deed already accrues from blood-drain hits on humanoids. This adds:

- [ ] **Feeding behavior** — a periodic blood need; the vampire seeks a sleeping/nearby colonist and
      feeds: a small neck puncture + bloodloss on the victim (their blood volume drops). The trade-off
      pawn: very strong, must be fed off your own people.
- [ ] **Blood Thirst (humanoid)** (−) — the lose-control craving when unfed (shares the werewolf hunt-mode
      machinery).
- [ ] Old `vampiric` bundle flatten (see §4).

## §3 · Arachnid / Amphibian — remaining machinery

- [ ] **Silk Spinners** — graft a spinneret limb (`grafts`) that **produces silk thread** on a periodic
      per-pawn production meter (like a creature's `produces`, which is per-mob today — pawns need the
      equivalent hook).
- [ ] **Silver-sensitivity** — a material-vs-damage hook (silver weapons bite lineage pawns harder).
- [ ] **Deed hooks** — `waterHours` (standing on water/deep-swamp tiles — needs a cheap tile-type check),
      `fishedCount` (fishing job completion), `ateFish`/`ateInsect` (needs a fish/insect item tag —
      today there is no clean category to detect them by).
- [ ] **Amphibian Palate** (−) — the raw-aquatic diet gate; blocked on the fish item tag above
      (`dietRestriction: 'aquatic'` once detectable).
- [ ] **Cold-Blooded** (−) — sluggish in frost weather (condition `activateWhen {need: coldExposure,
      atOrAbove}` — pure data once tuned).
- [ ] **Murk Eyes** — amphibian nightVision attribute (trivial data; bundle with the above pass).

## §4 · Old-heritage flatten (the last TRAITS §0c item)

The 11 pre-lineage heritages (Stoneblood, Echoborn, Sporeborn, Crustacean, Arachnid, Stormborn,
Shadeborn, Colossus, Wildblooded, Farseer, Blighted + the `amphibious`/`vampiric`/`dragon-heritage`
bundles) still use nested `subCapabilities` + carry stat/derived riders (~34 audit hits). Flatten each
into the lineage model:

- [ ] Banner → pure marker (`lineage` set); its stat rider → a guaranteed `stat`-kind member.
- [ ] Each subCapability → a top-level trait tagged `lineage: [...]` with a proper kind.
- [ ] `Culture.ts` born-in roll: marker + ONE random member from the lineage pool (replaces the
      subCapability expansion at [Culture.ts:435](../../../src/lib/game/core/Culture.ts)).
- [ ] Unify `arachnid-heritage` (old bundle) with the `arachnid-blood` marker; same for
      `vampiric`→`vampiric-heritage`, `amphibious`→`amphibian-heritage`.
- [ ] Registry-test ban: no rider on a granter kind (closes TRAITS §0c; claw work-effects stay exempt
      by owner decision).
- [ ] Farseer / Crustacean awakening deeds (the dormant Path-B meters on Spider Eyes / Gills).

## §5 · Design questions — ALL RESOLVED 2026-07-09 (owner decisions)

- [x] **Moon-phase model** → a proper lunar counter, implemented (§1): pure function of the absolute day,
      30-day cycle, exposed in the topbar next to the time of day together with the sun's state.
- [x] **Lose-control hunt** → a **drafted-uncontrollable pawn**, building off the collapse mechanic —
      the one precedent of a state overriding player control (`fsmState` on conditions). See §1.
- [x] **Awakening meters per pawn** → no hard meter cap; the TRAITS decide. Exclusivity implemented:
  - One meter per LINEAGE per gateway — `seedAwakeningPaths` rolls ONE random condition from the
    gateway's pool per candidate lineage (a claws pawn gets one beast + one werewolf meter, and which
    deed each tracks varies pawn to pawn), deduped by lineage across gateways.
  - **≤ 2 gateway traits per pawn** at the draw (`Culture.drawPawnTraits`), the second at ~1-in-20 —
    two competing lines (up to 4 meters) is an exceptional pawn. Never a third. Guarded by
    `lineages.test.ts`.
  - **One parent lineage, ever**: awakening clears all meters and excludes every other line; an
    awakened (or born-in) pawn cannot go through another awakening (yet).
- [x] **`rawDietDays`** → not tracked as days (no per-day diet state). The "all-raw diet" awakening
      counts MEALS on the existing `ateRawMeat` counter with a long-haul target (~3 raw meals a day ×
      a season and a half ⇒ range [220, 300]) — `raw-living` in `lineages.jsonc` updated.
