import { describe, it, expect } from 'vitest';
import { CREATURES, getCreatureById } from './Creatures';
import { getLootPool, validateLootItemIds } from './LootPools';
import { itemService } from '../services/ItemService';
import { isBodyPlan } from './BodyParts';
import { generateBossName } from './BossNames';
import { makeMob, TIER_SPAWN_WEIGHT, pickWeightedByTier } from '../services/entity/entitySpawning';

// CREATURE-COMBAT-OVERHAUL §2e ladder-integrity guard: every creature's data references resolve, the
// ladder metadata is coherent, and the tier spawn weights keep T5 bosses out of ambient spawning.
// Catches the drift class where a variant names a weapon/carcass/pool/base that doesn't exist.

describe('§2e variant-ladder data integrity', () => {
  it('every natural weapon resolves to a natural_weapon item with weaponProperties', () => {
    for (const c of CREATURES) {
      for (const w of c.naturalWeapons) {
        const item = itemService.getItemById(w);
        expect(item?.weaponProperties, `${c.id} → ${w}`).toBeTruthy();
      }
    }
  });

  it('every carcassItemId resolves to a carcass item', () => {
    for (const c of CREATURES) {
      if (!c.carcassItemId) continue;
      const item = itemService.getItemById(c.carcassItemId);
      expect(item?.category, `${c.id} → ${c.carcassItemId}`).toBe('carcass');
    }
  });

  it('every lootPool resolves, and every pool item id resolves', () => {
    for (const c of CREATURES) {
      if (!c.lootPool) continue;
      expect(getLootPool(c.lootPool), `${c.id} → ${c.lootPool}`).toBeTruthy();
    }
    expect(() => validateLootItemIds((id) => itemService.getItemById(id) != null)).not.toThrow();
  });

  it('ladder metadata is coherent: tier 1–5, species set, variantOf resolves to a real base', () => {
    for (const c of CREATURES) {
      if (c.tier != null) {
        expect(c.tier, c.id).toBeGreaterThanOrEqual(1);
        expect(c.tier, c.id).toBeLessThanOrEqual(5);
        expect(c.species, `${c.id} has tier but no species`).toBeTruthy();
      }
      if (c.variantOf) {
        const base = getCreatureById(c.variantOf);
        expect(base, `${c.id} → variantOf ${c.variantOf}`).toBeTruthy();
        expect(base!.species, `${c.id}'s base shares its species`).toBe(c.species);
      }
      if (c.statRanges) {
        for (const [k, r] of Object.entries(c.statRanges)) {
          expect(r![0], `${c.id} ${k} min ≤ max`).toBeLessThanOrEqual(r![1]);
        }
      }
      if (c.naturalArmorRange) {
        expect(c.naturalArmorRange[0], c.id).toBeLessThanOrEqual(c.naturalArmorRange[1]);
      }
      expect(isBodyPlan(c.limbMap ?? 'humanoid'), `${c.id} limbMap`).toBe(true);
    }
  });

  it('the six specced species carry full 5-tier ladders (12 variants + base)', () => {
    for (const species of ['wolf', 'bear', 'boar', 'goblin', 'orc', 'thornwood_spider']) {
      const ladder = CREATURES.filter((c) => c.species === species);
      const tiers = new Set(ladder.map((c) => c.tier));
      expect([...tiers].sort(), species).toEqual([1, 2, 3, 4, 5]);
      expect(
        ladder.filter((c) => c.tier === 5),
        `${species} has exactly one boss`
      ).toHaveLength(1);
      expect(ladder.length, `${species} ladder size`).toBeGreaterThanOrEqual(12);
    }
  });

  it('§2e T5 bosses roll a UNIQUE procedural legend name; the def keeps a generic name', () => {
    const n = generateBossName('wolf');
    expect(n).toMatch(/^.+, the .+ .+$/); // "<personal>, the <adj> <noun>"
    const samples = new Set(Array.from({ length: 200 }, () => generateBossName('wolf')));
    expect(samples.size).toBeGreaterThan(20); // distinct across rolls

    const bossDef = CREATURES.find((c) => c.tier === 5 && c.species === 'wolf')!;
    expect(bossDef.name).toBe('Great Wolf'); // renamed off the old hand-authored "Old Fang…"
    const boss = makeMob(bossDef, 0, 0, 0);
    expect(boss.name, 'boss carries a per-spawn override').toBeTruthy();
    expect(boss.name).not.toBe(bossDef.name);
    const wolf = makeMob(getCreatureById('wolf')!, 0, 0, 0);
    expect(wolf.name).toBeUndefined(); // a non-boss reads the def name
  });

  it('tier spawn weights: T5 bosses NEVER come from a weighted ambient pick (escalation-only)', () => {
    expect(TIER_SPAWN_WEIGHT[5]).toBe(0);
    const bosses = CREATURES.filter((c) => c.tier === 5);
    expect(bosses.length).toBeGreaterThanOrEqual(6);
    // A pool of only bosses yields nothing; a mixed pool never returns a boss.
    expect(pickWeightedByTier(bosses)).toBeUndefined();
    const mixed = CREATURES.filter((c) => c.species === 'wolf');
    for (let i = 0; i < 200; i++) {
      const picked = pickWeightedByTier(mixed);
      expect(picked?.tier, picked?.id).not.toBe(5);
    }
  });
});
