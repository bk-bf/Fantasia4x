<!-- LOC cap: 280 (created: 2026-06-03) -->

# EQUIPMENT & ITEM DB EXPANSION

> **Related:** [ROADMAP](ROADMAP.md) · [COMBAT-SYSTEM](COMBAT-SYSTEM.md) · [MAGIC-SKILLS](MAGIC-SKILLS.md) · [PRODUCTION-CHAIN-EXPANSION](../archive/PRODUCTION-CHAIN-EXPANSION-2026-06-12.md) (✅ archived) · [game/DESIGN](../../game/DESIGN.md)

## Status

Not started. Can begin in parallel with COMBAT-SYSTEM; requires combat ability
types to exist before items can reference them.

---

## Goal

Expand `Items.ts` and the four equipment slots (weapon, armor, tool, accessory)
to cover three tiers of combat readiness. Each tier must be reachable via the
production chain — no equipment exists without a crafting prerequisite.

---

## Equipment Slot Model (existing, extended)

```typescript
interface EquipmentSlots {
  weapon: string | null; // grants combat abilities + weapon stats
  armor: string | null; // grants damage reduction + armor abilities
  tool: string | null; // work efficiency bonus (unchanged)
  accessory: string | null; // utility: rings, amulets, focus items
}
```

New field on `Item`:

```typescript
interface Item {
  // ... existing fields ...
  weaponStats?: {
    damMin: number;
    damMax: number;
    accuracy: number; // flat % modifier to hit chance
    range: number; // 0 = melee, >0 = ranged (tiles)
    tags: string[]; // 'sword' | 'axe' | 'bow' | 'dagger' | 'staff' | 'shield'
  };
  armorStats?: {
    reduction: number; // 0.0–0.5 flat damage reduction fraction
    tags: string[]; // 'light' | 'medium' | 'heavy'
  };
  combatAbilities: string[]; // CombatAbility ids granted while equipped
  magicAttunement?: MagicElement; // grants spells from Spells.ts if set
  durability: number; // 0–100; efficiency scales with durability
}
```

---

## Tier Breakdown

### Tier 0 — Improvised (Craft Spot or Maker's Bench)

Minimal combat viability. No research required.

| id            | Name        | Slot   | Tags   | Dam | Arm | Notes               |
| ------------- | ----------- | ------ | ------ | --- | --- | ------------------- |
| `flint_knife` | Flint Knife | weapon | dagger | 2–5 | —   | Already in Items.ts |
| `stone_spear` | Stone Spear | weapon | spear  | 4–8 | —   | reach: 2 tiles      |
| `bark_shield` | Bark Shield | armor  | shield | —   | 5%  | grants Shield Bash  |
| `hide_wrap`   | Hide Wrap   | armor  | light  | —   | 8%  | from animal hides   |

### Tier 1 — Primitive Forge (Stone Forge workshop)

Requires stone forge + stone_axe access chain.

| id               | Name           | Slot      | Tags   | Dam  | Arm | Notes                      |
| ---------------- | -------------- | --------- | ------ | ---- | --- | -------------------------- |
| `copper_sword`   | Copper Sword   | weapon    | sword  | 7–12 | —   | grants Quick Strike        |
| `copper_axe`     | Copper Axe     | weapon    | axe    | 8–14 | —   | grants Power Strike        |
| `hunting_bow`    | Hunting Bow    | weapon    | bow    | 5–9  | —   | range 6; grants Quick Shot |
| `leather_armor`  | Leather Armor  | armor     | light  | —    | 15% | –1 speed penalty           |
| `wooden_buckler` | Wooden Buckler | armor     | shield | —    | 10% | grants Shield Bash         |
| `lucky_charm`    | Lucky Charm    | accessory | —      | —    | —   | +5% dodge                  |
| `herbal_pouch`   | Herbal Pouch   | accessory | —      | —    | —   | auto-use herb on < 30% HP  |

### Tier 2 — Iron Smithy (Iron Forge workshop; requires PRODUCTION-CHAIN-EXPANSION)

| id                 | Name             | Slot      | Tags   | Dam   | Arm | Notes                                           |
| ------------------ | ---------------- | --------- | ------ | ----- | --- | ----------------------------------------------- |
| `iron_sword`       | Iron Sword       | weapon    | sword  | 12–18 | —   | grants Slash + Parry (Node 2)                   |
| `iron_axe`         | Iron Axe         | weapon    | axe    | 13–20 | —   | grants Cleave                                   |
| `iron_spear`       | Iron Spear       | weapon    | spear  | 10–16 | —   | reach 2; grants Impale                          |
| `longbow`          | Longbow          | weapon    | bow    | 8–14  | —   | range 10; grants Pinning Shot                   |
| `apprentice_staff` | Apprentice Staff | weapon    | staff  | 4–7   | —   | magicAttunement: Fire (or choice at craft time) |
| `iron_shield`      | Iron Shield      | armor     | shield | —     | 20% | grants Shield Wall (AoE block)                  |
| `chainmail`        | Chainmail        | armor     | medium | —     | 25% | –2 speed; immune to bleed                       |
| `mana_crystal`     | Mana Crystal     | accessory | —      | —     | —   | +20 maxMana, –5% spell cost                     |
| `combat_ring`      | Combat Ring      | accessory | —      | —     | —   | +1 AP per turn                                  |

### Tier 3 — Master Forge (deferred to Phase 2)

Steel weapons, enchanted armor, grimoires. Requires magic research unlocks.
Design deferred until Tiers 0–2 are implemented and balanced.

---

## Durability

Durability degrades with use (combat hit dealt or received = –1). At 0 the item
grants no bonus but is not destroyed — it requires repair.

```typescript
getEfficiencyMultiplier(item: Item): number {
  return 0.4 + (item.durability / 100) * 0.6; // 40%–100% efficiency
}
```

Repair: new `repair` work category at a Smithy; cost = fraction of original crafting materials.

---

## Implementation Plan

### Phase A — Type extension

- Extend `Item` interface in `core/types.ts` with `weaponStats`, `armorStats`, `combatAbilities`, `magicAttunement`, `durability`
- Add all Tier 0–2 definitions to `core/Items.ts`

### Phase B — ItemService extension

- `itemService.getGrantedAbilities(item)` — returns abilities for equipped item
- `itemService.applyDurabilityDecay(itemId, pawnId, state)`
- `itemService.getRepairCost(itemId)` — returns crafting materials fraction

### Phase C — ModifierSystem integration

- Equipment stats already flow through `ModifierSystem` via existing `calculatePawnAbilities`
- Extend to include `weaponStats` and `armorStats` contributions

---

## Open Questions

- [ ] Can a pawn dual-wield? (no — single weapon slot enforced)
- [ ] Do accessories stack? (one slot, no stacking)
- [ ] Magical item generation from lore item drops? (Phase 2)
