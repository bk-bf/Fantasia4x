function house(x0, y0, w, h, wall, floor, inside) {
  const out = [];
  const doorX = x0 + Math.floor(w / 2);
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
      if (edge) out.push({ id: y === y0 + h - 1 && x === doorX ? 'door' : wall, x, y });
      else out.push({ id: floor, x, y });
    }
  for (const b of inside) out.push(b);
  return out;
}

export const HAMLET = {
  id: 'shots-hamlet',
  label: 'Shots hamlet',
  description: 'shots',
  spec: {
    seed: 0xb407e,
    map: { w: 96, h: 96, preset: 'generated' },
    pawns: [{ count: 10, skillLevel: 14 }],
    researchMaxTier: 2,
    buildings: [
      { id: 'campfire' },
      { id: 'well' },
      { id: 'craft_spot' },
      { id: 'makers_bench' },
      { id: 'charcoal_pit' },
      { id: 'stone_forge' },
      { id: 'drying_rack' },
      { id: 'larder_cupboard' },
      ...house(42, 52, 6, 5, 'daub_wall', 'wooden_floor', [
        { id: 'hearth', x: 44, y: 54 },
        { id: 'hay_bed', x: 46, y: 53 },
        { id: 'hay_bed', x: 46, y: 54 }
      ]),
      ...house(35, 50, 5, 5, 'stone_block_wall', 'stone_floor', [
        { id: 'brick_hearth', x: 37, y: 52 },
        { id: 'hide_bed', x: 36, y: 51 }
      ]),
      { id: 'campfire', x: 45, y: 59 },
      { id: 'bloomery', x: 51, y: 50 }
    ],
    items: {
      bread: 60, spit_meat: 40, water: 120, branch: 200, small_stone: 120, pine_plank: 60,
      limestone_block: 40, hide: 20, bronze_bar: 30, stone_axe: 3, stone_pick: 2, stone_hammer: 2
    }
  }
};

export const HOLD = {
  id: 'shots-hold',
  label: 'Shots hold',
  description: 'shots',
  spec: {
    seed: 0x140c0,
    map: { w: 96, h: 96, preset: 'generated' },
    pawns: [{ count: 12, skillLevel: 20 }],
    researchMaxTier: 2,
    buildings: [
      { id: 'campfire' }, { id: 'hearth' }, { id: 'well' }, { id: 'makers_bench' }, { id: 'charcoal_pit' },
      { id: 'stone_forge' }, { id: 'bloomery' }, { id: 'anvil' }, { id: 'finery_forge' }, { id: 'oven' },
      { id: 'larder_cupboard' }, { id: 'hay_bed' }, { id: 'hay_bed' }, { id: 'hide_bed' }, { id: 'hide_bed' }
    ],
    items: { bread: 80, salted_meat: 60, water: 150, branch: 200, small_stone: 120, oak_plank: 80, limestone_block: 60, hide: 30, iron_bar: 30, iron_axe: 2, iron_hammer: 2 }
  }
};
