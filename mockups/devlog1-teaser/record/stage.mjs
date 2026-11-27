import { readSave, TICKS_PER_DAY, step, log } from './session.mjs';

export const SITE = { x: 247, y: 130 };

export function stagedSave({ hour = 9, weather, pawnSpots, mobs = [] } = {}) {
  const save = readSave();
  const d = save.dynamic;
  d.turn = TICKS_PER_DAY * 40 + Math.round((hour / 24) * TICKS_PER_DAY);
  d.weather = weather ?? {
    type: 'clear', intensity: 0, precip: 'none', windLevel: 'breezy',
    turnsRemaining: 999999, windTurns: 999999, wind: 0.35, windDir: 2, phase: 'steady'
  };
  const spots = pawnSpots ?? [[246, 131], [248, 129], [245, 133], [249, 132], [247, 127]];
  d.pawns.forEach((p, i) => {
    const [x, y] = spots[i % spots.length];
    p.position = { x, y };
    p.path = [];
    p.pathIndex = 0;
    p.isMoving = false;
    p.hasReachedDestination = true;
    p.activeJob = undefined;
    p.needs = { ...p.needs, hunger: 10, fatigue: 10, sleep: 0, thirst: 100, wetness: 0, hygiene: 95, relaxation: 95, comfort: 95, coldExposure: 0, heatExposure: 0 };
    p.conditions = (p.conditions ?? []).filter((c) => !['hypothermia', 'dehydration', 'exhausted', 'starving'].includes(c.id));
    p.transientConditions = [];
  });
  for (const m of mobs) {
    const mob = d.mobs.find((q) => q.id === m.id) ?? d.mobs.filter((q) => q.creatureId === m.creatureId)[m.nth ?? 0];
    if (!mob) continue;
    mob.x = m.x;
    mob.y = m.y;
    mob.path = [];
    mob.pathIndex = 0;
  }
  return save;
}

export async function cmd(page, list) {
  await page.evaluate(async (list) => {
    const { gameState } = await import('/src/lib/stores/gameState.ts');
    for (const [type, payload] of list) gameState.command({ type, payload, save: false });
  }, list);
}

export async function stageColony(page, { blueprints = true, woodcut = true } = {}) {
  await cmd(page, [
    ['devUnlockResearch', { all: true }],
    ['devSetToolTier', { tier: 3 }],
    ['devInfiniteFuel', { on: true }],
    ['devToggleNeed', { need: 'hunger', off: true }],
    ['devToggleNeed', { need: 'fatigue', off: true }],
    ['devToggleNeed', { need: 'thirst', off: true }],
    ['devToggleNeed', { need: 'hygiene', off: true }],
    ['devToggleNeed', { need: 'relaxation', off: true }],
    ['devToggleNeed', { need: 'comfort', off: true }],
    ['devToggleNeed', { need: 'wetness', off: true }],
    ['devSpawnBuildingAt', { buildingId: 'campfire', x: 247, y: 130 }],
    ['devSpawnBuildingAt', { buildingId: 'makers_bench', x: 244, y: 128 }],
    ['devSpawnBuildingAt', { buildingId: 'chopping_block', x: 250, y: 128 }],
    ['devSpawnBuildingAt', { buildingId: 'drying_rack', x: 242, y: 131 }],
    ['devSpawnBuildingAt', { buildingId: 'well', x: 252, y: 133 }],
    ['devSpawnBuildingAt', { buildingId: 'sawtable', x: 252, y: 128 }],
    ['createZoneInstance', { type: 'stockpile', label: 'Yard', id: 'zone-yard' }],
    ['designateRect', { x1: 244, y1: 134, x2: 249, y2: 136, type: 'stockpile', instanceId: 'zone-yard' }],
    ['devSpawnItem', { itemId: 'branch', amount: 60, x: 244, y: 134 }],
    ['devSpawnItem', { itemId: 'cordage', amount: 60, x: 245, y: 134 }],
    ['devSpawnItem', { itemId: 'granite', amount: 40, x: 246, y: 134 }],
    ['devSpawnItem', { itemId: 'blue_clay', amount: 30, x: 247, y: 134 }],
    ['devSpawnItem', { itemId: 'oak_log', amount: 30, x: 248, y: 134 }],
    ['devSpawnItem', { itemId: 'plant_fiber', amount: 30, x: 249, y: 134 }],
    ['devSpawnItem', { itemId: 'stone_axe', amount: 3, x: 244, y: 135 }],
    ['devSpawnItem', { itemId: 'copper_axe', amount: 2, x: 245, y: 135 }],
    ['devSpawnItem', { itemId: 'stone_hammer', amount: 3, x: 246, y: 135 }],
    ['devSpawnItem', { itemId: 'flint_knife', amount: 2, x: 247, y: 135 }],
    ['devSpawnItem', { itemId: 'stone_spear', amount: 3, x: 248, y: 135 }],
    ['devSpawnItem', { itemId: 'self_bow', amount: 2, x: 249, y: 135 }]
  ]);
  if (woodcut) await cmd(page, [['designateRect', { x1: 226, y1: 114, x2: 238, y2: 124, type: 'woodcut' }]]);
  if (blueprints)
    await cmd(page, [
      ['placeBuilding', { bid: 'hide_rack', x: 240, y: 128 }],
      ['placeBuilding', { bid: 'smoking_rack', x: 254, y: 130 }],
      ['placeBuilding', { bid: 'pottery_kiln', x: 245, y: 125 }],
      ['placeBuilding', { bid: 'drying_rack', x: 241, y: 134 }]
    ]);
  await page.evaluate(async () => {
    const { gameState } = await import('/src/lib/stores/gameState.ts');
    gameState.unpauseGame();
  });
  for (let i = 0; i < 4; i++) await step(page, 1);
  log('colony staged');
}

export async function warm(page, ticks, chunk = 120) {
  for (let t = 0; t < ticks; t += chunk) await step(page, chunk);
}
