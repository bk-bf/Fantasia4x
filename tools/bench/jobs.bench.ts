import { bench, describe } from 'vitest';
import type { CraftingInProgress, DroppedItem, GameState } from '../../src/lib/game/core/types';
import { rng } from '../../src/lib/game/core/util/rng';
import * as haul from '../../src/lib/game/services/jobs/haul';
import * as harvest from '../../src/lib/game/services/jobs/harvest';
import * as plant from '../../src/lib/game/services/jobs/plant';
import { reservePendingOrders } from '../../src/lib/game/services/jobs/craft';
import { jobService } from '../../src/lib/game/services/JobService';
import { designationService } from '../../src/lib/game/services/DesignationService';
import { colony, generatedMap } from '../work-pins/scenarios';
import { ROLLING, warmSession } from './session';

function vessel(id: string, x: number, y: number, stored: boolean): DroppedItem {
  return {
    id,
    resourceId: 'flask',
    x,
    y,
    quantity: 1,
    ...(stored ? { stored: true } : {}),
    instance: { instanceId: `i-${id}`, itemId: 'flask', durability: 10, filter: [] }
  } as DroppedItem;
}

function fullContainerBudget(side: number): GameState {
  const zoneTiles: GameState['zoneTiles'] = {};
  const designationZoneId: GameState['designationZoneId'] = {};
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      zoneTiles[`${x},${y}`] = ['stockpile'];
      designationZoneId[`${x},${y}`] = { stockpile: 'sp' };
    }
  return {
    turn: 5,
    jobs: [],
    buildings: [],
    zoneTiles,
    designationZoneId,
    zoneInstances: [
      {
        id: 'sp',
        type: 'stockpile',
        label: 'sp',
        filter: { allowedCategories: [], blockedItems: [] },
        containerBudget: 2
      }
    ],
    droppedItems: [
      vessel('s0', side - 1, side - 1, true),
      vessel('s1', side - 1, side - 2, true),
      vessel('loose', 0, side + 2, false)
    ]
  } as unknown as GameState;
}

function crowdedStockpile(base: GameState): GameState {
  const zoneTiles: GameState['zoneTiles'] = {};
  for (let i = 0; i < 300; i++) zoneTiles[`${i % 40},${Math.floor(i / 40)}`] = ['stockpile'];
  const template = base.buildings[0];
  const buildings = Array.from({ length: 600 }, (_, i) => ({
    ...template,
    id: `w${i}`,
    x: i % 40,
    y: 39 - (Math.floor(i / 40) % 40),
    status: 'complete' as const
  }));
  const droppedItems = Array.from({ length: 150 }, (_, i) => ({
    id: `d${i}`,
    resourceId: 'malachite',
    x: i % 40,
    y: 20 + (i % 10),
    quantity: 2,
    ...(i % 3 === 0 ? { stored: true } : {})
  }));
  return { ...base, zoneTiles, buildings, droppedItems };
}

function unsuppliedOrders(drops: number, orders: number): GameState {
  const droppedItems = Array.from({ length: drops }, (_, i) => ({
    id: `d${i}`,
    resourceId: i % 3 ? 'branch' : 'stone',
    x: i % 50,
    y: Math.floor(i / 50),
    quantity: 5,
    stored: true
  }));
  const craftingQueue = Array.from({ length: orders }, (_, k) => ({
    id: `o${k}`,
    item: { id: 'copper_bar' },
    inputs: { branch: 2, molten_copper: 1 },
    pending: true
  }));
  return {
    turn: 1,
    droppedItems,
    craftingQueue: craftingQueue as unknown as CraftingInProgress[],
    buildings: []
  } as unknown as GameState;
}

const colonyState = (await warmSession(colony, 300)).getState();

const harvestSession = await warmSession(generatedMap, 100);
{
  const { worldMap } = harvestSession.getState();
  const tiles: [number, number][] = [];
  for (let y = 0; y < worldMap.length; y++)
    for (let x = 0; x < worldMap[0].length; x++) tiles.push([x, y]);
  for (const type of ['woodcut', 'forage', 'dig'])
    harvestSession.command({ type: 'designateTiles', payload: { tiles, type } } as never);
  harvestSession.tick(60);
}
const harvestState = harvestSession.getState();

const poolState = (() => {
  const gs = harvestSession.getState();
  const right = gs.worldMap[0].length - 1;
  const bottom = gs.worldMap.length - 1;
  return jobService.generateJobs(
    designationService.designateRect(0, 0, right, bottom, 'woodcut', gs)
  );
})();

const budgetState = fullContainerBudget(30);
const crowdedState = crowdedStockpile(colonyState);
const pendingState = unsuppliedOrders(1000, 5);

describe('jobs', () => {
  bench('haul:full-budget', () => void haul.generate([], budgetState), ROLLING);
  bench('haul:crowded', () => void haul.generate([], crowdedState), ROLLING);
  bench('haul:colony', () => void haul.generate([...colonyState.jobs], colonyState), ROLLING);
  bench(
    'harvest:designated',
    () => {
      rng.reseed(harvestState.seed);
      harvest.generate([...harvestState.jobs], harvestState);
    },
    ROLLING
  );
  bench(
    'plant:colony',
    () => {
      rng.reseed(colonyState.seed);
      plant.generate([...colonyState.jobs], colonyState);
    },
    ROLLING
  );
  bench(
    'available:woodcut',
    () => void jobService.getAvailableJobs(poolState.pawns[0], poolState),
    ROLLING
  );
  bench('craft:unsupplied', () => void reservePendingOrders(pendingState), ROLLING);
});
