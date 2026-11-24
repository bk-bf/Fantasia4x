import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { generateWorld } from '$lib/game/world/WorldGenerator';

it('writes the L map the mountain tops mockup is rendered on', () => {
  const world = generateWorld(750, 750, 1337, { generator: 'landforms' });
  writeFileSync(String(process.env.WORLD_OUT), gzipSync(JSON.stringify(world)));
}, 600000);
