<!-- LOC cap: 320 (created: 2026-06-03; reworked: 2026-07-10) -->

# PAWN SOCIAL LAYER — Relationships, Family, Conversation & Mood

> **Related:** [ROADMAP](ROADMAP.md) · [KINGDOMS-TRADE](KINGDOMS-TRADE.md) (world social layer — kingdoms, visitors, caravans, the `trade` attribute) · [RACE-SYSTEM (archived)](../archive/RACE-SYSTEM-2026-07-13.md) (Phase 1 = culture→relationship baseline — **now owned by this spec**) · [TRAITS (archived)](../archive/TRAITS-2026-07-10.md) (social traits are personal traits, not a new file) · [COMBAT-SYSTEM](../archive/COMBAT-SYSTEM-2026-06-11.md) · [PRODUCTION-CHAIN-III (archived)](../archive/PRODUCTION-CHAIN-III-2026-07-10.md) (§F royalty/prestige gear) · [game/DESIGN](../../game/DESIGN.md)

## Status

Not started. Follows combat (there must be injury/death/rescue for pawns to react to).
**Scope split (2026-07-10):** this spec is the *pawn-to-pawn* layer. The *world* layer —
kingdoms, visitors, trade caravans, and the `trade` attribute — moved to
[KINGDOMS-TRADE](KINGDOMS-TRADE.md). The two share the culture-disposition seam and the prestige stat.

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
  (`pawn.cultureId`); *kingdoms* = political groups, in [KINGDOMS-TRADE](KINGDOMS-TRADE.md).
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

Every meaningful pair of pawns has a `PawnRelationship`. Sparse — created lazily on first real
interaction (or at colony gen for seeded pairs), not N² up front.

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
  (CHA + prestige + talking) consumes this but is defined in [KINGDOMS-TRADE](KINGDOMS-TRADE.md).
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
- [ ] `relationships: PawnRelationship[]` on `GameState`; `moodModifiers`, `familyId?`, `kin?` on `Pawn`.
- [ ] `beauty` stat (`stats.jsonc` `social` category) + intact-bodyparts capacity scan in `PawnStatService`.
- [ ] `SocialService.getPrestige` + Attributes-tab exposure (banner chip / `social` category wiring).

### Phase B — SocialService
- [ ] `processSocialTurn(state)` — daily: proximity/meal deltas, conversation rolls, stage/romance
      transitions, mood decay, break/crisis checks.
- [ ] `addMoodModifier` · `getEffectiveMood` · `checkBreakThreshold` · `getBeauty`.
- [ ] `seedRelationship(a, b)` — culture-disposition baseline before deltas (RACE-SYSTEM Phase 1).

### Phase C — Family generation
- [ ] ~10% starting-kin pass in `generateColonyPawns` (shared surname, plausible kin ties).

### Phase D — Conversations
- [ ] `conversations.jsonc` fragment banks + procedural assembler.
- [ ] `'social'` `ActivityLogEntry` type + engagement-session coalescing; `'social'` floater kind +
      anchored speech-bubble overlay.

### Phase E — Wiring & UI
- [ ] `SocialService.processSocialTurn` at the end of the Events phase (once/day, **not** per tick —
      cross-check [ENGINE-PERFORMANCE](../archive/ENGINE-PERFORMANCE.md); no new per-tick allocation).
- [ ] Event hooks: rescue / tend / fought-alongside / friendly-fire push `PawnRelationship` deltas.
- [ ] `'relations'` PawnTab + `PawnRelations.svelte` (family tree + relationship list, reuse `StatBar`).
- [ ] Mood-modifier list + stage/romance badges on the pawn card; break/crisis state label.

---

## Open Questions

- [ ] Children/reproduction: full pregnancy loop, or instant "child joins tree" event? (deferred — TODO)
- [ ] Do social traits need new `passive`/`attribute` entries in `traits.jsonc`, or do existing
      personality traits already carry enough signal for category selection? (audit `traits.jsonc` first)
- [ ] Conversation cadence — how many fire per day per pawn before it spams the chronicle? (rate-limit)
- [ ] Should `DeadPawnRecord` retain `kin`/relationships so the family tree survives death now, or when
      children land? (lean: minimal kin retention now, full when children ship)
