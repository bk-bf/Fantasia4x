<!-- LOC cap: 280 (created: 2026-06-03) -->

# MAGIC FRAMEWORK & SKILL TREES

> **Related:** [ROADMAP](ROADMAP.md) · [COMBAT-SYSTEM](COMBAT-SYSTEM.md) · [EQUIPMENT-EXPANSION](../archive/EQUIPMENT-EXPANSION.md) · [RESEARCH-ENHANCEMENT](RESEARCH-ENHANCEMENT.md) · [game/DESIGN](../../game/DESIGN.md)

## Status

Not started. **Blocked on COMBAT-SYSTEM** — magic and skills are a depth layer
added on top of the physical combat foundation, not the other way round. Ship
COMBAT-SYSTEM first; this spec then slots skills and spells into its existing
combat loop (the optional skill bar, `triggerSkill`, and the `Injury`/damage
pipeline).

---

## Goal

A unified skill and magic framework layered **on top of** the COMBAT-SYSTEM
foundation. Combat already resolves through physical auto-attacks and the
limb/organ injury model; this framework adds active skills and spells that slot
into that combat loop's optional skill bar. Physical abilities and spells share
one `Skill` interface — there is no separate combat tree. Race design (high Int =
affinity unlocks) and lore-item research (Celestia Phase 5 inspiration) gate
access to advanced skill nodes.

---

## Magic Model: Attunement, Not Classes

There are no mage classes. A pawn gains magical ability through:

1. **Attunement items** — staff, focus, grimoire (see EQUIPMENT-EXPANSION)
2. **Research unlocks** — arcane research tree (Tier 2 lore items gate advanced spells)
3. **Racial affinity** — stat-gated (high Int or Wis stat ranges; see RESEARCH-ENHANCEMENT Tier 3)

A pawn without an attuned item cannot cast spells, regardless of stats.
This keeps magic anchored to the production chain (craft the staff first).

### Mana

```typescript
maxMana = 20 + pawn.stats.intelligence × 3 + pawn.stats.wisdom × 2
manaRegen = floor(pawn.stats.wisdom / 8) // per turn, outside combat
manaCostReduction = racialTrait('arcane_affinity') ? 0.15 : 0
```

Mana persists between combats. Out-of-combat regen means mana-intensive pawns
need rest turns between fights — tension without a separate "rest" button.

---

## Elements (Phase 1 — four)

| Element   | Primary stat | Combat role          | Environmental interaction                  |
| --------- | ------------ | -------------------- | ------------------------------------------ |
| Fire      | Intelligence | Burst damage, AoE    | Ignites campfires; burns foliage tiles     |
| Ice       | Wisdom       | Slow/freeze, control | Freezes water tiles (seasonal interaction) |
| Lightning | Dexterity    | Chain damage, stun   | Conductivity through water tiles           |
| Shadow    | Constitution | DoT, debuff          | Amplified at night (ambientLight < 0.4)    |

Environmental interactions are Phase 2. Phase 1 is pure combat effect.

---

## Spell Database

Spells live in `core/Spells.ts` as static definitions. They are granted by
attuned equipment exactly like combat abilities.

```typescript
interface SpellDefinition {
  id: string;
  name: string;
  element: MagicElement;
  apCost: number;
  manaCost: number;
  requiredItemTag: string; // 'staff', 'focus', 'grimoire'
  requiredResearch?: string; // research id that must be unlocked
  statScaling: Partial<Record<StatName, number>>;
  effect: AbilityEffect;
  range: number; // tiles; 0 = self/adjacent
}
```

### Starter spell set (Phase 1)

| Spell        | Element   | AP  | Mana | Effect                                                             |
| ------------ | --------- | --- | ---- | ------------------------------------------------------------------ |
| Ember Shot   | Fire      | 3   | 8    | Ranged, 5–12 fire damage; range 5                                  |
| Frost Lance  | Ice       | 3   | 10   | Ranged, 6–10 ice + Slow (–2 speed 2 turns)                         |
| Arc Bolt     | Lightning | 3   | 7    | Ranged, 4–9; chains to 1 adjacent mob                              |
| Shadow Reach | Shadow    | 2   | 6    | 3–7 DoT (3 turns); night bonus +50%                                |
| Fireburst    | Fire      | 5   | 18   | AoE 2-tile radius, 8–16 fire; requires Intermediate Fire research  |
| Ice Wall     | Ice       | 4   | 15   | Create impassable tile 3 turns; requires Intermediate Ice research |

---

## Skill Trees

Skill trees represent **learned proficiency**, not equipment grants. They apply
passive bonuses that stack with equipment abilities through `ModifierSystem`.

### How skills work

- Pawns accumulate skill XP by performing actions (fighting, crafting, exploring)
- XP thresholds unlock passive nodes in the skill tree
- Nodes are stat-scaled; high-Int pawns benefit more from arcane nodes
- Trees do NOT gate abilities — they amplify them

### Skill tree structure

Each tree has 5 nodes. Node 3 and 5 require a research unlock to activate.

```
Node 1 (100 XP)  — passive bonus, always available
Node 2 (300 XP)  — passive bonus, always available
Node 3 (700 XP)  — requires research: basic [tree] technique
Node 4 (1500 XP) — passive bonus, always available
Node 5 (3000 XP) — requires research: advanced [tree] technique
```

### Phase 1 trees

| Tree          | Source                  | Node 1            | Node 3                            | Node 5                     |
| ------------- | ----------------------- | ----------------- | --------------------------------- | -------------------------- |
| Swordsmanship | Melee combat            | +5% hit chance    | Parry (block 1 attack/turn)       | Whirlwind ability          |
| Archery       | Ranged combat           | +5% crit chance   | Pinning Shot                      | Eagle Eye (range +3)       |
| Fire Mastery  | Fire spells cast        | –10% mana cost    | Ignite (burn DoT)                 | Inferno (AoE upgrade)      |
| Shadow Craft  | Shadow spells cast      | +5% DoT damage    | Wraith Step (teleport 2 tiles)    | Soul Drain (heal on kill)  |
| Survival      | Gathering + exploration | +10% gather yield | Pathfinding (+1 speed wilderness) | Ambush (+25% first-strike) |

---

## Implementation Plan

### Phase A — Data

- `core/Skills.ts` — unified `Skill` interface consumed by the combat skill bar
- `core/Spells.ts` — spell definitions
- `core/SkillTrees.ts` — tree + node definitions
- `Pawn` type: add `mana`, `maxMana`, `skillXP: Record<string, number>`, `unlockedNodes: string[]`, `skillBar: string[]`

### Phase B — MagicService

- `magicService.getGrantedSpells(pawn)` — reads attunement items
- `magicService.castSpell(casterId, targetId, spellId, state)` → calls `combatService`
- `magicService.awardSkillXP(pawnId, treeId, amount, state)`
- `magicService.getActiveBonuses(pawnId, state)` → feeds into `ModifierSystem`

### Phase C — Research gating

- Arcane research tree added to `core/Research.ts`
- `researchService.isUnlocked(researchId)` gate in `magicService` for Node 3/5

---

## Open Questions

- [ ] Can pawns switch attunement elements by swapping items? (yes — intentional flexibility)
- [ ] Friendly-fire on AoE spells? (yes, Phase 2)
- [ ] Mana potions in item DB? (yes, EQUIPMENT-EXPANSION)
