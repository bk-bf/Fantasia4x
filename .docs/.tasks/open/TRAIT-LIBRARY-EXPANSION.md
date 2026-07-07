# TRAIT-LIBRARY-EXPANSION — a methodical build-out of the trait pool (PROPOSAL)

> **Related:** [TRAIT-SYSTEM-V2](TRAIT-SYSTEM-V2.md) · [DECISIONS.md — ADR-028](../../game/DECISIONS.md) · [ROADMAP](ROADMAP.md)

**Status:** proposal / not yet implemented. Nothing here is wired — this is the spec to react to.
The complaint it answers: *"I see the same kinds of traits often, and it gets tiresome."* The fix is
breadth (many more mundane variety pulls so two same-race pawns rarely twin) **and** depth (staged
natural gear, ten new heritage trees, a scar/lost-limb layer, and condition-proc/aura traits).

Everything below uses the **real** `Trait` schema (`core/types/race.ts`) and the real effect keys, so a
"yes to this block" translates to `traits.jsonc` almost mechanically. Where a proposal needs code that
does not exist yet (a `stage` field, an aura system, a `frostbite` wound type) it is called out inline
and collected in **§7 New plumbing**.

---

## §0 · How to read this doc

### Profile format (instead of raw JSON)

Each trait is a compact card:

> **Display Name** `kebab-id` — `kind` · `rarity` · `scope` · *theme / combo axis*
> `effects → key +val, key +val`   · magnitude: *moderate | significant*
> *extra flags as needed:* `requires → …` · `selfCondition → …` · `onHit → …` · `evolvesTo → …` · `blocksSlots → …` · `weaponBonus → …` · `bodyMods → …` · `wounds → …`
> *"flavorLine"*

Dense mechanical ladders (the ±1/±3/±5 stat rungs, the scar matrix) are given as **tables** — one row
per trait, every rung present — because forty near-identical cards would be noise. A table row *is* a
profile; `id`/`name`/`rarity`/`effects` are all shown.

### Magnitude convention (from the brief)

| band | work mult (speed/yield/quality) | resistance delta (0–1) | healRate | weaponBonus.damage |
|------|-------------------------------|-----------------------|----------|--------------------|
| **moderate** ±5–20% | `0.80–0.90` / `1.10–1.20` | `±0.15–0.20` | `±0.15–0.20` | `±0.10` |
| **significant** ±50%+ | `≤0.60` / `≥1.50` | `±0.40–0.50` | `±0.50–0.60` | `±0.30` |

### Rarity convention (the budget, per ADR-028 §2)

| trait shape | rarity |
|-------------|--------|
| one core stat ±1 · single moderate combo | `common` / `uncommon` |
| one core stat ±3 · two-stat ±1 combo · moderate two-axis combo | `uncommon` / `rare` |
| one core stat ±5 · two-stat ±3 · **significant** positive combo | `rare` / `epic` |
| all-stats +1 | `epic` · all-stats +3 → `mythic` · all-stats +5 → `legendary` |
| any pure-downside trait | `negative` (single flaw tier; depth = magnitude + draw-count, see §2d note) |

> **Naming law reminder (ADR-028):** `stat`/`attribute` traits must carry **mundane, generic** names —
> never name a losable body part or natural weapon/armor (bone/skin/hide/scale/claw/horn/fang/eye/
> ear/feather/tail). Only `bodyMod`/`naturalGear`/`passive`/`wound` traits (which genuinely touch the
> body model) may carry an anatomical name. Every name below obeys this.

---

## §1 · Attribute-combo traits (2 positive + 2 negative per logical combo)

The rule from the brief: **never buff a lone attribute** — always pair two logically-linked axes, and
give each combo a *moderate* rung and a *significant* rung, on both the up and down side. Ten combos
across the named domains. The pattern generalises: any two stats.jsonc axes that "read as one talent"
can be a new combo card.

> **⚠ Revision — resistances are earned, not granted (per your note):** an abstract `attribute` combo may
> **no longer** hand out a resistance. Damage / elemental / toxin / mental resistance now comes only from
> a `naturalGear` **covering** (fur → cold, scale/chitin → physical, feather → cold+wet; see §3c) or a
> `passive`/aura **affinity** (§6). Consequences below: the **combat** combos drive real *combat stats* —
> `hit_chance`, `dodge`, `knockdown_resistance`, `attack_speed`, `crit_chance`, `aim_speed`,
> `reload_speed`, `aim_range` — through a new **`combatMods`** multiplier channel (mirrors `workSpeed`;
> see §7), never `blunt/cutting/piercing_resistance`; and the old thermal/toxin `attribute` combos are
> **relocated** to §3 coverings + §6 affinities (a worked example is kept below to show the new shape).

### WORK · Craftsmanship (crafting speed + crafting quality)

> **Handy** `handy` — `attribute` · `uncommon` · `personal`
> `effects → workSpeed.crafting 1.15, workQuality.crafting 1.15` · magnitude: moderate
> *"their hands find the shape of a thing quickly, and find it well"*

> **Master Artisan** `master-artisan` — `attribute` · `rare` · `personal`
> `effects → workSpeed.crafting 1.30, workQuality.crafting 1.60` · magnitude: significant
> *"what leaves their bench is spoken of in other households"*

> **Ham-Fisted** `ham-fisted` — `attribute` · `negative` · `personal`
> `effects → workSpeed.crafting 0.90, workQuality.crafting 0.85` · magnitude: moderate
> *"fine work fights them, and it shows in the seams"*

> **Botcher** `botcher` — `attribute` · `negative` · `personal`
> `effects → workSpeed.crafting 0.60, workQuality.crafting 0.50` · magnitude: significant
> *"whatever they touch comes out crooked, and slowly at that"*

### WORK · Gathering (foraging speed + foraging yield)

> **Forager** `forager` — `attribute` · `uncommon` · `personal`
> `effects → workSpeed.foraging 1.15, workYield.foraging 1.15` · magnitude: moderate
> *"a good eye for where the wild larder hides its best"*

> **Bountiful Hand** `bountiful-hand` — `attribute` · `rare` · `personal`
> `effects → workSpeed.foraging 1.30, workYield.foraging 1.50` · magnitude: significant
> *"they come back from the treeline with twice what anyone sent them for"*

> **Wasteful** `wasteful-gatherer` — `attribute` · `negative` · `personal`
> `effects → workSpeed.foraging 0.90, workYield.foraging 0.85` · magnitude: moderate
> *"half of what they pick is bruised past use by the time it's home"*

> **Blightpicker** `blightpicker` — `attribute` · `negative` · `personal`
> `effects → workSpeed.foraging 0.60, workYield.foraging 0.50` · magnitude: significant
> *"slow to the harvest and clumsy with it — most of it spoils in the basket"*

### PHYSICAL · Recovery — *relocated*

Recovery paired `healRate` with `diseaseResistance` — but a resistance can no longer sit on an abstract
trait. `healRate` (a *rate*, not a resistance) survives on the **Field medicine** combo below. Innate
disease/poison hardiness becomes a `passive` **affinity** (see the Resistance example further down) or a
§3 covering — never a free `attribute` number. The old `Hale`/`Vital`/`Ailing`/`Wasting` cards fold into:
the `healRate` half → Field medicine; the resistance half → a passive affinity (`hardy-gut`, below).

### CAPACITY / SUPPORT · Field medicine (caretaking speed + heal rate)

> **Nurturing** `nurturing` — `attribute` · `uncommon` · `personal`
> `effects → workSpeed.caretaking 1.15, healRate 0.15` · magnitude: moderate
> *"a steady, reassuring presence at any sickbed"*

> **Field Surgeon** `field-surgeon` — `attribute` · `rare` · `personal`
> `effects → workSpeed.caretaking 1.50, healRate 0.30` · magnitude: significant
> *"they can hold a body together with cord and nerve until it learns to hold itself"*

> **Heavy-Handed** `heavy-handed-care` — `attribute` · `negative` · `personal`
> `effects → workSpeed.caretaking 0.85, healRate -0.10` · magnitude: moderate
> *"well-meaning, but their idea of gentle leaves a bruise"*

> **Unsteady Hands** `unsteady-hands` — `attribute` · `negative` · `personal`
> `effects → workSpeed.caretaking 0.60, healRate -0.20` · magnitude: significant
> *"you do not want them holding the needle"*

### CAPACITY · Low-light work (nightVision + foraging speed)

> **Gloomwise** `gloomwise` — `attribute` · `uncommon` · `racial`
> `effects → nightVision 0.20, workSpeed.foraging 1.10` · magnitude: moderate
> *"the failing light slows them less than most"*

> **Duskwalker** `duskwalker` — `attribute` · `rare` · `racial`
> `effects → nightVision 0.60, workSpeed.foraging 1.30` · magnitude: significant
> *"they keep working long after the others have called it too dark"*

> **Dusk-Wary** `dusk-wary` — `attribute` · `negative` · `racial`
> `effects → nightVision -0.20, workSpeed.foraging 0.90` · magnitude: moderate
> *"once the sun tips over, they slow and start to fret"*

> **Lightbound** `lightbound` — `attribute` · `negative` · `racial`
> `effects → nightVision -0.50, workSpeed.foraging 0.70` · magnitude: significant
> *"useless past dusk — they'll sit on their hands until dawn"*

Combat combos use the new **`combatMods`** map — `Record<combatStatId, number>`, a multiplier on the
matching stats.jsonc combat output, exactly as `workSpeed` multiplies a work stat (§7). Magnitude:
moderate `1.10–1.20 / 0.85–0.90`, significant `≥1.5 / ≤0.6` (`crit_chance` reads low in absolute terms —
it scales a ~0.05 base). Five combos exhaust the palette you listed.

### COMBAT · Lethality (hit_chance + crit_chance) — accuracy & killing blows

> **Sure-Handed** `sure-handed` — `attribute` · `uncommon` · `personal`
> `combatMods → hit_chance 1.15, crit_chance 1.20` · magnitude: moderate
> *"their blows land where they mean them to, and land hard"*

> **Killer Instinct** `killer-instinct` — `attribute` · `epic` · `racial`
> `combatMods → hit_chance 1.40, crit_chance 1.60` · magnitude: significant
> *"they find the gap in any guard on the first exchange"*

> **Wild-Swinging** `wild-swinging` — `attribute` · `negative` · `personal`
> `combatMods → hit_chance 0.90, crit_chance 0.85` · magnitude: moderate
> *"all effort and no aim — half their swings meet air"*

> **Hapless** `hapless-fighter` — `attribute` · `negative` · `personal`
> `combatMods → hit_chance 0.60, crit_chance 0.60` · magnitude: significant
> *"they could miss a barn from the inside"*

### COMBAT · Footwork (dodge + knockdown_resistance) — evasion & staying upright

> **Light-Footed** `light-footed` — `attribute` · `uncommon` · `personal`
> `combatMods → dodge 1.15, knockdown_resistance 1.15` · magnitude: moderate
> *"a shifting, hard-to-pin target that keeps its feet"*

> **Untouchable** `untouchable` — `attribute` · `epic` · `racial`
> `combatMods → dodge 1.50, knockdown_resistance 1.40` · magnitude: significant
> *"blows pass through where they just were; nothing knocks them down"*

> **Leaden** `leaden` — `attribute` · `negative` · `personal`
> `combatMods → dodge 0.85, knockdown_resistance 0.90` · magnitude: moderate
> *"slow to slip a blow and easy to shove off balance"*

> **Stumbling** `stumbling` — `attribute` · `negative` · `personal`
> `combatMods → dodge 0.60, knockdown_resistance 0.60` · magnitude: significant
> *"a stiff breeze puts them on the ground"*

### COMBAT · Ferocity (attack_speed + crit_chance) — fast, punishing strikes

> **Quick-Striking** `quick-striking` — `attribute` · `uncommon` · `personal`
> `combatMods → attack_speed 1.15, crit_chance 1.20` · magnitude: moderate
> *"two blows landed for every one returned"*

> **Whirlwind** `whirlwind` — `attribute` · `epic` · `racial`
> `combatMods → attack_speed 1.50, crit_chance 1.50` · magnitude: significant
> *"a blur of edges that never seems to pause for breath"*

> **Ponderous** `ponderous` — `attribute` · `negative` · `personal`
> `combatMods → attack_speed 0.90, crit_chance 0.90` · magnitude: moderate
> *"they wind up a swing like they're splitting logs"*

> **Lumbering** `lumbering-fighter` — `attribute` · `negative` · `personal`
> `combatMods → attack_speed 0.60, crit_chance 0.75` · magnitude: significant
> *"by the time their blow arrives the fight has moved on"*

### COMBAT · Quickdraw (aim_speed + reload_speed) — ranged rate of fire

> **Fast Hands** `fast-hands` — `attribute` · `uncommon` · `personal`
> `combatMods → aim_speed 1.15, reload_speed 1.15` · magnitude: moderate
> *"the next shot is always already coming"*

> **Rapid Loose** `rapid-loose` — `attribute` · `rare` · `racial`
> `combatMods → aim_speed 1.50, reload_speed 1.50` · magnitude: significant
> *"they empty a quiver in the time it takes another to nock"*

> **Slow-Loosing** `slow-loosing` — `attribute` · `negative` · `personal`
> `combatMods → aim_speed 0.90, reload_speed 0.90` · magnitude: moderate
> *"a careful shooter — too careful for a moving fight"*

> **Fumble-Fingered** `fumble-fingered` — `attribute` · `negative` · `personal`
> `combatMods → aim_speed 0.60, reload_speed 0.60` · magnitude: significant
> *"they'll drop the bolt twice before it's spanned"*

### COMBAT · Longshot (aim_range + aim_speed) — ranged reach & readiness

> **Long-Ranging** `long-ranging` — `attribute` · `uncommon` · `racial`
> `combatMods → aim_range 1.15, aim_speed 1.10` · magnitude: moderate
> *"they pick off a mark others would let walk by"*

> **Sharpshooter** `sharpshooter` — `attribute` · `rare` · `racial`
> `combatMods → aim_range 1.40, aim_speed 1.30` · magnitude: significant
> *"give them a rise and a clear line and nothing crosses it"*

> **Short-Ranged** `short-ranged` — `attribute` · `negative` · `personal`
> `combatMods → aim_range 0.90, aim_speed 0.95` · magnitude: moderate
> *"fine up close, useless past a stone's throw"*

> **Point-Blank Only** `point-blank` — `attribute` · `negative` · `personal`
> `combatMods → aim_range 0.60, aim_speed 0.80` · magnitude: significant
> *"if they can't touch it they can't hit it"*

### RESISTANCE — *relocated to coverings (§3) & affinities (§6)*

Per your revision, resistance is no longer a free `attribute` number. It is now sourced two ways:

- **Thermal / physical resistance → a §3c covering.** Cold/wet resistance rides **fur** or **feather**;
  physical (cut/pierce/blunt) rides **scale** / **chitin** / **plate**. A pawn is cold-hardy because it
  *has a pelt*, and losing that covering loses the resistance — grounded, not abstract.
- **Toxin / mental / elemental hardiness → a `passive` affinity** (the "aura/affinity" kind). It carries
  a `selfCondition` pill so it reads in the health panel, and resistance is legitimate on `passive`.

Worked example (the old *Toxin ward* combo, re-shaped as an affinity rather than an abstract attribute):

> **Hardy Gut** `hardy-gut` — `passive` · `uncommon` · `racial`
> `selfCondition → hardy_gut` *(the condition def carries the resistances — single source of truth)*
> `effects → poisonResistance 0.15, diseaseResistance 0.15` · *(allowed: this is an affinity, not an abstract stat trait)*
> *"they'll eat what dropped a stronger stomach and ask for more"*
> *significant tier* `plagueproof` (rare, `poison/disease 0.50`); *flaw side* is a **§6b trigger** —
> `weak-gutted` procs `nausea`/`dysentery` off tainted food, rather than a flat −resistance number.

> *Template note:* further **work** combos slot straight in — **Labour** (woodcutting speed + yield),
> **Smith** (metalworking speed + quality), **Cook** (cooking speed + quality); further **combat** combos
> from the `combatMods` palette (e.g. **Duelist** = attack_speed + dodge). Same 4-card shape. Resistance
> variety now lives in §3 coverings + §6 affinities — never on a plain `attribute` combo.

---

## §2 · Core-stat progressions

### §2a · Single-stat ladders (±1 / ±3 / ±5)

`stat`-kind, one attribute only. Positives climb `common → uncommon → rare`; a +5 to one stat is a
genuine rare identity pull. All negatives are rarity `negative` (the flaw tier), deepening by magnitude.
Ids are stat-prefixed so they never collide.

**Strength**

| id | name | rarity | effects |
|----|------|--------|---------|
| `str-plus-1` | Strapping | common | `strengthBonus 1` |
| `str-plus-3` | Powerful | uncommon | `strengthBonus 3` |
| `str-plus-5` | Mighty | rare | `strengthBonus 5` |
| `str-minus-1` | Slight | negative | `strengthPenalty 1` |
| `str-minus-3` | Feeble | negative | `strengthPenalty 3` |
| `str-minus-5` | Enfeebled | negative | `strengthPenalty 5` |

**Dexterity**

| id | name | rarity | effects |
|----|------|--------|---------|
| `dex-plus-1` | Nimble | common | `dexterityBonus 1` |
| `dex-plus-3` | Deft | uncommon | `dexterityBonus 3` |
| `dex-plus-5` | Quicksilver | rare | `dexterityBonus 5` |
| `dex-minus-1` | Awkward | negative | `dexterityPenalty 1` |
| `dex-minus-3` | Fumbling | negative | `dexterityPenalty 3` |
| `dex-minus-5` | Palsied | negative | `dexterityPenalty 5` |

**Constitution**

| id | name | rarity | effects |
|----|------|--------|---------|
| `con-plus-1` | Robust | common | `constitutionBonus 1` |
| `con-plus-3` | Rugged | uncommon | `constitutionBonus 3` |
| `con-plus-5` | Indomitable | rare | `constitutionBonus 5` |
| `con-minus-1` | Soft | negative | `constitutionPenalty 1` |
| `con-minus-3` | Infirm | negative | `constitutionPenalty 3` |
| `con-minus-5` | Broken-Bodied | negative | `constitutionPenalty 5` |

**Perception**

| id | name | rarity | effects |
|----|------|--------|---------|
| `per-plus-1` | Attentive | common | `perceptionBonus 1` |
| `per-plus-3` | Perceptive | uncommon | `perceptionBonus 3` |
| `per-plus-5` | Uncanny | rare | `perceptionBonus 5` |
| `per-minus-1` | Inattentive | negative | `perceptionPenalty 1` |
| `per-minus-3` | Absent | negative | `perceptionPenalty 3` |
| `per-minus-5` | Heedless | negative | `perceptionPenalty 5` |

**Intelligence**

| id | name | rarity | effects |
|----|------|--------|---------|
| `int-plus-1` | Clever | common | `intelligenceBonus 1` |
| `int-plus-3` | Brilliant | uncommon | `intelligenceBonus 3` |
| `int-plus-5` | Genius | rare | `intelligenceBonus 5` |
| `int-minus-1` | Simple | negative | `intelligencePenalty 1` |
| `int-minus-3` | Dim | negative | `intelligencePenalty 3` |
| `int-minus-5` | Witless | negative | `intelligencePenalty 5` |

**Charisma**

| id | name | rarity | effects |
|----|------|--------|---------|
| `cha-plus-1` | Affable | common | `charismaBonus 1` |
| `cha-plus-3` | Charming | uncommon | `charismaBonus 3` |
| `cha-plus-5` | Magnetic | rare | `charismaBonus 5` |
| `cha-minus-1` | Aloof | negative | `charismaPenalty 1` |
| `cha-minus-3` | Off-Putting | negative | `charismaPenalty 3` |
| `cha-minus-5` | Repellent | negative | `charismaPenalty 5` |

### §2b · Stat trade-offs (+N one stat / −N another)

Net-neutral, so they sit *cheap* — a `common`/`uncommon` "shaped" pawn rather than a pure gain. These
are the most flavourful variety pulls (they make a pawn feel specialised). One representative pair per
axis-swap; the ±3 rung shown, ±1 and ±5 rungs follow the same template at `common` / `rare`.

| id | name | rarity | effects | reads as |
|----|------|--------|---------|----------|
| `str-for-dex-3` | Bruiser | uncommon | `strengthBonus 3, dexterityPenalty 3` | power over finesse |
| `dex-for-str-3` | Willowy | uncommon | `dexterityBonus 3, strengthPenalty 3` | finesse over power |
| `con-for-int-3` | Bull-Headed | uncommon | `constitutionBonus 3, intelligencePenalty 3` | body over mind |
| `int-for-con-3` | Bookish | uncommon | `intelligenceBonus 3, constitutionPenalty 3` | mind over body |
| `per-for-cha-3` | Watchful Recluse | uncommon | `perceptionBonus 3, charismaPenalty 3` | sees all, charms none |
| `cha-for-per-3` | Glad-Hander | uncommon | `charismaBonus 3, perceptionPenalty 3` | all warmth, little notice |
| `str-for-int-3` | Brute | uncommon | `strengthBonus 3, intelligencePenalty 3` | muscle over sense |
| `int-for-cha-3` | Cold Intellect | uncommon | `intelligenceBonus 3, charismaPenalty 3` | brilliant, chilly |

*(±1 rungs → e.g. `str-for-dex-1` "Solid", `common`. ±5 rungs → e.g. `str-for-dex-5` "Juggernaut",
`rare` — a dramatic, lopsided body.)*

### §2c · Two-stat combined swings (both up, or both down)

Two stats move **the same way** — a broad, expensive gift or a broad flaw. Rarity climbs with
magnitude. STR&DEX shown as the worked example (the "complete warrior" axis); the same ladder is
minted for any pair the design wants (CON&STR the ox, INT&PER the scholar, CHA&INT the diplomat…).

| id | name | rarity | effects |
|----|------|--------|---------|
| `str-dex-plus-1` | Athletic | uncommon | `strengthBonus 1, dexterityBonus 1` |
| `str-dex-plus-3` | Warrior-Built | rare | `strengthBonus 3, dexterityBonus 3` |
| `str-dex-plus-5` | Peerless Physique | epic | `strengthBonus 5, dexterityBonus 5` |
| `str-dex-minus-1` | Ungainly | negative | `strengthPenalty 1, dexterityPenalty 1` |
| `str-dex-minus-3` | Feeble & Fumbling | negative | `strengthPenalty 3, dexterityPenalty 3` |
| `str-dex-minus-5` | Wretched Frame | negative | `strengthPenalty 5, dexterityPenalty 5` |

*Other canonical pairs to mint (same 6-rung ladder):* `con-str-*` **Ox** · `int-per-*` **Scholar** ·
`cha-int-*` **Diplomat** · `per-dex-*` **Marksman** · `con-int-*` **Sage**.

### §2d · All-stats swings (the grand pulls)

Every core stat moves together. This is the top of the ladder and the brief's explicit mapping:
**+5 all = legendary, +3 all = mythic, +1 all = epic**; the debuffs mirror the tier.

| id | name | rarity | effects | notes |
|----|------|--------|---------|-------|
| `all-plus-1` | Blessed Stock | epic | every `*Bonus 1` | a quietly gifted bloodline |
| `all-plus-3` | Paragon Blood | mythic | every `*Bonus 3` | a heroic lineage |
| `all-plus-5` | Godtouched | legendary | every `*Bonus 5` | the once-in-a-world pawn |
| `all-minus-1` | Ill-Made | negative | every `*Penalty 1` | drawn on the flaw layer (heavy) |
| `all-minus-3` | Blighted Lineage | mythic⁻ | every `*Penalty 3` | **see acquisition note** |
| `all-minus-5` | Accursed Blood | legendary⁻ | every `*Penalty 5` | **see acquisition note** |

> **Acquisition note (open decision, §8):** the flaw layer only has ONE `negative` tier, drawn by a
> low-mean Gaussian *count* — "most pawns clean, a rare wretch carries four small flaws." A
> −3-to-everything trait does **not** fit that model (it isn't a small quirk; it's a catastrophe). Two
> ways to hang it:
> 1. **Cursed-lineage roll (recommended):** the grand curses ride the *race-identity* roll as the dark
>    mirror of the legendary/mythic banners — a race can roll `blighted` exactly as it can roll
>    `dragon-heritage`, at the same ~1.5% odds. They become a *race* trait, not an individual flaw. This
>    also gives §4's dark trees (`§4.10 Blighted`) a home. Needs a `negative-legendary`/`negative-mythic`
>    concept the rarity draw understands (today `negative` is filtered out of race pools by
>    `traitFlaws.test.ts`). Small, contained change to `generateRaceTraitSets`.
> 2. **Keep them flaw-tier** but let the flaw layer draw *one* "major" flaw (magnitude ≥3) at a very low
>    rate. Simpler, but a −5-all individual with no lineage story is thematically flat.
>
> `all-plus-1` at `epic` and `all-minus-1` at `negative` both fit the *existing* system with no change —
> those two can ship now; the deeper curses wait on the decision.

---

## §3 · Natural-gear expansion — staged weapons & armor, and creature heritages

Two goals from the brief: (1) every natural weapon/armor **type** a creature can carry becomes available
to pawns, with a couple of tweaks, so you can play a *real* ursine / avian / arachnid / amphibian pawn;
(2) each line has **3 stages**, connected by a data flag, so a later **age** system can drive evolution.

### §3a · The staging model

Today `evolvesTo` already exists as groundwork (a base names the higher trait it grows into — e.g.
`thick-skinned → scaled-hide`), but nothing reads it at runtime and there is **no `stage` field**. The
proposal makes the groundwork real:

> **New field (§7):** `stage?: 1 | 2 | 3` on `Trait`, plus a 3-link `evolvesTo` chain per line
> (`s1.evolvesTo → s2`, `s2.evolvesTo → s3`). Each stage keeps the current `naturalGear` shape: its own
> `selfCondition` → its own condition granting a stage-appropriate weapon/armor item (exactly as
> `boar_tusk` dmg 9 and `tusk` dmg 13 are already two separate items today — staging is just formalising
> that pattern into a named ladder).

- **At pawn-gen (now):** a pawn rolls the line at a stage weighted by age — a youth gets S1, an elder S3.
  Pure data; no new runtime.
- **Later (age-driven, §7):** an `evolutionTrigger: { minAgeYears }` (or milestone) auto-walks
  `stage N → N+1` by swapping the trait for its `evolvesTo`. This is the "age drives evolution" hook —
  spec it now, wire it when the age system lands.
- **Binding:** stage weapons bind to `hostParts` the humanoid body has (`jaw`, `head`, `leftHand`/
  `rightHand`). Weapons that need a part the humanoid plan lacks (`tail`, `wing`, `beak`, `maw`) either
  ride **unbound** (the existing ADR-023 racial-pawn-weapon trick — always available, no host part) or,
  better, the race takes a **non-humanoid `limbMap`** (the plans already exist — see §3d).

### §3b · Weapon lines (3 stages each)

Rarity climbs with the stage. `hostParts` and `blocksSlots` shown once per line. **Bold** = already in
`traits.jsonc`/`items.jsonc` today (the retrofit slots it in as that line's middle rung).

| line | S1 (uncommon) | S2 (rare) | S3 (epic) | hostParts · blocks · weapon dmg/type |
|------|---------------|-----------|-----------|--------------------------------------|
| **Claws** | Budding Claws `budding-claws` → wpn `blunt-claws` d7 cut | **Rending Claws `rending-claws`** → `rending-claws` d12 cut | Ripping Talons `ripping-talons` → `ripping-talons` d16 cut, bloodletting 0.3 | hands · blocks mainHand+gloves · crafting penalty scales down the line |
| **Fangs** | Jagged Teeth `jagged-teeth` → `bite` d11 pierce | Goring Fangs `goring-fangs` → `goring-fangs` d13 pierce | Sabre Fangs `sabre-fangs` → `sabre-fangs` d16 pierce, bloodletting 0.25 | jaw · — |
| **Horns** | Nub Horns `nub-horns` → `headbutt` d6 blunt | **Goring Horns `gore-horns`** → `goring-horns` d13 pierce, knockdown 0.2 | Great Horns `great-horns` → `great-horns` d16 pierce, knockdown 0.4 | head · blocks headOuter+headBase |
| **Tusks** | Small Tusks `small-tusks` → `boar_tusk` d9 pierce | Tusks `boar-tusks` → `tusk` d13 pierce | Great Tusks `great-tusks` → `great-tusks` d16 pierce, knockdown 0.3 | jaw/snout · — |
| **Venom bite** | Mild Venom `mild-venom` → `serpent-fangs`, envenomed 0.2 | **Venom Glands `venomous`** → `serpent-fangs`, envenomed 0.35 | Deathly Venom `deathly-venom` → `deathly-fangs`, envenomed 0.6 + potent | jaw · poisonResistance climbs 0.15→0.3→0.5 |
| **Ember breath** | Ember Breath `ember-breath` → `ember-breath` d8 fire, burning 0.3 | Flame Breath `flame-breath-r` → `flame-breath` d14 fire, burning 0.7 | Dragonfire `dragonfire` → `dragonfire` d20 fire, burning 0.9 | head · fireResistance climbs · S2/S3 sit under Dragon Heritage (§4) too |
| **Talons** (avian) | Raking Talons `raking-talons` → `talon` d9 cut | Hooked Talons `hooked-talons` → d13 cut | Raptor Talons `raptor-talons` → d16 cut, bloodletting | feet (avian plan) or unbound · kick-slot |
| **Beak / Peck** (avian) | Pecking Beak `pecking-beak` → `peck` d4 pierce | Tearing Beak `tearing-beak` → d9 pierce | Rending Beak `rending-beak` → d13 pierce | beak (avian plan) or unbound |

> New weapon items needed (all `category:"natural_weapon"`, `hidden`, `amount:0`, unbound unless a plan
> hosts them): `blunt-claws`, `ripping-talons`, `goring-fangs`, `sabre-fangs`, `great-horns`,
> `great-tusks`, `deathly-fangs`, `ember-breath`, `dragonfire`, plus avian `talon`/`raptor-talons`/
> `tearing-beak`/`rending-beak`. Modelled on the existing racial-pawn-weapon block (`items.jsonc:3784+`).

### §3c · Armor lines (3 stages each)

`naturalGear` armor via a `selfCondition` carrying `grantsNaturalArmor` + `carryPenalty` + `mode`.

| line | S1 (uncommon) | S2 (rare) | S3 (epic) | mode · blocks · notes |
|------|---------------|-----------|-----------|------------------------|
| **Hide → scale → plate** | Thick Hide `thick-hide` → armor 6 | **Scaled Hide `scaled-hide`** → armor 12 | **Iron Skin `iron-skin`** → armor 18 | stack · carryPenalty 0.03→0.06→0.15 |
| **Fur** | Downy Coat `downy-coat` → armor 3, coldRes 0.15 | **Thick Fur `thick-fur`** → armor 8, coldRes 0.3, fireRes −0.15 | Winter Mane `winter-mane` → armor 12, coldRes 0.45, fireRes −0.2 | replace · blocks bodyMid |
| **Chitin** | Chitin Plates `chitin-plates` → armor 8 | Carapace `carapace` → armor 14 | Ironshell `ironshell` → armor 20 | stack · carryPenalty 0.05→0.1→0.18 · arachnid heritage |
| **Feathered coat** | **Feathered `feathered`** (passive, coldRes 0.2, no armor) | Plumed Coat `plumed-coat` → armor 4, coldRes 0.3 | Storm Plumage `storm-plumage` → armor 7, coldRes 0.4, wetnessRes 0.3 | replace · light (low carryPenalty) |

> **bodyMod lines stay separate** (they change bone/flesh HP + weight, not an armor soak): the existing
> `thick-skinned → scaled-hide` note conflates two axes — recommend the *bodyMod* hide line
> (`thin-skinned` / `thick-skinned` flesh-HP) and the *naturalGear* armor line above stay distinct
> conflict groups so a pawn can hold one of each (tough padding **and** a plated soak) without them
> reading as the same thing. Skeleton density (`brittle-boned`/`heavy-boned`/`stone-bones`) is already a
> clean 3-rung bodyMod line — it just needs the `stage` flag to join this section formally.

### §3d · Creature-body heritage packages (play a *real* beast-kin)

Each maps one `creatures.jsonc` body plan onto a pawn heritage — a `passive` banner (small always-on
affinity) + `subCapabilities` drawing the plan's signature staged weapon/armor. These sit at
**rare/epic** (a notch below the §4 legendaries, above a lone naturalGear trait). Two build paths:

- **Cheap (ships on today's engine):** humanoid `limbMap`, gear granted **unbound** (the `rending-claws`
  trick). Works immediately; slightly odd that a "beak" rides a humanoid jaw.
- **True-form (recommended, needs one flag):** give the race its own `limbMap` (`avian`, `arachnid`,
  `amphibian`, `quadruped`…). The plans **already exist** in `limbmap.jsonc`; the only gap is that pawn
  generation hard-defaults to `"humanoid"` — expose a `race.limbMap` override (§7). Then talons bind to
  real talon parts, a lost wing really removes flight, etc. This is the payoff that makes them *feel*
  like the creature, not a costume.

> **Ursine** `ursine-kin` — `passive` · `rare` · `racial` · plan `quadruped`(or humanoid+unbound)
> `effects → constitutionBonus 1, coldResistance 0.15`
> `subCapabilities →` Claws line S2 (`rending-claws`), Fur line S2 (`thick-fur`), bodyMod `heavy-boned`
> *"broad, heavy and slow to anger — and terrible once it is roused"*

> **Avian** `avian-kin` — `passive` · `rare` · `racial` · plan `avian`
> `effects → dexterityBonus 1, perceptionBonus 1, coldResistance 0.1`
> `subCapabilities →` Talons S2, Beak S2, Feathered line S1/S2, `hollow-boned` (new bodyMod: skeleton
> hpMult 0.8, weightKg −6 → light, fragile, an emergent flight/speed hook)
> `blocksSlots → [hands… ]` if wing-armed · *"light-boned and sharp-eyed, at home on the high crags"*

> **Arachnid** `arachnid-kin` — `passive` · `epic` · `racial` · plan `arachnid`
> `effects → dexterityBonus 1, poisonResistance 0.2, nightVision 0.3`
> `subCapabilities →` Chitin armor line S2 (`carapace`), Venom bite S2 (`venomous`), `many-eyed`
> (passive → nightVision, ties to the 8-eye plan), *silk* (new work hook — see note)
> *"eight patient eyes and a bite that waits"* · **note:** silk-gland → butcher yield isn't organ-aware
> yet (`limbmap.jsonc:298` TODO) — silk as a *produces* hook is a stretch goal.

> **Amphibian** `amphibian-kin` — `passive` · `rare` · `racial` · plan `amphibian`
> `effects → wetnessResistance 0.3, coldResistance 0.15, fireResistance −0.2`
> `subCapabilities →` `moist-skinned` (exists), Web-Claws (Claws S1 rebound to web-feet), Maw-Bite
> (Fangs S2 on the `maw` part), and the **wet-triggered** combat buff from §6b (`hydro-vigor`)
> *"at home in the mire; the dry air is the enemy"* · lesser cousin of mythic `amphibious`.

> **Serpentine** `serpent-kin` — `passive` · `epic` · `racial` · plan `serpentine`
> `effects → poisonResistance 0.3, coldResistance −0.2, fireResistance 0.15` (cold-blooded)
> `subCapabilities →` Venom bite S2/S3, `scaled-hide` S2, **cold-blooded trigger** from §6b (sluggish in
> cold, quick in heat) · *"a coiled patience, and a bite that ends the argument"*

> **Bovine / Cervine** `horned-kin` — `passive` · `rare` · `racial` · plan `quadruped_hooved`
> `effects → constitutionBonus 2, strengthBonus 1`
> `subCapabilities →` Horns S2 (`gore-horns`) or Tusks, Hooves (kick weapon), Thick Hide S1
> *"placid until crowded, and then all horn and shoulder"*

---

## §4 · Ten legendary / mythic heritage trees

Same shape as `dragon-heritage` / `vampiric`: a `passive` **banner** (rarity `legendary` or `mythic`,
small always-on `effects`) carrying a `subCapabilities` array; the race rolls the banner (~1.5% legendary
/ ~1.5% mythic), each pawn gets the banner + **one** random sub-cap at spawn (the rest are the future
growth pool). Themes are chosen to **not** collide with what exists (draconic, vampiric, amphibious,
frost-born, berserker, nocturnal, regeneration, photosynthesis, iron-skin). Inspiration tagged per tree.

> **Legend:** each sub-cap line is `name` `id` — `kind` → key mechanic. `⟨new⟩` = needs a new condition/
> weapon/aura (collected in §7). `⟨exists⟩` = reuses a live condition/weapon.

### §4.1 · Stoneblood *(legendary)* — DnD earth-genasi / stone-giant · CoQ crystalline

> **Stoneblood** `stoneblood-heritage` — `passive` · `legendary` · `racial`
> `effects → constitutionBonus 1, blunt_resistance 0.15`
> *"their veins run with a slow, mineral patience; the earth knows them as kin"*
- Living Granite `granite-skin` — `naturalGear` → `grantsNaturalArmor 18`, mode stack ⟨new cond `granite_skinned`⟩
- Quarried Bones `stone-bones` — `bodyMod` → skeleton hpMult 2.2, weightKg 18 ⟨exists⟩
- Crushing Grip `crushing-grip` — `passive` → `weaponBonus.damage 0.2`, `strengthBonus 1`
- Tremor Sense `tremor-sense` — `passive` → `perceptionBonus 2` (feels footfalls; a PER pill) ⟨new cond⟩
- Unmoving `unmoving` — `attribute` → very high knockdown (via `constitutionBonus 2`) + `moveSpeed`↓ flavour

### §4.2 · Echoborn *(mythic)* — CDDA bat/echolocation · DnD

> **Echoborn** `echoborn-heritage` — `passive` · `mythic` · `racial`
> `effects → perceptionBonus 1, nightVision 0.5`
> *"they read the dark by its echoes; a shout paints them the whole room"*
- Echolocation `echolocation` — `passive` → `nightVision 1.0` (sees blind) ⟨new cond `echo_sighted`⟩
- Leathery Wings `membrane-wings` — `naturalGear` → light glide; blocks `bodyMid`; DEX flavour ⟨new, needs plan/unbound⟩
- Piercing Screech `piercing-screech` — `naturalGear` → weapon `screech`, disoriented onHit ⟨exists⟩
- Hollow Bones `hollow-boned` — `bodyMod` → skeleton hpMult 0.8, weightKg −6 (fast, fragile) ⟨new⟩
- Night-Hunter `night-hunter` — `attribute` → `workSpeed.foraging 1.2` at night flavour, `perceptionBonus 1`

### §4.3 · Sporeborn *(legendary)* — CDDA fungal mutations · CoQ

> **Sporeborn** `sporeborn-heritage` — `passive` · `legendary` · `racial`
> `effects → poisonResistance 0.3, diseaseResistance 0.3`
> *"a quiet mycelial partner shares their flesh — and their hungers"*
- Spore Cloud `spore-cloud` — `passive` **aura** (§6a) → nearby foes gain `nausea`/`disoriented` ⟨new aura⟩
- Fungal Knit `fungal-knit` — `passive` → `selfCondition regenerating`, `healRate 0.5` ⟨exists cond⟩
- Toxin-Immune `toxin-immune` — `attribute` → `poisonResistance 0.5, diseaseResistance 0.5`
- Decomposer `decomposer` — `passive` → eats rot/`organic` without sickness (diet hook) ⟨new, needs diet flag⟩
- Rootling `rootling` — `passive` → `selfCondition photosynthesis` (feeds in sun) ⟨exists cond⟩

### §4.4 · Carapaced *(legendary)* — CoQ / CDDA insectoid

> **Carapaced** `carapaced-heritage` — `passive` · `legendary` · `racial`
> `effects → dexterityBonus 1, poisonResistance 0.2`
> *"a chitin-cased thing that does not tire the way soft folk do"*
- Ironshell `ironshell` — `naturalGear` → `grantsNaturalArmor 20`, stack ⟨new cond, §3c⟩
- Scything Blades `scything-arms` — `naturalGear` → weapon `scythe-limb` d15 cut, hostParts hands; blocks mainHand ⟨new wpn⟩
- Compound Eyes `compound-eyes` — `passive` → `nightVision 0.6, perceptionBonus 2` ⟨new cond⟩
- Tireless `tireless` — `attribute` → `workSpeed.all 1.15` (chitin doesn't fatigue) + low fatigue flavour
- Venom Bite `venomous` — `naturalGear` → envenomed onHit ⟨exists⟩

### §4.5 · Stormborn *(mythic)* — DnD storm-genasi · CoQ electrical

> **Stormborn** `stormborn-heritage` — `passive` · `mythic` · `racial`
> `effects → lightningResistance 0.3, dexterityBonus 1`
> *"static crawls their skin; the hair of a room stands when they enter"*
- Shock Touch `shock-touch` — `naturalGear` → weapon `shock-strike` d10 lightning, `staggered` onHit ⟨new wpn/cond⟩
- Grounded `lightning-ward` — `attribute` → `lightningResistance 0.6`
- Quickened `quickened-reflexes` — `stat` → `dexterityBonus 3`
- Storm-Fed `storm-fed` — `passive` → thrives in rain/storm (a **hot/wet trigger** buff, §6b) ⟨new cond⟩
- Static Aura `static-aura` — `passive` **aura** (§6a) → allies gain minor `quickness` ⟨exists buff `quickness` + new aura⟩

### §4.6 · Shadeborn *(legendary)* — DnD shadar-kai/shadow · CoQ umbral

> **Shadeborn** `shadeborn-heritage` — `passive` · `legendary` · `racial`
> `effects → shadowResistance 0.3, nightVision 0.5`
> *"the light seems to lean away from them; they are most present at dusk"*
- Umbral Sight `umbral-sight` — `passive` → `nightVision 1.0`, `shadowResistance 0.3` ⟨exists `night_eyed` cond⟩
- Chilling Touch `chilling-touch` — `naturalGear` → weapon `chill-strike` d9, `hypothermia`/cold onHit ⟨new⟩
- Dread Presence `dread-aura` — `passive` **aura** (§6a) → nearby foes `disoriented`/morale ⟨new aura⟩
- Sunless `sun-frail` — `passive` → `selfCondition light_sensitive` (weak in daylight — the cost) ⟨exists⟩
- Shadowmeld `shadowmeld` — `attribute` → `dexterityBonus 2` in low light flavour (stealth hook)

### §4.7 · Colossus *(mythic)* — DnD goliath/giant · CoQ

> **Colossus** `colossus-heritage` — `passive` · `mythic` · `racial`
> `effects → strengthBonus 2, constitutionBonus 1`
> `requires → { minHeightCm: 200 }` *(a giant-blooded pawn is never small)*
> *"they were carved on a larger scale than the rest of us, and never let you forget it"*
- Giant's Grip `giants-grip` — `passive` → `weaponBonus.damage 0.3` (any wielded weapon)
- Massive Frame `massive-frame` — `bodyMod` → flesh hpMult 1.3, weightKg 30 (huge blood pool, encumbering)
- Titan Bones `stone-bones` — `bodyMod` → skeleton hpMult 2.2 ⟨exists⟩
- Ground-Shaker `ground-shaker` — `naturalGear` → weapon `slam` d13, knockdown onHit ⟨exists wpn⟩
- Long Reach `long-reach` — `attribute` → `strengthBonus 3` (net brute)

### §4.8 · Wildblooded *(legendary)* — DnD fey/dryad · CoQ verdant

> **Wildblooded** `wildblooded-heritage` — `passive` · `legendary` · `racial`
> `effects → charismaBonus 1, diseaseResistance 0.2`
> *"green things lean toward them; something older than speech looks out of their eyes"*
- Sunfed `sunfed` — `passive` → `selfCondition photosynthesis` ⟨exists⟩
- Thorned Skin `thorn-skin` — `naturalGear` → `grantsNaturalArmor 6` + `bloodletting` reflected onHit ⟨new cond⟩
- Fey Charm `fey-charm` — `stat` → `charismaBonus 3`
- Verdant Knit `verdant-knit` — `passive` → `selfCondition regenerating`, `healRate 0.4` (fastest in daylight) ⟨exists⟩
- Beast-Speech `beast-speech` — `attribute` → taming/animal-handling hook (reserved) + `charismaBonus 1`

### §4.9 · Farseer *(mythic)* — DnD aberrant mind · CoQ psionics

> **Farseer** `farseer-heritage` — `passive` · `mythic` · `racial`
> `effects → intelligenceBonus 1, mentalResistance 0.3`
> *"their attention arrives a moment before they do; secrets feel unsafe near them"*
- Ironclad Mind `ironclad-mind` — `attribute` → `mentalResistance 0.5, shadowResistance 0.2`
- Keen Intellect `keen-intellect` — `stat` → `intelligenceBonus 3`
- Unnerving Presence `unnerving-aura` — `passive` **aura** (§6a) → foes `disoriented`, allies uneasy ⟨new aura⟩
- Sleepless `sleepless` — `passive` → reduced sleep need (reserved `needs` hook) ⟨new needs hook⟩
- Foreknowing `foreknowing` — `attribute` → `perceptionBonus 2` (threat detection)

### §4.10 · Blighted *(legendary⁻ — the dark mirror)* — CDDA "bad" mutation lines · DnD undeath-touched

The negative-legendary that houses the §2d grand curse. Rides the race-identity roll as the mirror of a
heritage (see §2d acquisition note / §8). Self-immune to what it spreads — a walking plague that lives.

> **Blighted** `blighted-heritage` — `passive` · `legendary` (negative-polarity) · `racial`
> `effects → poisonResistance 0.4, diseaseResistance 0.4` *(it thrives in its own rot)*
> *"something in the blood went wrong generations back, and settled in to stay"*
- Accursed Blood `all-minus-3` — `stat` → every `*Penalty 3` (the §2d grand curse) ⟨§2d⟩
- Plague-Vector `plague-vector` — `passive` **aura** (§6a) → nearby *foes* accrue `infection`/`nausea` ⟨new aura⟩
- Carrion-Fed `carrion-fed` — `passive` → eats rot without sickness (diet hook) ⟨new, cf. §4.3 decomposer⟩
- Unquiet Flesh `unquiet-flesh` — `passive` → `selfCondition regenerating` (it will not die cleanly) ⟨exists⟩
- Dread Visage `dread-visage` — `stat` → `charismaPenalty 4` (no one trusts it)

> **Design read on §4:** three of these (Sporeborn, Shadeborn, Farseer, Stormborn, Blighted) lean on the
> **aura** system from §6a, which is genuinely new. Trees that avoid auras (Stoneblood, Colossus,
> Carapaced, Wildblooded, Echoborn) are buildable on **today's** engine using only existing
> `naturalGear`/`bodyMod`/`stat` mechanics + the §3 staged gear. If you want to ship a first batch before
> the aura work, those five are the no-new-runtime set.

---

## §5 · Scars & lost limbs — the `wound` layer

All of these are `kind: "wound"` (real injuries stamped at pawn-gen by `applyTraitWounds`), rarity
`negative`, scope `personal`. Because they are **trait-stamped**, the injuries are **permanent scars** —
they never heal off (the `permanent` flag + the `recomputeWound` merge-guard already ship), and the
health panel already renders a permanent wound as *"old ⟨type⟩ scar"* (`selectionCard.ts`). Effects flow
through the body model (capacity → stat), never a stat fudge. Paired parts (`leftEye`, `leftHand`…) flip
to the twin at random for variety, so "One-Armed" isn't always the left arm.

### §5a · Lost limbs (the destroyed-limb pulls)

One flaw per non-fatal humanoid limb; severity `destroyed`. **Fatal parts** (head/brain, chest/heart/
lungs, abdomen-with-both-kidneys) are *excluded* — the cap is non-lethal by design. The three worst pulls
(no arm, no leg, no kidney) are flagged.

| id | name | wounds → part · severity | body-model effect | severity of pull |
|----|------|--------------------------|-------------------|------------------|
| `one-armed` | One-Armed | `leftUpperArm` destroyed | manipulation ~half → crafting/combat/carry gutted | **bad pull** |
| `one-legged` | One-Legged | `leftUpperLeg` destroyed | moving ~half → move/dodge/work crawl | **bad pull** |
| `one-kidney` | Single Kidney | `leftKidney` destroyed | blood_filtration ~60% → heal/toxin/stamina-recovery down | **bad pull** |
| `one-handed` | One-Handed | `leftHand` destroyed | manipulation partial (milder than whole arm) | serious |
| `one-footed` | One-Footed | `leftFoot` destroyed | moving partial | serious |
| `one-eyed` | One-Eyed *(exists)* | `leftEye` destroyed | sight → hit_chance/aim/vision | serious |
| `hard-of-hearing` | Hard-of-Hearing *(exists)* | `leftEar` destroyed | hearing → consciousness/detection | moderate |
| `missing-fingers` | Maimed Hand | `leftIndexFinger` + `leftMiddleFinger` destroyed | small manipulation | moderate |
| `missing-toes` | Maimed Foot | `leftBigToe` + `leftSecondToe` destroyed | small moving | minor |
| `noseless` | Noseless | `nose` destroyed | cosmetic + pain | minor |
| `broken-jaw` | Ruined Jaw | `jaw` serious (`crush`) | talking → social capacity | moderate |

> The set is exactly "one per non-fatal limbmap limb", so it generalises to any race's `limbMap` — a
> `serpentine` pawn's version of `one-legged` simply has no leg parts to target and is skipped; an
> `avian` pawn gains `one-winged` (a destroyed `leftWing` → flightless) for free. This is why routing
> the label through `bodyLabels.ts` matters (never leak `leftUpperArm` to the panel).

### §5b · Scars — 3 severities × 4 regions × elemental type

Non-destroying permanent scars: severity `minor | serious | critical` (destroyed = §5a). Each region ×
severity comes in **elemental variants** via the wound `type` field — `cut` (default), `burn`
(*"old burn scar"*), `frostbite` (*"old frostbite scar"* — **new wound type, §7**). `crush` (degenerative,
like bad-back) is a fourth variant for torso/back. The readout is automatic. Effect scales region×severity.

**Arms** (target `leftUpperArm`/`leftForearm`/`leftHand` flesh — hits *manipulation*)

| id | name | wound | effect |
|----|------|-------|--------|
| `arm-scar-minor` | Scarred Arm | `leftForearm` minor | ~cosmetic + faint pain |
| `arm-scar-serious` | Wasted Arm | `leftUpperArm` serious | permanent manipulation dent → crafting/combat |
| `arm-scar-critical` | Withered Arm | `leftUpperArm` critical | severe manipulation loss (short of severed) |

**Legs** (target `leftUpperLeg`/`leftLowerLeg` flesh — hits *moving*)

| id | name | wound | effect |
|----|------|-------|--------|
| `leg-scar-minor` | Scarred Leg | `leftLowerLeg` minor | faint limp + pain |
| `leg-scar-serious` | Lamed Leg | `leftUpperLeg` serious | permanent move/dodge dent |
| `leg-scar-critical` | Crippled Leg | `leftUpperLeg` critical | severe move loss (short of severed) |

**Torso** (target `chest`/`abdomen` flesh — never the organs → non-fatal; mostly *pain* + stamina)

| id | name | wound | effect |
|----|------|-------|--------|
| `torso-scar-minor` | Scarred Torso | `abdomen` minor | pain |
| `torso-scar-serious` | Gutted | `abdomen` serious | pain + digestion dent (via abdomen) |
| `torso-scar-critical` | Broken-Backed | `spine` critical (`crush`) | the deep bad-back — pervasive pain/capacity |

**Head** (target `head`/face flesh, never brain — non-fatal; *pain* + sensory if face)

| id | name | wound | effect |
|----|------|-------|--------|
| `head-scar-minor` | Scarred Face | `head` minor | cosmetic + pain |
| `head-scar-serious` | Battered Skull | `head` serious | pain + concussive-prone flavour |
| `head-scar-critical` | Ravaged Face | `head` critical + `nose` destroyed | heavy pain + sensory |

> Elemental cross-product: each of the 12 rows above ships in `cut` / `burn` / `frostbite` (torso adds
> `crush`). That's the "permanent burn/frostbite scars" ask — same `part`+`severity`, different `type`,
> different readout and lore. Suggest **weighting** the draw so a fire-biome pawn skews `burn` and a
> frost-biome pawn skews `frostbite` (ties scars to where the pawn was forged — a §7 nicety, not required).

---

## §6 · Auras & trigger-conditioned traits

### §6a · Auras — a NEW system (mirrors the magical buff conditions)

Auras (a pawn radiating a condition to nearby pawns) **do not exist today** — only environmental heat
radiates to *tiles*. This is genuinely new runtime (§7). Proposed shape: a `passive` trait carries

> `aura → { condition: <id>, radius: <tiles>, affects: 'allies' | 'foes' | 'all' }`

and each tick the pawn stamps that transient condition onto every pawn within `radius` (via the existing
`SpatialIndexService` nearest/within query, ADR-008 — **must** go through the interface, not inline). The
radiated conditions **reuse the magical buff/debuff library** already in `conditions.jsonc`
(`might`, `insight`, `vigor`, `quickness`, `keen_senses`, `fortitude`, `grace`; debuffs `disoriented`,
`nausea`). Five archetypes, each a lineage banner-adjacent power (positive = buff allies, mirror = debuff
foes):

> **Warlord's Presence** `aura-might` — `passive` · `epic` · racial · lineage: Colossus/Warborn
> `aura → { condition: might, radius: 4, affects: allies }` — nearby allies fight harder
> *mirror:* **Cowing Presence** `aura-dread` → `{ disoriented, radius: 4, affects: foes }`

> **Guardian's Aura** `aura-fortitude` — `passive` · `epic` · racial · lineage: Stoneblood
> `aura → { condition: fortitude, radius: 4, affects: allies }` — allies stand firmer

> **Battle-Cadence** `aura-quickness` — `passive` · `epic` · racial · lineage: Stormborn
> `aura → { condition: quickness, radius: 4, affects: allies }` — allies act faster

> **Watchful Aura** `aura-insight` — `passive` · `rare` · racial · lineage: Farseer/Echoborn
> `aura → { condition: keen_senses, radius: 5, affects: allies }` — allies spot threats sooner

> **Spore Cloud** `aura-spore` — `passive` · `rare` · racial · lineage: Sporeborn/Blighted
> `aura → { condition: nausea, radius: 3, affects: foes }` — foes sicken near them *(the §4 plague auras)*

> **⚠ Perf gate:** an aura = a per-tick radius query + per-neighbour condition write on the sim hot path.
> Cross-check `ENGINE-PERFORMANCE.md` **before** building it — cap aura-bearers, reuse the spatial index's
> existing query (no new allocation per tick), and stamp via the transient-condition path (no immutable
> spread). This is the one part of the whole expansion with a real per-tick cost.

### §6b · Trigger-conditioned traits — **data-only** (fits the existing graph)

These proc a condition off live pawn state — *when wet / cold / hot / in pain / bleeding …* — and need
**no new runtime**: the condition graph already reads `need` (wetness/coldExposure/heatExposure/hunger/
thirst/hygiene), `meter` (`bloodFrac`/`pain`/`ambientLight`), `unsheltered`, and `hasCondition`. Each
trait grants a `selfCondition`; that condition def carries either an `activateWhen` predicate (a buff that
is *only live while the state holds*) or a `triggers` edge (a *follow-up* condition fired by the state).
One positive + one negative per affliction, each tied to a lineage. **Your two flagship examples are the
`wet→combat` buff and `anemic→shock` follow-up.**

| trigger state (predicate) | ➕ positive trait · lineage · mechanism | ➖ negative trait · lineage · mechanism |
|---|---|---|
| **Wet** (`need: wetness ≥ 50`) | **Hydro-Vigor** `hydro-vigor` · Amphibian · `activateWhen` → `modifiers {dodge 1.2, moveSpeed 1.15}` | **Waterlogged** `waterlogged` · fire/desert kin · `activateWhen` → `{fatigueRate 1.3, moveSpeed 0.85}` |
| **Cold** (`need: coldExposure ≥ 60`) | **Coldsurge** `coldsurge` · Frost-Born · `activateWhen` → `{attack_speed 1.15, moveSpeed 1.1}` | **Frostbrittle** `frostbrittle` · reptile · `trigger` → `hypothermia` (faster onset) |
| **Hot** (`need: heatExposure ≥ 60`) | **Sun-Fueled** `sun-fueled` · Salamander/Dragon · `activateWhen` → `{healRate× , strength 1.1}` | **Heat-Faint** `heat-faint` · frost kin · `trigger` → `heat_stroke`/`collapse` sooner |
| **Dark** (`meter: ambientLight ≤ 0.3`) | **Nightbloom** `nightbloom` · Vampire/Shade · `activateWhen` → `{dodge 1.15, hitChance 1.1}` | **Nyctophobic** `nyctophobic` · sun kin · `activateWhen` → `{consciousness 0.85}` (unnerved) |
| **Storm/wet+wind** (`hasCondition: windchilled` + wet) | **Storm-Fed** `storm-fed` · Stormborn · `activateWhen` → `quickness` | **Wind-Cowed** `wind-cowed` · — · `activateWhen` → `{moveSpeed 0.85}` |
| **Filthy** (`need: hygiene low`) | **Filth-Thriving** `filth-thriving` · Grimeling · `activateWhen` → `{diseaseRes via cond}` | **Fastidious** `fastidious` · — · `trigger` → `nausea` when filthy |
| **Pain** (`meter: pain ≥ 40`) | **Painmaddened** `pain-maddened` · Berserker · `activateWhen` → `{strength 1.2, hitChance 1.1}` | **Faint-Hearted** `faint-hearted` · — · `trigger` → `collapse` sooner |
| **Bloodloss** (`meter: bloodFrac ≤ 0.6`) | **Bloodfrenzy** `bloodfrenzy` · Berserker · `activateWhen` → `{attack_speed 1.3}` (death-throes) | **Anemic** `anemic` · thin-blooded · `trigger` → **`shock`** follow-up *(your example)* |
| **Infected** (`hasCondition: infection`) | **Feverburn** `feverburn` · Troll/Sporeborn · `activateWhen` → `{healRate×}` (burns it off) | **Septic** `septic` · — · `trigger` → infection escalates faster |
| **Envenomed** (`hasCondition: envenomed`) | **Venom-Adapted** `venom-adapted` · Serpent · `activateWhen` → shrugs (short duration) | **Thin-Veined** `thin-veined` · — · `trigger` → `nausea`/spread |
| **Burning** (`hasCondition: burning`) | **Emberheart** `emberheart` · Flame-Touched · `activateWhen` → quenches faster | **Tinder-Skin** `tinder-skin` · — · `trigger` → burning lingers |
| **Hungry** (`need: hunger high`) | **Camel-Bodied** `camel-bodied` · desert kin · `activateWhen` → endures (low penalty) | **Ravenous** `ravenous` · — · `trigger` → weakness/`malnutrition` faster |

> Every row is a **new condition def + a trait pointing at it** — pure `conditions.jsonc` + `traits.jsonc`
> data. The only schema touch is confirming the graph's predicate set covers each `need`/`meter` used
> (it does, per the conditions map). This is the cheapest, highest-variety section to ship.

---

## §7 · New plumbing (everything that isn't pure data)

Ordered cheapest → most involved. Data-only additions (new trait/condition/item entries) are **not**
listed — they're the bulk, but they need no code.

- [ ] **Resistance-sourcing rule** — `attribute`-kind traits may not carry a resistance key; move the
      assertion into `traitRegistry.test.ts` (resistances allowed only on `naturalGear`/`passive`). Also
      relocate/flag the existing `marsh-dweller` (today an `attribute` with poison/disease) → `passive`.
- [ ] **`combatMods` channel** (§1 combat) — add `effects.combatMods?: Record<string, number>` and apply
      it in `PawnStatService` exactly like `traitWorkMult` does for `workSpeed` (multiply the matching
      stats.jsonc combat output). Small, mirrors an existing path.
- [ ] **`stage` field + 3-link `evolvesTo`** (§3) — add `stage?: 1|2|3`; extend the `evolvesTo` test to
      allow 3-link chains. Data + a test tweak.
- [ ] **`frostbite` wound type** (§5b) — add to the wound `type` union + `wounds.jsonc`; the "old ⟨type⟩
      scar" readout already handles arbitrary types. Trivial.
- [ ] **`race.limbMap` override** (§3d true-form) — let a race declare a non-`humanoid` plan so beast-kin
      bind real talons/wings/maw. The plans already exist; only pawn-gen's hard `"humanoid"` default and a
      few humanoid-part assumptions need the override threaded through.
- [ ] **Cursed-lineage rarity** (§2d/§4.10) — let the race-identity roll draw a negative-polarity
      legendary/mythic banner (today `negative` is filtered from race pools). Contained change to
      `generateRaceTraitSets` + the flaw test's "no negative in a race pool" assumption.
- [ ] **`evolutionTrigger { minAgeYears }`** (§3a age hook) — waits on the age system; walks
      `stage N → N+1` by swapping a trait for its `evolvesTo`. Spec now, wire with age.
- [ ] **Aura system** (§6a) — `aura?: { condition, radius, affects }` on `Trait`; a per-tick pass that
      queries `SpatialIndexService` for pawns in radius and stamps the transient condition. **Real
      per-tick cost — gate on `ENGINE-PERFORMANCE.md` (see §6a).** The single most involved item.
- [ ] **Reserved hooks** (referenced by a few heritages, not required for a first pass): diet flags
      (`decomposer`/`carrion-fed` eat rot), `sleepless` (reduced sleep need), `beast-speech`
      (animal-handling). Park until the owning systems exist.

## §8 · Open decisions (need your call)

1. **Cursed-lineage acquisition (§2d/§4.10).** Recommend **option 1** — grand curses ride the
   race-identity roll as negative legendaries (`Blighted`), the true dark mirror of `dragon-heritage`. The
   alternative (a rare "major flaw" on the individual layer) is simpler but story-flat. Your call sets
   whether §4.10 and the `all-minus-3/5` curses are race-level or individual.
2. **Ship batching.** A no-new-runtime first wave is available *today*: all of §1 except `combatMods`
   (or include the small `combatMods` add), §2a–c, §3 staged gear as data (minus age auto-evolve), §5
   scars/limbs (minus `frostbite`), §6b trigger traits, and the five aura-free heritages of §4. Auras
   (§6a) + true-form limbMaps + cursed lineages form a second wave. Want me to tag every entry with a
   wave?
3. **True-form vs unbound gear (§3d).** Beast-kin as real non-humanoid limbMaps (they *feel* like the
   creature, lose flight when a wing is torn) vs the cheap unbound-weapon path (ships now, slightly odd).
   Recommend true-form for the flagship four (ursine/avian/arachnid/amphibian), unbound for the rest.
4. **Aura scope & radius.** Allies-only, foes-only, or both? Fixed radius (4) or per-trait? And the perf
   ceiling — how many simultaneous aura-bearers is acceptable on the tick?
5. **How many of §1's 40 to actually mint.** The doc specs the full matrix; you may want only the
   moderate/​significant rungs that read distinct in play and drop redundant middle pulls.
6. **Naming pass.** ~130 new names here obey the ADR-028 naming law (no anatomy on stat/attribute
   traits) but haven't been checked against the live `traits.jsonc` ids for collisions — I'll dedup at
   implementation. Flag any names you dislike now.
