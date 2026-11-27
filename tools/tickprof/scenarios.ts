import { buildScenario, type ScenarioSpec } from '../../src/lib/game/headless/Scenario';
import { getScenarioPreset } from '../../src/lib/game/headless/scenarios/presets';
import { initialState, devSave, placeCreatures, holdCreatureCount } from '../work-pins/scenarios';
import type { GameState } from '../../src/lib/game/core/types';
import { applySimCommand } from '../../src/lib/game/sim/commands';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fromSnapshot } from '../../src/lib/game/headless/snapshot';
import { ensureWorkSkills } from '../../src/lib/game/core/rules/body/workExperience';
import { ensureAptitudes } from '../../src/lib/game/core/rules/body/aptitudes';

function save(): GameState {
  const file = process.env.PROF_SAVE;
  if (!file) throw new Error('PROF_SCENARIO=save needs PROF_SAVE=<file.json.gz>, a { dynamic, world } snapshot');
  const st = fromSnapshot(JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')));
  ensureWorkSkills(st.pawns ?? []);
  ensureAptitudes(st.pawns ?? []);
  return st;
}

function putToWork(state: GameState, radius: number, crafts: number): GameState {
  const ps = state.pawns.flatMap((p) => (p.position ? [p.position] : []));
  const cx = Math.round(ps.reduce((a, p) => a + p.x, 0) / ps.length);
  const cy = Math.round(ps.reduce((a, p) => a + p.y, 0) / ps.length);
  const w = state.worldMap[0].length;
  const h = state.worldMap.length;
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi - 1, v));
  let s = state;
  const cmd = (type: string, payload: unknown) => (s = applySimCommand(s, { type, payload } as never));
  cmd('designateRect', { x1: clamp(cx - 12, w), y1: clamp(cy - 12, h), x2: clamp(cx + 12, w), y2: clamp(cy + 12, h), type: 'stockpile' });
  for (const type of ['woodcut', 'harvest', 'mine', 'forage'])
    cmd('designateRect', { x1: clamp(cx - radius, w), y1: clamp(cy - radius, h), x2: clamp(cx + radius, w), y2: clamp(cy + radius, h), type });
  for (const itemId of ['iron_axe', 'oak_plank', 'bread'])
    cmd('craftItem', { itemId, quantity: crafts });
  return s;
}

const fullTech = getScenarioPreset('full-tech')!.spec;

function colony(w: number, pawns: number): ScenarioSpec {
  return {
    seed: 4242,
    map: { w, h: w, preset: 'generated', generator: 'classic' },
    pawns: [{ count: pawns, skillLevel: 20 }],
    researchMaxTier: 99,
    toolTier: 3,
    workReady: true,
    infiniteFuel: true,
    buildings: fullTech.buildings,
    items: Object.fromEntries(Object.entries(fullTech.items ?? {}).map(([k, v]) => [k, (v as number) * Math.ceil(pawns / 12)])),
    seedEntities: true,
    wholeMapStockpile: false
  } as ScenarioSpec;
}

function stress(): GameState {
  const env = process.env;
  const w = Number(env.PROF_MAP ?? 750);
  const pawns = Number(env.PROF_PAWNS ?? 20);
  const mobs = Number(env.PROF_MOBS ?? 1200);
  const base = env.PROF_BASE === '1';
  const reps = base ? 3 : 1;
  const buildings = [
    ...Array.from({ length: reps }, () => fullTech.buildings ?? []).flat(),
    ...(base ? ['chopping_block', 'sawtable', 'charcoal_pit', 'masons_bench', 'pottery_kiln', 'hide_rack', 'ropewalk', 'curriers_bench', 'smoking_rack', 'carpenter_bench'].map((id) => ({ id })) : []),
    ...(base ? Array.from({ length: Math.ceil(pawns / 2) }, () => ({ id: 'hay_bed' })) : [])
  ];
  const items = Object.fromEntries(Object.entries(fullTech.items ?? {}).map(([k, v]) => [k, (v as number) * Math.ceil(pawns / 12) * (base ? 2 : 1)]));
  if (base) Object.assign(items, { branch: (items.branch ?? 0) + 2000, log: 600, charcoal: 400, oak_plank: (items.oak_plank ?? 0) + 800 });
  const spec = {
    seed: 4242,
    map: { w, h: w, preset: 'generated' },
    pawns: [{ count: pawns, skillLevel: 20 }],
    researchMaxTier: 99,
    toolTier: 3,
    workReady: true,
    infiniteFuel: !base,
    buildings,
    items,
    seedEntities: false,
    wholeMapStockpile: false
  } as ScenarioSpec;
  let st = buildScenario(spec);
  if (mobs > 0) st = placeCreatures(st, mobs);
  holdCreatureCount();
  const radius = Math.min(85, Math.round(w / 9));
  st = putToWork(st, radius, base ? 20 : Math.max(5, Math.round(pawns / 4)));
  if (base) {
    const ps = st.pawns.flatMap((p) => (p.position ? [p.position] : []));
    const cx = Math.round(ps.reduce((a, p) => a + p.x, 0) / ps.length);
    const cy = Math.round(ps.reduce((a, p) => a + p.y, 0) / ps.length);
    const ring: [number, number][] = [];
    for (let r = 22; r <= 24; r += 2)
      for (let d = -r; d <= r; d++) ring.push([cx + d, cy - r], [cx + d, cy + r], [cx - r, cy + d], [cx + r, cy + d]);
    const floor: [number, number][] = [];
    for (let dy = 14; dy < 30; dy++) for (let dx = -8; dx < 8; dx++) floor.push([cx + dx, cy + dy]);
    const before = (st.buildings ?? []).length;
    st = applySimCommand(st, { type: 'placeBuildings', payload: { bid: 'branch_wall', tiles: ring } } as never);
    st = applySimCommand(st, { type: 'placeBuildings', payload: { bid: 'wooden_floor', tiles: floor } } as never);
    for (const itemId of ['charcoal', 'iron_bar', 'bread', 'oak_plank', 'leather', 'rope', 'copper_bar', 'bronze_bar', 'limestone_block', 'salted_meat', 'fired_brick', 'green_firewood', 'pine_plank', 'beam'])
      st = applySimCommand(st, { type: 'craftItem', payload: { itemId, quantity: 20 } } as never);
    console.log(`stress base: blueprints ${(st.buildings ?? []).length - before} of ${ring.length + floor.length}, buildings ${(st.buildings ?? []).length}, crafts ${(st.craftingQueue ?? []).length}`);
  }
  console.log(`stress map ${w} pawns ${st.pawns.length} mobs ${(st.mobs ?? []).length} buildings ${(st.buildings ?? []).length} designations ${Object.keys(st.designations ?? {}).length} crafts ${(st.craftingQueue ?? []).length}`);
  return st;
}

export const SCENARIOS: Record<string, () => GameState> = {
  save,
  stress,
  'dev-save': () => initialState(devSave),
  'large-wilderness': () => buildScenario(getScenarioPreset('large-wilderness')!.spec),
  'colony-750-40p': () => putToWork(buildScenario(colony(750, 40)), 60, 10),
  'colony-1060-80p': () => putToWork(buildScenario(colony(1060, 80)), 85, 20),
  'idle-colony-750-40p': () => buildScenario(colony(750, 40))
};
