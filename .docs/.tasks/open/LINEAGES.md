<!-- Lineages — ancestral-blood mutation trees a pawn is born into or awakens into over its life.
     Supersedes the nested-subCapability "heritage bundle" model (TRAITS §2). Design locked 2026-07-09. -->

# LINEAGES — ancestral-blood mutation trees

> **Related:** [TRAITS](TRAITS.md) · [game/DESIGN](../../game/DESIGN.md) · [game/DECISIONS](../../game/DECISIONS.md) · [ROADMAP](ROADMAP.md) · [RACE-SYSTEM](RACE-SYSTEM.md)

## §1 · Concept

A **lineage** is an ancestral bloodline (Beast, Werewolf, Vampiric, Amphibian, Arachnid, plus the old
heritages — Stoneblood, Farseer, Crustacean, Blighted…). It is a *collection of linked traits a pawn can
grow into over its life*, à la a CDDA mutation tree — **not** a bundle a pawn gets all at once. Lineages
run across [Cultures](../../game/RACE-SYSTEM.md) (a Culture is the present-day formation; a lineage is the
blood underneath, individual to a pawn), so they are per-pawn, not per-Culture.

Two ways a pawn ends up in a lineage:

1. **Born into it** — a Culture guarantees the lineage's parent marker + one random member trait at
   generation (the old `guaranteedTraits` roll, [Culture.ts:435](../../../src/lib/game/core/Culture.ts)).
2. **Awakened into it** — a pawn rolls a standalone gateway trait (`lineageExclusive: false`) with no
   parent, then earns the parent over its life by doing lineage-fitting **deeds** (§4).

Once a pawn has the parent marker, it can **grow new lineage traits** and **evolve staged ones** at its
seasonal growth events. This replaces the closed nested-`subCapabilities` bundle.

## §2 · Schema — three independent trait properties

Replaces the nested `subCapabilities` on heritage banners. Each is orthogonal:

- [ ] **`lineage?: string[]`** — the lineage pools this trait belongs to (an **array** — Feral Adrenaline
      is `["beast","werewolf"]`, both draw it). A member pawn can gain any trait whose `lineage` includes
      its lineage id.
- [ ] **`lineageExclusive?: boolean`** (default `true`) — if `false`, the trait can roll **standalone**
      from the Culture pool with no parent (the gateway traits: claws, spider-eyes, gills, venom, fur).
- [ ] **`awakens?: string[]`** — candidate **awakening conditions** (§4) a standalone gateway carries. A
      trait can be a lineage member without being standalone, and standalone without awakening (Feral
      Adrenaline is a shared pool trait, not a gateway).
- [ ] **`conflictGroup`** on branches (already exists on traits) — mutually-exclusive lineage forks
      (robust-skin branch vs ranged branch) so a lineage genuinely diverges per pawn.
- [ ] Parent marker traits (`beast-heritage`…) shrink to identity markers; their old `effects`/stat
      riders move onto guaranteed `stat`-kind member traits (kills the last "stat rider on a passive").

## §3 · Growth-event hook

Every pawn already banks ~4 growth offers/year (3 seasonal + 1 doubled birthday,
[PawnGrowthService.processDay](../../../src/lib/game/services/PawnGrowthService.ts)). Lineage progression
rides the SAME event. On each growth event, in priority order:

- [ ] **Awakening meter full?** → grant the lineage parent (the pawn "turns"), grant its **first** lineage
      trait immediately (the payoff — awakening must feel rewarding, not anticlimactic), clear the meter.
- [ ] Else **evolve a staged trait** the pawn has (S1→S2→S3 via `evolvesTo`) — ~10%, checked first /
      slightly favoured over new-trait gain.
- [ ] Else, **if the pawn has a lineage parent**, gain a *new* member trait from that lineage — ~10%.

A standalone gateway with no parent can only evolve its own stage (no new-trait gain) until it awakens.

## §4 · Awakening meter

A standalone gateway tracks progress toward **≥2 lineages at once**; the player steers by which deeds the
pawn performs, and whichever meter fills first is the one that awakens (choice of path, not a pre-assigned
single meter).

- [ ] **Deeds** — a new `pawn.deeds: Record<string, number>` counter map, incremented at the source
      event (there is no kill/meal counter today — pawns only track `skills`):
  - raw-meat / carcass eating → in the eat handler (food is meat-category + not cooked; the cooked flag
    already exists on items).
  - kills by creature type → Combat death path (`attacker.deeds['kill:wolf']++`).
  - environment ticks → moonlight (unsheltered + low `ambientLight` + **full-moon phase**, §6), high
    wetness (`needs.wetness > threshold`), water/deep-swamp tile, low-light lurking.
- [ ] **Targets** roll per pawn within a **high** range (≈2 seasons of deliberate play) so awakening is a
      committed project, not incidental.
- [ ] **Regression** — the meter decays a little each day the deed wasn't advanced (track `lastFedDay`),
      after a grace period; paused while actively progressing. Stop committing → lose progress.
- [ ] **Reveal** — shown in the info panel only while being fed (like the drying meter), hidden otherwise.
- [ ] **No creature-awakening** — awakening comes ONLY from a born parent or a standalone gateway. No
      lineage-S1 on creatures; no pawn awakens to anything without a gateway. Other builds are their own fun.

**Awakening deeds by lineage** (each gateway maps to ≥2):

| Gateway trait | Path A | Path B | Deeds |
|---|---|---|---|
| Claws | **Beast** | **Werewolf** | eat raw meat · devour a raw carcass · unarmed killing blow on big game · X days all-raw diet · sleep without shelter *(beast)* — hours under full moonlight · kill canines · eat raw canine meat · kills at low light *(werewolf)* |
| Spider Eyes | Arachnid | Farseer | venom/poison kills · eat raw insect/vermin meat · kill ensnared/slowed prey · kill spiders & insects *(arachnid)* — TBD *(farseer)* |
| Gills | **Amphibian** | Crustacean | hours on water/deep-swamp tiles · hours at high wetness · eat raw fish/aquatic meat · fishing actions *(amphibian)* — TBD *(crustacean)* |
| Venom Fangs | Arachnid | **Vampiric** | (arachnid deeds) — humanoid blood drawn *(vampiric)* |
| Fur / covering | Beast | Werewolf | (as claws) |

## §5 · Lineage catalogs

**Bold = new trait; the rest exist in `traits.jsonc` and just need `lineage` tagging.** The adrenal split:
`adrenaline` stays staged (S1 → `berserker-blood` → berserk rage; reserved for a future orc/berserker
lineage); **`feral-adrenaline`** is a new terminal copy (same adrenal-on-pain, no `evolvesTo`)
`lineage: ["beast","werewolf"]`.

### Beast — the "always-on" lineage (15 traits)

Permanent, powerful, with reversed-shelter / raw-diet costs baked in.

- [ ] Beast Claws → Rending Claws → Ripping Talons (existing claw line)
- [ ] Thick Hide (armor + cold covering)
- [ ] **Savage Bite** (fang natural weapon)
- [ ] **Bestial Might** (+STR/+CON — guaranteed lineage stat baseline)
- [ ] **Feral Adrenaline** (terminal adrenal split)
- [ ] Pack Fury (combat bonus near allies — **moved from werewolf**)
- [ ] **Beast Eyes** (nightVision, **capped at stage 2**)
- [ ] **Keen Nose** (perception / tracking attribute)
- [ ] **Iron Gut** (eats carrion/rotten without sickness — turns the raw diet into a perk)
- [ ] **Bounding Gait** (+move speed)
- [ ] **Carnivore's Gut** (−) raw meat/carcass only; plants nauseate
- [ ] **Feral Manner** (−) −CHA, spooks tame animals
- [ ] **Can't Settle** (−) *reversed shelter* — debuff under a roof, rests best in the open

### Werewolf — the transform lineage

Mostly a normal humanoid; power is **locked behind a `werewolf` transform condition** that fires on
**full-moon nights** (§6). Few always-on traits; a monthly transformation instead. Werewolf is the
*loner* (Pack Fury lives in Beast).

- [ ] Moonlit Claws (claw variant — stronger / only bites when transformed)
- [ ] Night Eyes (S1 capped untransformed, **S3 on transform**)
- [ ] Wolfskin (cold-res fur)
- [ ] **Lupine Might** (+STR while transformed)
- [ ] **Lunar Aggression** (transform combat fury; may cap work — though the blood meter caps it passively)
- [ ] **Blood Hunger → "must consume carcasses"** (−): a **blood meter** kept full by killing + eating
      fresh carcasses. Drain it → `bloodthirst` fires a **lose-control hunt mode** — the pawn hunts and
      devours anything nearby, *including colonists*, until fed. (A high-tech colony stockpiling corpses
      to feed it is a fine, intended counter-play.)
- [ ] Wanderlust — **TODO / deferred**: wants a recreation/fun need that isn't wired yet; leave a `// TODO`.

### Vampiric — the feeding lineage

Flatten the existing `vampiric` heritage (bloodsucking-fangs, sun-cursed, undying-vigor exist) + add
**feeding**: a periodic blood need; the vampire seeks a sleeping/nearby colonist and feeds, stamping a
**small neck puncture + bloodloss** that drops the victim's blood volume. A very strong pawn you must feed
off your own people — that trade-off is the point.

- [ ] Bloodsucking Fangs · Sun-Cursed (`light_sensitive`) · Undying Vigor (+STR) · Night Eyes
- [ ] **Blood Thirst (humanoid)** (−) the feeding need + lose-control craving if unfed

### Arachnid — high-DEX build

- [ ] Spider Eyes line (**built** — Extra Eye → Spider Eyes → Arachnid Eyes)
- [ ] Venom Fangs (envenom bite — reuse `venomous`)
- [ ] **Chitin Plating** (+armor, **−STR** — rigid not strong; NOT −DEX, keep the high-DEX identity)
- [ ] **Arachnid Agility** (+DEX)
- [ ] **Silk Spinners** — graft a spinneret limb that **produces silk thread** on a periodic production
      meter (like the goat's `produces` milk); web/ensnare later.
- [ ] **Unsettling Presence** (−CHA)
- [ ] **Blood Thirst** (shared with Vampiric — stirge/spider drain)

### Amphibian

- [ ] Gills (graft, wetness-gated water-breathing — reuse `gill-frills`)
- [ ] **Webbed Limbs** (+swim / fishing) · **Slick Hide** (wetness-res covering) · **Murk Eyes** (nightVision) · **Cold Vigor** (+CON)
- [ ] **Parched Skin** (−) needs periodic wetness or a drying debuff (−STR/−DEX)
- [ ] **Cold-Blooded** (−) sluggish in frost weather · **Amphibian Palate** (−) raw aquatic diet only

## §6 · New machinery this needs (beyond trait data)

Ordered by which lineage forces it:

- [ ] **Foundation** (all lineages): the 3 schema flags (§2), the growth-event hook (§3), `pawn.deeds`
      counters + awakening meter + decay + info-panel reveal (§4), conflict-group branches, diet-gate
      (an eat-handler check that refuses/nauseates off-diet food — great tension; can starve a pawn in a
      mismatched larder).
- [ ] **Beast** — nothing beyond the foundation (all traits are always-on and mostly exist). **Ship first
      as the vertical slice.**
- [ ] **Werewolf** — **moon phase** in the environment; the **transform condition** (gear-slot takeover +
      stat swing on activate); the **blood meter**; the **lose-control hunt** AI.
- [ ] **Vampiric** — the **feeding behavior** (seek a colonist, stamp neck puncture + bloodloss).
- [ ] **Arachnid** — **silk production** meter (spinneret `produces`); **silver-sensitivity** (a
      material-vs-damage hook — small).

## §7 · Build order (acceptance gates)

- [ ] **Phase 0** — finish the §0 trait-schema cleanup (procs, weaponBonus, registry bans, TRAITS ledger).
- [ ] **Phase 1** — foundation (§6 foundation bullet). `check` + tests green.
- [ ] **Phase 2** — Beast lineage end-to-end (born + awakened paths, evolve/grow at growth events).
- [ ] **Phase 3** — Werewolf (moon phase, transform, blood meter, lose-control hunt).
- [ ] **Phase 4** — Vampiric (feeding).
- [ ] **Phase 5** — Amphibian + Arachnid content + silk/silver.

## §8 · Open questions

- [ ] Farseer / Crustacean awakening deeds (Path B for Spider Eyes / Gills) — TBD.
- [ ] Moon-phase model: derive from the day-of-year cycle, or a separate lunar counter?
- [ ] Lose-control hunt: does the pawn become a temporary hostile `mob`, or a drafted-uncontrollable pawn?
- [ ] How many awakening meters may a pawn carry at once (one gateway = ≥2 paths; two gateways = up to 4)?
