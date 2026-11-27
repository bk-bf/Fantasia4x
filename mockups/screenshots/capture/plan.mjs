import { HAMLET, HOLD } from './presets.mjs';

const T = { dawn: 0.3, morning: 0.38, noon: 0.5, golden: 0.74, dusk: 0.82, night: 0.0, midnight: 0.95 };
const Z = { 4: 'vista', 8: 'vista', 16: 'wide', 24: 'mid', 32: 'near', 48: 'close', 64: 'macro' };

const s = (biome, subject, at, tile, time, extra = {}) => ({ biome, subject, at, tile, time, tod: T[time], zoom: Z[tile], ...extra });

const fixtureShots = [
  s('forest', 'heartwood', { res: 'heartwood_grove', k: 0 }, 48, 'noon'),
  s('forest', 'heartwood', { res: 'heartwood_grove', k: 0 }, 48, 'dusk'),
  s('forest', 'heartwood', { res: 'heartwood_grove', k: 1 }, 32, 'night'),
  s('forest', 'heartwood', { res: 'heartwood_grove', k: 2 }, 64, 'dawn'),
  s('forest', 'emberwood', { res: 'emberwood_grove', k: 0 }, 48, 'noon'),
  s('forest', 'emberwood', { res: 'emberwood_grove', k: 0 }, 48, 'night', { hud: 'also' }),
  s('forest', 'emberwood', { res: 'emberwood_grove', k: 1 }, 32, 'dusk'),
  s('forest', 'emberwood', { res: 'emberwood_grove', k: 2 }, 64, 'midnight'),
  s('forest', 'moonwood', { res: 'moonwood_grove', k: 0 }, 48, 'noon'),
  s('forest', 'moonwood', { res: 'moonwood_grove', k: 1 }, 48, 'night'),
  s('forest', 'witchwood', { res: 'witchwood_grove', k: 0 }, 48, 'dusk'),
  s('forest', 'witchwood-fog', { res: 'witchwood_grove', k: 1 }, 32, 'morning', { weather: 'fog' }),
  s('forest', 'ironwood', { res: 'ironwood_grove', k: 0 }, 48, 'noon'),
  s('forest', 'soulwood', { res: 'soulwood_grove', k: 0 }, 48, 'night'),
  s('forest', 'soulwood', { res: 'soulwood_grove', k: 1 }, 32, 'dusk'),
  s('forest', 'bonewood-snag', { res: 'bonewood_snag', k: 0 }, 48, 'golden'),
  s('forest', 'glowcaps', { res: 'glowcap', k: 0 }, 64, 'night'),
  s('mountains', 'mana-vent', { res: 'mana_crystal_vent', k: 0 }, 48, 'night'),
  s('mountains', 'amethyst', { res: 'amethyst_node', k: 0 }, 48, 'midnight'),
  s('grassland', 'emberbloom', { res: 'emberbloom', k: 0 }, 48, 'night'),
  s('forest', 'oak-stand', { res: 'oak_tree', k: 0 }, 64, 'noon', { season: 'summer' }),
  s('forest', 'pines', { res: 'pine_tree', k: 0 }, 48, 'dawn'),
  s('shore', 'willows', { res: 'willow_tree', k: 0 }, 48, 'dusk'),
  s('grassland', 'apple-trees', { res: 'apple_tree', k: 0 }, 48, 'noon', { season: 'autumn' }),
  s('forest', 'birches', { res: 'birch_tree', k: 0 }, 32, 'golden', { season: 'autumn' }),
  s('forest', 'heartwood', { res: 'heartwood_grove', k: 3 }, 48, 'noon', {}),
  s('forest', 'wolf-den', { res: 'wolf_den', k: 0 }, 48, 'dusk'),
  s('mountains', 'goblin-warren', { res: 'goblin_warren', k: 0 }, 48, 'noon'),
  s('mountains', 'griffon-aerie', { res: 'griffon_aerie', k: 0 }, 48, 'morning'),
  s('bog', 'swamp-nest', { res: 'swamp_nest', k: 0 }, 48, 'morning', { weather: 'fog' }),
  s('grassland', 'first-camp', { pawns: true }, 48, 'noon', { hud: 'also' }),
  s('grassland', 'first-camp', { pawns: true }, 32, 'dawn'),
  s('grassland', 'elk-herd', { mob: 'elk' }, 48, 'morning'),
  s('forest', 'deer', { mob: 'deer' }, 64, 'noon', {}),
  s('forest', 'boars', { mob: 'boar' }, 48, 'dusk'),
  s('mountains', 'goats', { mob: 'goat' }, 48, 'noon'),
  s('grassland', 'herd', { mobs: true }, 32, 'golden')
];

const r1 = [
  s('world', 'whole-map', { whole: true }, 8, 'noon', { hud: 'also' }),
  s('world', 'whole-map', { whole: true }, 8, 'dawn'),
  s('world', 'whole-map', { whole: true }, 8, 'dusk', {}),
  s('world', 'whole-map', { whole: true }, 8, 'night'),
  s('world', 'whole-map-fog', { whole: true }, 8, 'morning', { weather: 'fog' }),
  s('world', 'whole-map-rain', { whole: true }, 8, 'noon', { weather: 'rain' }),
  s('world', 'whole-map-summer', { whole: true }, 8, 'golden', { season: 'summer' }),
  s('world', 'whole-map-autumn', { whole: true }, 8, 'noon', { season: 'autumn' }),
  s('river', 'river-bend', { river: true, k: 0 }, 24, 'noon', {}),
  s('river', 'river-bend', { river: true, k: 1 }, 32, 'dusk'),
  s('river', 'river-valley', { river: true, k: 2 }, 16, 'dawn'),
  s('river', 'river-rain', { river: true, k: 3 }, 24, 'noon', { weather: 'heavy_rain' }),
  s('mountains', 'mountain-edge', { edge: 'mountain', k: 0 }, 24, 'noon', {}),
  s('mountains', 'mountain-edge', { edge: 'mountain', k: 1 }, 32, 'dusk'),
  s('mountains', 'mountain-fog', { edge: 'mountain', k: 2 }, 16, 'morning', { weather: 'fog' }),
  s('forest', 'forest-canopy', { terrain: 'forest', k: 0 }, 32, 'noon', { season: 'summer' }),
  s('forest', 'deep-forest', { terrain: 'deep_forest', k: 0 }, 24, 'noon', { season: 'autumn' })
];

const r2 = [
  s('shore', 'lake-shore', { shore: true, k: 0 }, 32, 'noon', { hud: 'also' }),
  s('shore', 'lake-shore', { shore: true, k: 1 }, 48, 'dawn'),
  s('shore', 'lake-shore', { shore: true, k: 2 }, 24, 'dusk'),
  s('shore', 'foam', { shore: true, k: 3 }, 64, 'noon', { season: 'summer' }),
  s('shore', 'storm', { shore: true, k: 4 }, 32, 'golden', { weather: 'storm' }),
  s('shore', 'windy-rain', { shore: true, k: 5 }, 24, 'noon', { weather: 'windy_rain' }),
  s('shore', 'open-water', { water: true, k: 0 }, 16, 'noon'),
  s('shore', 'lake-night', { shore: true, k: 6 }, 32, 'night'),
  s('bog', 'bog', { terrain: 'swamp', k: 0 }, 32, 'noon', { hud: 'also' }),
  s('bog', 'bog-fog', { terrain: 'swamp', k: 1 }, 24, 'morning', { weather: 'foggy_rain' }),
  s('bog', 'bog', { terrain: 'swamp', k: 2 }, 48, 'dusk'),
  s('bog', 'bog-drizzle', { terrain: 'swamp', k: 3 }, 32, 'noon', { weather: 'drizzle' }),
  s('grassland', 'meadow', { terrain: 'plains', k: 0 }, 32, 'noon', { season: 'summer' }),
  s('grassland', 'heat-wave', { terrain: 'plains', k: 1 }, 24, 'noon', { season: 'summer', weather: 'heat_wave' }),
  s('grassland', 'windy-meadow', { terrain: 'plains', k: 2 }, 16, 'morning', { weather: 'spring_windy' }),
  s('grassland', 'meadow', { terrain: 'plains', k: 3 }, 48, 'dusk', { season: 'autumn' }),
  s('forest', 'forest', { terrain: 'forest', k: 0 }, 16, 'noon', {}),
  s('forest', 'gale', { terrain: 'forest', k: 1 }, 48, 'noon', { weather: 'gale' }),
  s('forest', 'deep-forest', { terrain: 'deep_forest', k: 0 }, 32, 'dusk'),
  s('forest', 'deep-forest', { terrain: 'deep_forest', k: 1 }, 64, 'noon', { season: 'summer' }),
  s('forest', 'autumn-forest', { terrain: 'forest', k: 2 }, 32, 'golden', { season: 'autumn', weather: 'autumn_windy' }),
  s('mountains', 'peaks', { edge: 'mountain', k: 0 }, 16, 'noon', {}),
  s('mountains', 'cliffs', { edge: 'mountain', k: 1 }, 48, 'dawn'),
  s('mountains', 'cliffs', { edge: 'mountain', k: 2 }, 32, 'night'),
  s('river', 'river', { river: true, k: 0 }, 48, 'noon'),
  s('river', 'river', { river: true, k: 1 }, 32, 'noon', { season: 'autumn' })
];

const r3 = [
  s('world', 'continent', { whole: true }, 4, 'noon'),
  s('world', 'continent', { whole: true }, 4, 'dusk'),
  s('world', 'continent-autumn', { whole: true }, 4, 'noon', { season: 'autumn' }),
  s('river', 'delta', { river: true, k: 0 }, 16, 'golden'),
  s('shore', 'coast', { shore: true, k: 0 }, 16, 'noon', { season: 'summer' })
];

const hamlet = [
  s('village', 'construction', { spot: 'blueprints', k: 0 }, 48, 'noon', { hud: 'also' }),
  s('village', 'construction', { spot: 'blueprints', k: 1 }, 64, 'morning'),
  s('village', 'new-field', { spot: 'field', dx: 3, dy: 2 }, 48, 'noon'),
  s('mountains', 'mining', { spot: 'mine', dx: 0, dy: 0 }, 48, 'noon', { hud: 'also' }),
  s('village', 'pawn-at-work', { pawn: 0 }, 64, 'noon', { run: 3 }),
  s('village', 'pawn-at-work', { pawn: 3 }, 64, 'morning', { run: 3 }),
  s('village', 'pawn-hauling', { pawn: 6 }, 48, 'golden', { run: 3 }),
  s('village', 'woodcutters', { pawn: 8 }, 48, 'noon', { run: 3 }),
  s('village', 'construction', { spot: 'blueprints', k: 0 }, 48, 'golden', { run: 10 }),
  s('village', 'construction', { spot: 'blueprints', k: 1 }, 48, 'noon', { run: 4 }),
  s('mountains', 'mining', { spot: 'mine', dx: 0, dy: 0 }, 64, 'dusk', { run: 4 }),
  s('village', 'field', { spot: 'field', dx: 3, dy: 2 }, 64, 'morning', { run: 6, season: 'summer' }),
  s('village', 'hunters', { pawn: 2 }, 48, 'noon', { run: 4 }),
  s('village', 'hamlet', { buildings: true }, 32, 'noon', { hud: 'also' }),
  s('village', 'hamlet', { buildings: true }, 48, 'noon'),
  s('village', 'hamlet', { buildings: true }, 24, 'noon', { season: 'summer' }),
  s('village', 'hamlet', { buildings: true }, 32, 'dawn'),
  s('village', 'hamlet', { buildings: true }, 48, 'dusk'),
  s('village', 'hamlet-lit', { buildings: true }, 32, 'night', { hud: 'also' }),
  s('village', 'hamlet-lit', { buildings: true }, 48, 'night'),
  s('village', 'hearth-house', { building: 'hearth' }, 64, 'night'),
  s('village', 'stone-house', { building: 'brick_hearth' }, 64, 'midnight'),
  s('village', 'hamlet-lit', { buildings: true }, 24, 'midnight'),
  s('village', 'campfire', { building: 'campfire' }, 64, 'night', { run: 2 }),
  s('village', 'forge', { building: 'bloomery' }, 64, 'dusk'),
  s('village', 'hamlet-rain', { buildings: true }, 32, 'noon', { weather: 'rain', hud: 'also' }),
  s('village', 'hamlet-fog', { buildings: true }, 32, 'dawn', { weather: 'fog' }),
  s('village', 'hamlet-autumn', { buildings: true }, 32, 'golden', { season: 'autumn' }),
  s('village', 'hamlet-wind', { buildings: true }, 48, 'noon', { season: 'summer', weather: 'summer_windy' }),
  s('village', 'creatures-nearby', { mobs: true }, 48, 'noon'),
  s('village', 'creatures-nearby', { mobs: true, k: 1 }, 48, 'dusk'),
];

const hamletUi = [
  s('village', 'windows', { buildings: true }, 32, 'noon', { hud: true, windows: [["pawns", "F2"], ["work", "F3"], ["buildings", "F4"], ["crafting", "F5"], ["explore", "F6"], ["culture", "F7"], ["kingdoms", "F8"], ["entities", "F10"]] }),
  s('village', 'pawn-selected', { pawn: 1 }, 48, 'noon', { hud: true, click: true }),
  s('village', 'pawn-selected', { pawn: 5 }, 64, 'golden', { hud: true, click: true }),
  s('village', 'creature-selected', { mobs: true }, 48, 'noon', { hud: true, click: true })
];

const hold = [
  s('village', 'iron-hold', { buildings: true }, 32, 'noon', {}),
  s('village', 'iron-hold', { buildings: true }, 48, 'dusk', { hud: 'also' }),
  s('village', 'iron-hold-lit', { buildings: true }, 32, 'night'),
  s('village', 'forge-glow', { building: 'finery_forge' }, 64, 'night'),
  s('village', 'iron-hold', { buildings: true }, 24, 'dawn'),
  s('village', 'iron-hold', { buildings: true }, 32, 'noon', { hud: true, windows: [["crafting", "F5"]] })
];

const war = [
  s('grassland', 'battle', { fight: true }, 48, 'noon', { hud: 'also' }),
  s('grassland', 'battle', { fight: true }, 64, 'noon', { run: 2 }),
  s('grassland', 'battle', { fight: true }, 32, 'golden', { run: 2 }),
  s('grassland', 'battle', { fight: true }, 48, 'dusk', { run: 2 }),
  s('grassland', 'battle-rain', { fight: true }, 48, 'noon', { run: 2, weather: 'heavy_rain' }),
  s('grassland', 'battle-selected', { fight: true }, 64, 'noon', { hud: true, click: true, run: 1 })
];

const full = [
  s('village', 'full-tech', { buildings: true }, 32, 'noon'),
  s('village', 'full-tech-lit', { buildings: true }, 48, 'night'),
  s('village', 'full-tech', { buildings: true }, 24, 'dusk'),
  s('village', 'full-tech', { buildings: true }, 32, 'noon', { hud: true, windows: [["research", "F9"]] })
];

export const WORLDS = [
  { id: 'fixture', load: { fixture: true }, season: 'spring', shots: fixtureShots },
  { id: 'regen-777', load: { regen: 777, w: 240, h: 135 }, season: 'spring', shots: r1 },
  { id: 'regen-4242', load: { regen: 4242, w: 320, h: 320 }, season: 'spring', shots: r2 },
  { id: 'regen-9001', load: { regen: 9001, w: 480, h: 270 }, season: 'spring', shots: r3 },
  { id: 'hamlet', load: { preset: HAMLET, run: 5, setup: { blueprint: [{ w: 5, h: 4, wall: 'branch_wall', floor: 'branch_floor' }, { w: 6, h: 5, wall: 'wicker_wall', floor: 'packed_earth_floor', inside: 'hearth' }], field: [6, 4], woodcut: 20, mine: 12, forage: 10, hunt: 2 } }, season: 'spring', shots: hamlet },
  { id: 'hamlet-ui', load: { preset: HAMLET, run: 20, setup: { blueprint: [{ w: 5, h: 4, wall: 'branch_wall', floor: 'branch_floor' }], field: [6, 4], woodcut: 20, forage: 10 } }, season: 'spring', shots: hamletUi },
  { id: 'hold', load: { preset: HOLD, run: 20 }, season: 'summer', shots: hold },
  { id: 'war-party', load: { presetId: 'war-party', run: 4, speed: '1X' }, season: 'summer', shots: war },
  { id: 'full-tech', load: { presetId: 'full-tech', run: 15 }, season: 'summer', shots: full }
];
