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

- [ ] **Moon phase** — a lunar cycle derived from `dayIndex` (e.g. 30-day month; full moon a 2–3-day
      window). Open question: pure function of day-of-year vs a separate counter.
- [ ] **Transform condition** (`werewolf`) — `activateWhen` full-moon night; on activate: gear slots
      blocked/taken over by natural weapons + armor, stat swing (Lupine Might +STR), Night Eyes S3
      while transformed (S1 capped otherwise — the stage-cap override needs a hook).
- [ ] **Moonlit Claws / Lunar Aggression** — transform-gated members.
- [ ] **Blood meter** — a new need kept full by killing + eating fresh carcasses; drained → `bloodthirst`
      fires a **lose-control hunt mode**: the pawn hunts and devours anything nearby *including
      colonists* until fed. Open question: temporary hostile mob vs drafted-uncontrollable pawn.
- [ ] **Deed hooks** — `moonlightHours` (night + unsheltered + full moon, hourly cadence beside the
      existing wetHours accrual in PawnStateMachine), `nightKills` (kill at low ambient light).
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

## §5 · Deferred design questions (carried from LINEAGES §8)

- [ ] Moon-phase model: day-of-year cycle vs separate lunar counter?
- [ ] Lose-control hunt: temporary hostile `mob` vs drafted-uncontrollable pawn?
- [ ] How many awakening meters may a pawn carry at once (two gateways = up to 4 paths — cap or allow)?
- [ ] `rawDietDays` deed (needs per-day diet tracking) — worth the state, or drop it from the beast pool?
