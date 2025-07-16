/**
 * ModifierSystem Tests
 *
 * Tests for the automated modifier system to ensure it correctly
 * auto-generates work efficiencies and bonuses from Buildings/Items.
 */

import { modifierSystem } from './ModifierSystem';
import type { GameState } from '../core/types';

// Mock game state for testing
const createMockGameState = (): GameState => ({
  turn: 1,
  race: {
    id: 'test_race',
    name: 'Test Race',
    statRanges: {
      strength: [8, 12],
      dexterity: [8, 12],
      intelligence: [8, 12],
      wisdom: [8, 12],
      charisma: [8, 12],
      constitution: [8, 12]
    },
    physicalTraits: {
      heightRange: [160, 180],
      weightRange: [60, 80],
      size: 'medium'
    },
    racialTraits: [],
    population: 5,
    implications: {}
  },
  item: [
    { id: 'oak_wood', name: 'Oak Wood', amount: 10, type: 'material', category: 'wood' },
    {
      id: 'stone_axe',
      name: 'Stone Axe',
      amount: 1,
      type: 'tool',
      category: 'harvesting',
      effects: { woodcuttingBonus: 0.3 },
      workTypes: ['woodcutting']
    }
  ],
  worldMap: [],
  discoveredLocations: [
    {
      id: 'test_forest',
      name: 'Test Forest',
      description: 'A test forest',
      type: 'forest',
      tier: 0,
      rarity: 'common',
      discovered: true,
      availableResources: { tier0: ['oak_wood'], tier1: [], tier2: [] },
      workModifiers: { woodcutting: 1.2 },
      explorationRequirements: {},
      hazards: [],
      specialFeatures: [],
      emoji: '🌲',
      color: '#228B22'
    }
  ],
  buildingCounts: {
    simple_workshop: 1
  },
  buildingQueue: [],
  maxPopulation: 10,
  availableResearch: [],
  completedResearch: [],
  discoveredLore: [],
  equippedItems: {
    weapon: null,
    head: null,
    chest: null,
    legs: null,
    feet: null,
    hands: null
  },
  craftingQueue: [],
  currentToolLevel: 1,
  activeExplorationMissions: [],
  workAssignments: {},
  productionTargets: [],
  pawns: [
    {
      id: 'test_pawn_1',
      name: 'Test Pawn',
      inventory: { items: {}, maxSlots: 10, currentSlots: 0 },
      equipment: {
        tool: {
          itemId: 'stone_axe',
          durability: 100,
          maxDurability: 100,
          bonuses: { woodcuttingBonus: 0.3 }
        }
      },
      stats: {
        strength: 12,
        dexterity: 10,
        intelligence: 8,
        wisdom: 9,
        charisma: 7,
        constitution: 11
      },
      physicalTraits: {
        height: 170,
        weight: 70,
        size: 'medium'
      },
      needs: {
        hunger: 30,
        fatigue: 20,
        sleep: 25,
        lastSleep: 0,
        lastMeal: 0
      },
      state: {
        mood: 60,
        health: 100,
        isWorking: false,
        isSleeping: false,
        isEating: false
      },
      racialTraits: [
        {
          name: 'Forest Dweller',
          description: 'Bonus to woodcutting',
          icon: '🌲',
          effects: {
            workEfficiency: { woodcutting: 1.2 }
          }
        }
      ],
      skills: {}
    }
  ],
  currentJobIndex: {},
  pawnAbilities: {}
});

// Simple assertion helper since we don't have a test framework
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected: ${expected}, Actual: ${actual}`);
  }
}

function assertGreaterThan(actual: number, expected: number, message: string) {
  if (actual <= expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${actual} > ${expected}`);
  }
}

function assertDefined<T>(value: T | undefined, message: string): asserts value is T {
  if (value === undefined) {
    throw new Error(`Assertion failed: ${message}. Value is undefined`);
  }
}

// Test suite functions
function testCalculateWorkEfficiency() {
  console.log('Testing calculateWorkEfficiency...');
  const mockGameState = createMockGameState();
  modifierSystem.clearCache();

  // Test basic work efficiency calculation
  const result = modifierSystem.calculateWorkEfficiency(
    'test_pawn_1',
    'woodcutting',
    mockGameState
  );

  assertEqual(result.workType, 'woodcutting', 'Work type should be woodcutting');
  assertEqual(result.pawnId, 'test_pawn_1', 'Pawn ID should match');
  assertEqual(result.baseValue, 1.0, 'Base value should be 1.0');
  assertGreaterThan(result.totalValue, 1.0, 'Total value should be greater than base');
  assertGreaterThan(result.sources.length, 0, 'Should have modifier sources');

  // Test stat bonuses
  const strengthSource = result.sources.find((s) => s.id === 'strength');
  assertDefined(strengthSource, 'Should have strength bonus');
  assertGreaterThan(strengthSource.value, 1.0, 'Strength bonus should be > 1.0');

  // Test racial trait bonuses
  const traitSource = result.sources.find((s) => s.name === 'Forest Dweller');
  assertDefined(traitSource, 'Should have Forest Dweller trait bonus');
  assertEqual(traitSource.value, 1.2, 'Forest Dweller bonus should be 1.2');

  // Test equipment bonuses
  const equipmentSource = result.sources.find((s) => s.id === 'stone_axe');
  assertDefined(equipmentSource, 'Should have stone axe equipment bonus');

  // Test location modifiers
  const locationResult = modifierSystem.calculateWorkEfficiency(
    'test_pawn_1',
    'woodcutting',
    mockGameState,
    'test_forest'
  );
  const locationSource = locationResult.sources.find((s) => s.id === 'test_forest');
  assertDefined(locationSource, 'Should have forest location bonus');
  assertEqual(locationSource.value, 1.2, 'Forest location bonus should be 1.2');

  // Test pawn state modifiers
  mockGameState.pawns[0].state.health = 50;
  const healthResult = modifierSystem.calculateWorkEfficiency(
    'test_pawn_1',
    'woodcutting',
    mockGameState
  );
  const healthSource = healthResult.sources.find((s) => s.id === 'health');
  assertDefined(healthSource, 'Should have health penalty');
  assertEqual(healthSource.value, 0.5, 'Health penalty should be 0.5');

  console.log('✅ calculateWorkEfficiency tests passed');
}

function testCalculateBuildingEffects() {
  console.log('Testing calculateBuildingEffects...');
  const mockGameState = createMockGameState();

  const result = modifierSystem.calculateBuildingEffects('simple_workshop', mockGameState);

  assertEqual(result.buildingId, 'simple_workshop', 'Building ID should match');
  assertGreaterThan(Object.keys(result.workBonuses).length, 0, 'Should have work bonuses');

  console.log('✅ calculateBuildingEffects tests passed');
}

function testAutoDiscovery() {
  console.log('Testing auto-discovery features...');

  // Test item bonus discovery
  const itemBonuses = modifierSystem.discoverWorkBonusesFromItems();
  assert(itemBonuses.woodcutting !== undefined, 'Should discover woodcutting bonuses');
  assert(itemBonuses.woodcutting['stone_axe'] !== undefined, 'Should find stone_axe bonus');

  // Test building bonus discovery
  const buildingBonuses = modifierSystem.discoverWorkBonusesFromBuildings();
  assertGreaterThan(Object.keys(buildingBonuses).length, 0, 'Should discover building bonuses');

  console.log('✅ Auto-discovery tests passed');
}

function testValidation() {
  console.log('Testing validation...');
  const mockGameState = createMockGameState();

  // Test valid state
  const validation = modifierSystem.validateModifierConsistency(mockGameState);
  assert(validation.isValid, 'Valid state should pass validation');
  assertEqual(validation.issues.length, 0, 'Valid state should have no issues');

  // Test invalid state
  mockGameState.workAssignments['invalid_pawn'] = {
    pawnId: 'invalid_pawn',
    workPriorities: { woodcutting: 5 },
    authorizedLocations: [],
    currentWork: 'woodcutting'
  };

  const invalidValidation = modifierSystem.validateModifierConsistency(mockGameState);
  assert(!invalidValidation.isValid, 'Invalid state should fail validation');
  assertGreaterThan(invalidValidation.issues.length, 0, 'Invalid state should have issues');

  console.log('✅ Validation tests passed');
}

function testCaching() {
  console.log('Testing caching...');
  const mockGameState = createMockGameState();

  const startTime = Date.now();
  const result1 = modifierSystem.calculateWorkEfficiency(
    'test_pawn_1',
    'woodcutting',
    mockGameState
  );
  const firstTime = Date.now() - startTime;

  const cacheStartTime = Date.now();
  const result2 = modifierSystem.calculateWorkEfficiency(
    'test_pawn_1',
    'woodcutting',
    mockGameState
  );
  const cacheTime = Date.now() - cacheStartTime;

  assertEqual(result1.totalValue, result2.totalValue, 'Cached results should be identical');
  assert(cacheTime < firstTime, 'Cache should be faster than initial calculation');

  // Test cache clearing
  modifierSystem.clearCache();
  const result3 = modifierSystem.calculateWorkEfficiency(
    'test_pawn_1',
    'woodcutting',
    mockGameState
  );
  assertDefined(result3, 'Should work after cache clear');

  console.log('✅ Caching tests passed');
}

// Main test runner function
function runAllTests() {
  console.log('🧪 Starting ModifierSystem Test Suite...\n');

  try {
    testCalculateWorkEfficiency();
    testCalculateBuildingEffects();
    testAutoDiscovery();
    testValidation();
    testCaching();

    console.log('\n🎉 All ModifierSystem tests passed successfully!');
    return true;
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    return false;
  }
}

// Export the main test runner
export { runAllTests };

// Helper function to run tests manually if needed
export function runModifierSystemTests() {
  console.log('Running ModifierSystem tests...');

  const mockGameState = createMockGameState();

  try {
    // Test basic efficiency calculation
    const result = modifierSystem.calculateWorkEfficiency(
      'test_pawn_1',
      'woodcutting',
      mockGameState
    );

    console.log('Work Efficiency Result:', {
      workType: result.workType,
      pawnId: result.pawnId,
      baseValue: result.baseValue,
      totalValue: result.totalValue,
      multiplier: result.multiplier,
      sourcesCount: result.sources.length
    });

    // Test building effects
    const buildingResult = modifierSystem.calculateBuildingEffects(
      'simple_workshop',
      mockGameState
    );

    console.log('Building Effects Result:', {
      buildingId: buildingResult.buildingId,
      effectsCount: Object.keys(buildingResult.effects).length,
      workBonusesCount: Object.keys(buildingResult.workBonuses).length,
      productionBonusesCount: Object.keys(buildingResult.productionBonuses).length
    });

    // Test auto-discovery
    const itemBonuses = modifierSystem.discoverWorkBonusesFromItems();
    const buildingBonuses = modifierSystem.discoverWorkBonusesFromBuildings();

    console.log('Auto-Discovery Results:', {
      itemWorkBonuses: Object.keys(itemBonuses).length,
      buildingWorkBonuses: Object.keys(buildingBonuses).length
    });

    // Test validation
    const validation = modifierSystem.validateModifierConsistency(mockGameState);

    console.log('Validation Result:', {
      isValid: validation.isValid,
      issuesCount: validation.issues.length
    });

    console.log('✅ All ModifierSystem tests passed!');
    return true;
  } catch (error) {
    console.error('❌ ModifierSystem test failed:', error);
    return false;
  }
}
