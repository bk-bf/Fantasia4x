<!-- LOC cap: 320 (created: 2026-06-03; reworked: 2026-07-10) -->

# PAWN SOCIAL LAYER — Relationships, Family, Conversation & Mood

> **Related:** [ROADMAP](ROADMAP.md) · [KINGDOMS-TRADE](../archive/KINGDOMS-TRADE-2026-07-12.md) (world social layer — kingdoms, visitors, caravans, the `trade` attribute) · [RACE-SYSTEM (archived)](../archive/RACE-SYSTEM-2026-07-13.md) (Phase 1 = culture→relationship baseline — **now owned by this spec**) · [TRAITS (archived)](../archive/TRAITS-2026-07-10.md) (social traits are personal traits, not a new file) · [COMBAT-SYSTEM](../archive/COMBAT-SYSTEM-2026-06-11.md) · [PRODUCTION-CHAIN-III (archived)](../archive/PRODUCTION-CHAIN-III-2026-07-10.md) (§F royalty/prestige gear) · [game/DESIGN](../../game/DESIGN.md)

## Status

**Implemented 2026-07-13** (Phases A–E; `check` + full suite green — `social.test.ts`,
`socialTurn.test.ts`, 19 tests incl. the hostile-culture seeding regression).
**Scope split (2026-07-10):** this spec is the *pawn-to-pawn* layer. The *world* layer —
kingdoms, visitors, trade caravans, and the `trade` attribute — moved to
[KINGDOMS-TRADE](../archive/KINGDOMS-TRADE-2026-07-12.md). The two share the culture-disposition seam and the prestige stat.
Known deferrals: **children/reproduction** (§2/§4 TODO stands); **crisis hostility/fleeing AI**
(a crisis pawn refuses work + is labelled, but doesn't turn on the colony yet); the "failed job
hurt Pawn B" delta (no such gameplay event exists to hook). Implementation notes: mood modifiers
LAYER over the existing per-tick drift (`effectiveMood = clamp(state.mood + Σ active)`), rather
than replacing it with a flat base-50 sum; `beauty`/`prestige` ride stats.jsonc `social` entries
(the `intact` body scan is a lazy formula token like `prestige`, not a per-tick capacity); the
daily pass runs beside `processKingdomsDaily` in the events phase (zero per-tick cost); a bonus
fix — the `sleptUnsheltered` deed (Beast `sleep-wild` awakening) now actually increments on
ground sleep.

---

## Goal

Turn pawns from productivity units into individuals the player cares about. Colonists have
**families**, form **relationships** that deepen or sour through **conversations** and shared events,
fall in and out of **friendship, rivalry, and romance**, and carry a **mood** the player can read the
reasons for. Emergent story, no scripted narrative. RimWorld's social log + relationship tabs are the
reference feel; the assembly and stage machinery below is ours.

---

## What already exists (seams to build on)

- **Culture disposition** — `GameState.cultureRelations` (`CultureRelation{a,b,score −100..+100,
  disposition}`, `core/Culture.ts`) is generated but has **no gameplay effect**. This spec is the
  consumer: it seeds starting pawn relationships (RACE-SYSTEM Phase 1). *Cultures* = a pawn's people
  (`pawn.cultureId`); *kingdoms* = political groups, in [KINGDOMS-TRADE](../archive/KINGDOMS-TRADE-2026-07-12.md).
- **Chronicle** — `logActivity(ActivityLogEntry)` via the `SimLogSink` sim→UI seam
  (`core/logSink.ts` → `stores/simLogBridge.ts`). The combat **engagement-session** pattern
  (`stores/Log.ts:332+`) coalesces a whole brawl into one expandable entry — reuse it to coalesce a
  back-and-forth conversation into one entry.
- **Floaters** — `simLog.pushCombatText({worldX, worldY, text, kind})` (`core/logSink.ts`). Add a
  `'social'` kind; model a persistent anchored speech-bubble on the existing `GlyphFloat` overlay
  (`stores/worldEffects.ts`).
- **Anatomy** — `pawn.limbs[].parts[].injuries` carry real `*_scar` types + `isMissing`/`permanent`
  flags (`core/types/health.ts`, `core/Wounds.ts`). **Beauty** reads these directly.
- **Prestige** — `armorProperties.prestigeBonus` sits on 5 items but is **dead** (unread, absent from
  the equipment aggregator). This spec is where it comes alive.
- **Traits** — social-affecting traits are **personal traits in `traits.jsonc`** (ADR-028), not a new
  `Traits.ts`. Mood/relationship modifiers ride `passive` (condition-backed) or `attribute` kinds per
  the [TRAITS](../archive/TRAITS-2026-07-10.md) contract. **Do not** add a parallel trait file.

---

## 1 · Relationship system

Every meaningful pair of pawns has a `PawnRelationship`. **Seeing each other is meeting**
(amended 2026-07-13, playtest): every colonist pair gets its culture-seeded row on meeting —
colony gen, migrant join, or the daily sight-radius pass (`meetColony`) — so the Relations tab
shows at least Strangers immediately instead of sitting empty until the first interaction. The
colony is small, so the pair count stays trivial.

```typescript
interface PawnRelationship {
  pawnA: string; pawnB: string;      // sorted ids, canonical key
  score: number;                     // −100 (enemies) → +100 (best friends), platonic axis
  stage: RelationStage;              // derived from score, hysteretic (see below)
  romance?: RomanceState;            // layered on top; null for most pairs
  kin?: KinTie;                      // 'parent'|'child'|'sibling'|'grandparent'|... (from family gen)
  tags: RelationTag[];               // 'grief_bond' | 'battle_forged' | 'mentor' | 'rescued_by'
  points: { history: number };       // running tally for stage hysteresis
}
```

`relationships: PawnRelationship[]` added to `GameState`. Store keyed for O(1) lookup by canonical pair.

### Relationship stages (platonic ladder)

| Stage | Score band | Notes |
| --- | --- | --- |
| Enemies | ≤ −60 | may refuse to work adjacent; combat-risk if crisis (later) |
| Rivals | −60 … −20 | recurring arguments, mood friction |
| Strangers | −20 … +15 | default; no active modifier |
| Acquaintances | +15 … +45 | small positive proximity mood |
| Friends | +45 … +75 | working together = mood buff |
| Best friends | ≥ +75 | strong grief on death; loyalty |

Stages are **hysteretic** — crossing a threshold requires a few points of overshoot so a pair doesn't
flicker on the boundary. **Romance is a separate track** (§4) that layers over the platonic stage: a
pair can be Friends *and* partners, or Partners who become Rivals after a breakup.

### Points economy — how scores move

Two sources, per the user's design:

- **Procedural (automatic, small, frequent)** — accumulated by `SocialService` on its daily tick:

  | Trigger | Δscore |
  | --- | --- |
  | Worked in the same tile cluster (per day) | +0.5 |
  | Shared a meal at a campfire | +1 |
  | A **conversation** resolved positively (§3) | +1 … +6 by category/outcome |
  | A conversation resolved badly (argument/insult) | −2 … −8 |
  | Personality/trait clash vs match (per day) | ∓0.5 |
  | Idle-adjacent with a Rival/Enemy | −1 |

- **Event-driven (manual/large, from gameplay)** — pushed by the systems that own the event:

  | Event | Δscore | Tag |
  | --- | --- | --- |
  | One pawn **rescued** the other in combat | +18 | `rescued_by`, `battle_forged` |
  | One pawn **tended** the other's wounds (caretaking) | +8 | |
  | **Fought alongside** in the same engagement | +4 | `battle_forged` |
  | **Witnessed an ally die** together | +6 | `grief_bond` |
  | Pawn A caused injury to Pawn B (friendly-fire / brawl) | −20 | |
  | Pawn A's failed job hurt Pawn B | −8 | |

### Cultural seeding (RACE-SYSTEM Phase 1)

When a `PawnRelationship` is first created, seed `score` from the two pawns' `cultureRelations`
disposition **before** any deltas: `hostile −40 · wary −15 · neutral 0 · friendly +15 · allied +30`.
The seed **decays toward lived experience** — a friendship can still form across a hostile-culture
divide (and allies can still come to blows). Acceptance: two pawns of mutually-`hostile` cultures
start disliking each other; a regression test asserts the seeding.

---

## 2 · Family & lineage

- **Pawn fields** — add `familyId?: string`, `kin?: KinTie[]` (parent/child/sibling links to other
  pawn ids), and share a **surname** within a family. Today `generatePawnName()` gives every pawn a
  *random* surname with zero linkage — family gen replaces that for linked pawns.
- **Starting kin (~10% link chance)** — during `generateColonyPawns`, after rolling the colony, each
  eligible pawn has a **~10% chance** to be tied to an existing colonist as sibling / parent-child
  (respecting culture + a plausible age gap), sharing that family's surname. Most colonists still
  start unrelated; the tree is not empty on turn 1 but is sparse.
- **Relations tab** — new `PawnTab` `'relations'` on `PawnScreen` (`PawnTab` union + `TABS` +
  `{#if}` block) → new `pawn/PawnRelations.svelte`: a **family tree** view plus a list of the pawn's
  relationships with stage badge, score, and tags. Reuse `StatBar`-style bars, not hand-rolled.
- **Children** — *TODO (deferred).* Committed partners (§4) producing children who join the family
  tree is a follow-up; leave a hook (`familyId` propagation, `DeadPawnRecord` retaining kin so the
  tree survives death) but do not build birth/pregnancy this pass.

### 2b · Off-colony family in the world — done 2026-07-13

A colony's FAMILY isn't just who's in the colony: each founder is born into a **wider family web**
that lives out in the world, tracked behind the scenes and viewable **as last you knew them** (the
KINGDOMS-TRADE staleness principle). Answers "the FAMILY box is empty / only lists colonists."

- **World-kin generation** (`entities/Pawns.ts` `generateWorldKin`, called from the 3 founder
  colony-gen store paths). Each founder gets an **extended web** — `parent`/`sibling`/`grandparent`/
  `auntuncle`/`cousin`/`child`/`nibling` (`KinKind` widened; `KIN_INVERSE`/`KIN_LABEL` in `core/Social.ts`) —
  as **full inert Pawn records** in `GameState.worldPawns` (identity/stats/traits, no live body/needs;
  never simulated, outside the complexity bubble). They share the founder's homeland (a stateless
  founder's kin get a random realm so they can still travel in) and surname. Modest counts (~5/founder).
  **Ages are generation-tiered with non-overlapping bands** (2026-07-13 fix): grandparents older than
  parents/aunts-uncles, older than the founder's generation (siblings/cousins), older than the next
  down (children/nieces-nephews) — no relative can come out older than the generation above it.
- **Kinship is a weighted bond, not a guarantee** (`rollKinWarmth` on every tie, colony + world):
  ~12% estranged/hated, ~18% cool, ~70% close. `KinTie.warmth` is the kin CONTRIBUTION to the
  relationship seed (`seedScore` adds it on top of the culture seed), so a founder can have a brother
  they love **or a father they can't stand** (rivals/enemies). `socialService.seedFamilyRelationships`
  stands up a row per family tie (colony + world) at gen.
- **Staleness** — world kin carry `lastSeenTurn` (undefined = never seen since the founder emigrated
  → rendered greyed "as you last knew" from turn 1, an emigrant's out-of-date memory). Refreshed
  ONLY on a caravan/visitor arrival — **never touched per tick** (the whole system is generated once
  and only mutated on the daily-gated arrival path).
- **Bias to visit + come with a caravan** (`KingdomService`): a realm where the colony has kin pulls
  harder in the arrival weighting, and on a party's arrival `reuniteKin` may (bias-rolled) seat a
  relative in the party — **refresh their `lastSeenTurn`, rename the lead mob to them** (`Mob.name` +
  `worldKinRelation` → the entity card reads "Kael's sister"), tag the party (`KingdomParty.kinVisitorId`),
  and post the news. On-map, no recruit (a recruitment hook is left for later).
- **Sex** (2026-07-13) — every pawn AND mob rolls a biological `sex` 50/50 at spawn (`buildPawnFromCulture`
  / `makeMob`); pawn **name generation is sex-keyed** (`MALE_FIRST_NAMES`/`FEMALE_FIRST_NAMES`, shared
  surnames). A creature def opts out with **`"sex": false`** in `creatures.jsonc` (wraiths + oozes —
  `shadow_wraith`/`greater_wraith`/`grimeling`/`grime_horror` — spawn sexless). Sex shows in the Status
  tab (SEX row) and the hover/info card. Kin words are **gendered by the relative's own sex** —
  `kinLabel(kind, sex)` / `kinRelationPhrase` resolve Father/Mother, Aunt/Uncle, Brother/Sister,
  Grandmother, Nephew… (Cousin ungendered; neutral fallback when sex is unknown).
- **UI** — `PawnRelations.svelte` FAMILY section now lists colony kin AND off-colony family with their
  **standing** (stage badge — a hated brother reads Rivals), **homeland**, greyed staleness, and the
  correctly-gendered relation word.

---

## 3 · Conversation system

When two pawns are near each other and not mid-critical-task, a **conversation** may fire on the social
tick. This is the heartbeat that makes relationships move and the map feel alive.

- **`database/conversations.jsonc`** — banks of **snippets/fragments** with **procedural assembly** so
  lines read as somewhat unique and intriguing (opener + subject + reaction slots, filled from
  weighted pools; subject can reference recent chronicle events — a hunt, a death, the weather).
- **Categories** (each with entry conditions on stage/mood/traits and a point-delta profile):
  `small_talk` · `banter` · `deep_talk` · `flirt` (§4) · `comfort` (console a grieving pawn) ·
  `argue` / `insult`. Category is **chosen** from the pair's current stage + moods + traits (rivals
  bicker, friends banter, the smitten flirt). Some categories are **propositions** — an offer the
  other pawn accepts or rebuffs (ask to be friends, ask to court), which gates a stage/romance change.
- **On fire, per conversation:**
  1. Emit a floater `"<assembled snippet>"` over each participant (`kind:'social'`), RimWorld-style.
  2. Log ONE chronicle entry (new `ActivityLogEntry.type = 'social'`) — *who*, *category*, *what they
     talked about*, and the outcome ("warmed to each other" / "it turned into an argument"). A
     multi-line exchange coalesces into one expandable entry via the engagement-session pattern.
  3. Apply the point delta to the `PawnRelationship` (may trigger a stage/romance transition).

---

## 4 · Romance

- **Track over the platonic axis.** Attraction gate = mutual **beauty** (§5) + `flirt` conversation
  successes + not-closely-kin. Stages: **interested → courting → partners** (boyfriend/girlfriend), with
  **breakups** dropping to Rivals/Strangers + a grief mood. Jealousy (a partner flirting elsewhere) is
  a negative event.
- `RomanceState = { stage: 'interested'|'courting'|'partners'|'ex'; since: turn }` on the relationship.
- **Children:** *TODO* — see §2. Romance ships without reproduction this pass.

---

## 5 · Beauty attribute

- New `stats.jsonc` entry, **`category: 'social'`, `primaryStat: charisma`**. Value derives from **CHA**
  scaled by the **fraction of intact, unscarred body parts** — visible **scars** and **missing parts**
  each shave beauty (read `pawn.limbs[].parts[].injuries` for `*_scar` types + `isMissing`/`permanent`,
  mirroring how `talking` scans the jaw organ).
- **Wiring:** "intact bodyparts" is not a formula token today — add it as a capacity-style scan in
  `PawnStatService` (`calculateCapacityValue` + `_buildCapacities`), then reference it from the beauty
  formula (which also needs `charisma`, already a token but unused by any formula).
- **Effects:** gates romantic attraction (§4); a small standing mood modifier for the pawn and a
  faint reaction from onlookers. Tone: **imply, don't instruct** — flavour "turns heads" / "hard to
  look at", never "boosts recruitment odds".

---

## 6 · Prestige (expose the dead field)

- **`SocialService.getPrestige(pawn)`** — sum `armorProperties.prestigeBonus` across equipped items ×
  quality / material / Famed multiplier (mirror `equippedTemperatureSources` in `PawnEquipment.ts`).
  Nothing produces a prestige value today, so this is net-new.
- **Expose on the Attributes tab** — a prestige readout in `PawnStatBanner` (7th chip) or a `social`
  category row in `PawnAttributes` (whose category list `['physical','capacity','combat','resistance']`
  + `CATEGORY_ORDER`/`CATEGORY_LABEL` must gain `social`).
- **Effects:** a standing **mood** band (ragged → finely-equipped) feeding the modifier list (§7); a
  weight in social-event rolls and (later) leader/diplomat selection. The **`trade` attribute**
  (CHA + prestige + talking) consumes this but is defined in [KINGDOMS-TRADE](../archive/KINGDOMS-TRADE-2026-07-12.md).
- Ties the [PRODUCTION-CHAIN-III §F (archived)](../archive/PRODUCTION-CHAIN-III-2026-07-10.md) royalty/regalia line (ceremonial plate,
  regal robes — already in `items.jsonc`) to a real effect: the encumbrance-vs-bearing fork.

---

## 7 · Mood depth

Mood becomes a **list of sources** with decay timers, so the player can see *why* a pawn is unhappy.

```typescript
interface MoodModifier { id: string; label: string; value: number; expiresAt: number; } // 0 = until resolved
```

`moodModifiers: MoodModifier[]` on `Pawn`. Final mood = base 50 + Σ active modifier values, clamped 0–100.

| Event | Δmood | Duration (turns) |
| --- | --- | --- |
| Ate a hot meal / slept in a bed | +8 / +5 | 300 |
| Best friend or partner died | −25 | 3000 |
| Breakup | −15 | 1500 |
| Working with a Friend / near a Rival | +3 / −5 | refreshed each turn |
| Finely-equipped (high prestige) / ragged | +5 / −5 | standing |
| Beautiful / disfigured (own beauty band) | +3 / −4 | standing |
| Idle 3+ days | −8 | while idle |

Mood < 20 → a **break** (refuses work 2–10 turns). Mood 0 for 5 turns → **crisis** (hostile / may flee).

---

## Implementation Plan

### Phase A — Data & attributes
- [x] `relationships: PawnRelationship[]` on `GameState`; `moodModifiers`, `familyId?`, `kin?` on `Pawn`.
      (2026-07-13 — `core/types/social.ts`; new pawn fields are snapshot COLD [`PAWN_COLD`,
      replace-on-change]; `DeadPawnRecord` retains `id` + `kin` so the tree survives death)
- [x] `beauty` stat (`stats.jsonc` `social` category) + intact-bodyparts scan in `PawnStatService`.
      (2026-07-13 — `intact` is a LAZY formula token like `prestige` [whole-body scan only when a
      formula names it], not a per-tick capacity; scars/missing parts shave it)
- [x] `SocialService.getPrestige` + Attributes-tab exposure. (getPrestige had landed with
      KINGDOMS-TRADE; 2026-07-13 adds a `prestige` stats.jsonc entry [formula = the token] + the
      `social` category in `PawnAttributes`/`PawnScreen`, so trade/beauty/prestige all render)

### Phase B — SocialService
- [x] `processSocialTurn(state)` — daily: proximity/meal deltas, conversation rolls, stage/romance
      transitions, mood decay, break/crisis checks. (2026-07-13 — events phase beside
      `processKingdomsDaily`; unchanged days return the same state ref)
- [x] `addMoodModifier` · `getEffectiveMood` · `getBeauty` (+ `removeMoodModifier`; break checks live
      inside the daily pass off the EFFECTIVE mood). (2026-07-13)
- [x] `seedRelationship(a, b)` — culture-disposition baseline before deltas (RACE-SYSTEM Phase 1).
      (2026-07-13 — `core/Social.ts` `seedScore` [hostile −40 · wary −15 · 0 · +15 · +30, same-culture
      +15, kin +50], applied in the service's `ensureRel`; regression test in `social.test.ts`)

### Phase C — Family generation
- [x] ~10% starting-kin pass in `generateColonyPawns` (shared surname, plausible kin ties).
      (2026-07-13 — `linkStartingKin` [sibling ≤12y gap, parent/child ≥16y, same culture only];
      migrant waves keep ties through both re-id passes via `remapKinIds`, and a turned-away
      sibling's tie is dropped)

### Phase D — Conversations
- [x] `dialog.jsonc` (renamed from `conversations.jsonc` 2026-07-13) flavor banks + procedural
      assembler. (opener→reply→closer per category [small_talk/banter/deep_talk/flirt/comfort/argue/
      insult/**battle_talk**], {name}/{subject}/{weather}/{season} slots; `services/social/conversations.ts`
      picks category by stage/grief/flirt-gate/**battle-context** and rolls the outcome off CHA/traits/
      mood. **Relationship effects are authored in the DATA now** — each category carries `goodDelta`/
      `badDelta`/`goodChance`.)
- [x] **Proximity trigger** (2026-07-13, playtest — daily rolls were invisible). `SocialService.processDialogTick`
      fires a dialog when two awake colonists pass within **2 tiles**; run on a THROTTLED engine tick
      (`DIALOG_INTERVAL_TICKS = 90` ≈ 1.5 s — off the hot path, returns the same state ref on a quiet
      tick). Per-pair (25 s) + per-pawn (6 s) cooldowns pace it. `battle_talk` fires when both are
      drafted. The daily `processSocialTurn` no longer fires conversations (keeps drift/moods/romance/
      breaks).
- [x] **Floaters freeze on pause** (2026-07-13). New `stores/animClock.ts` — `animNow()` is a
      monotonic clock that halts while `isPaused`; every floater store (combatFeedback/attackLunges/
      projectiles) and the GameCanvas ageing read it, so lifetimes freeze instead of ageing out during
      a pause. `WorldEffectsLayer` sets `animation-play-state: paused` on all its animations in
      parallel (visual + logical lifetime in lockstep). Dialog float is now **plain white cursive
      text** (no bubble background/border) with a strong shadow.
- [x] **Dialog transcript in the Relations tab** (2026-07-13). Each `talk` `RelationshipEvent` stores
      its assembled `lines`; `RelationBreakdown` renders a per-entry ▸ toggle that reveals the actual
      exchange, nested under the point-breakdown line.
- [x] `'social'` `ActivityLogEntry` type + one expandable entry per exchange; `'social'` floater kind
      + speech-bubble overlay. (2026-07-13 — the whole exchange is assembled atomically, so ONE
      chronicle entry carries `details.lines` [click to expand — no session machinery needed];
      speech bubbles ride the combat-text channel with a 4.5 s dwell + bubble CSS)

### Phase E — Wiring & UI
- [x] `SocialService.processSocialTurn` at the end of the Events phase (once/day, **not** per tick —
      cross-checked [ENGINE-PERFORMANCE](../archive/ENGINE-PERFORMANCE.md); no new per-tick allocation).
      (2026-07-13 — daily-gated beside the kingdom call)
- [x] Event hooks: rescue / tend / fought-alongside / friendly-fire push `PawnRelationship` deltas.
      (2026-07-13 — `pickUpPawn` +18, `tendPatient` +8, kill-adjacent pawns +4 `battle_forged`
      [once/pair/day], pawn-hits-pawn −20; plus grief/witness bonds in `finalizePawnDeath`, shared
      meals +1 and hot-meal/slept-in-bed moods in the needs handlers)
- [x] `'relations'` PawnTab + `PawnRelations.svelte` (family list + relationship list w/ stage badge,
      score `StatBar`, tags, romance). (2026-07-13)
- [x] Mood-modifier list + break/crisis state label. (2026-07-13 — `getMoodBreakdown` now returns
      effective mood + the modifier list [MOOD popup renders them above the drift drivers];
      `PawnOverview` MOOD row + STATE line; the map card's status reads "on a break" / "in crisis";
      a breaking pawn refuses jobs in `handleIdle` and ambles instead)
- [x] **Per-relationship point breakdown + interaction log** (2026-07-13, playtest ask). Each
      `PawnRelationship` keeps a bounded `log: RelationshipEvent[]` — every delta site records a dated,
      labelled, signed line (`recordEvent`/`applyDelta` opts): the culture/kin seed baseline, each
      conversation ("Talked about the last hunt +3", subject surfaced from `ConversationOutcome`),
      rescue/tend/fought-together/grief/friendly-fire, romance milestones (became a couple / parted
      ways / jealousy). Ambient day-to-day drift (proximity, temperament, resentment) coalesces into a
      single rolling `time` total instead of one line per day; `seed`+`time` are pinned so the last
      `REL_LOG_CAP` (12) discrete moments always show. Surfaced as a toggleable ▸ breakdown per row in
      the RELATIONS tab (`RelationBreakdown.svelte`).

---

## Open Questions

- [ ] Children/reproduction: full pregnancy loop, or instant "child joins tree" event? (deferred — TODO;
      `familyId` propagation + kin retention hooks are in place)
- [x] Do social traits need new `passive`/`attribute` entries in `traits.jsonc`? (2026-07-13 — audited:
      the existing personality block carries enough signal; gregarious/ill-tempered/hot-headed/loner
      tilt conversation outcomes, industrious↔lazy / meticulous↔slapdash / curious↔incurious /
      gregarious↔loner drive the daily clash/match delta. No new trait entries.)
- [x] Conversation cadence. (2026-07-13 — each pawn INITIATES ≤1 and takes part in ≤2 conversations
      per day, 65% roll, partners within 5 tiles, sleepers/drafted excluded — a 5-pawn colony logs
      ~2-3 SOC entries a day)
- [x] `DeadPawnRecord` kin retention. (2026-07-13 — went with the lean: the record keeps `id` + `kin`
      so the family list still names the lost [rendered "† "], full relationship retention waits on
      children)
- [ ] Crisis behaviour: a crisis pawn currently refuses work + is labelled, but doesn't turn hostile
      or flee — wire the actual crisis AI when combat-adjacent behaviours next open up.
