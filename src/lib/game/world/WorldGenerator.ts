// src/lib/game/world/WorldGenerator.ts
import type { WorldTile, Location } from '../core/types';

export function generateWorld(width: number, height: number): WorldTile[][] {
  const world: WorldTile[][] = [];
  
  for (let y = 0; y < height; y++) {
    world[y] = [];
    for (let x = 0; x < width; x++) {
      world[y][x] = generateTile(x, y);
    }
  }
  
  return world;
}

function generateTile(x: number, y: number): WorldTile {
  const types = ['land', 'forest', 'mountain', 'water'] as const;
  const asciiChars = ['.', '♦', '▲', '~'];
  
  const typeIndex = Math.floor(Math.random() * types.length);
  
  return {
    x,
    y,
    type: types[typeIndex],
    discovered: x === 0 && y === 0, // Starting position
    ascii: asciiChars[typeIndex]
  };
}

export function generateLocations(worldMap: WorldTile[][]): Location[] {
  const locations: Location[] = [];
  const locationTypes = ['forest', 'ruins', 'mine', 'settlement'] as const;
  
  // Generate 10-15 random locations
  const numLocations = Math.floor(Math.random() * 6) + 10;
  
  for (let i = 0; i < numLocations; i++) {
    const x = Math.floor(Math.random() * worldMap[0].length);
    const y = Math.floor(Math.random() * worldMap.length);
    
    locations.push({
      id: `loc_${i}`,
      name: generateLocationName(),
      type: locationTypes[Math.floor(Math.random() * locationTypes.length)],
      x,
      y,
      discovered: false
    });
  }
  
  return locations;
}

function generateLocationName(): string {
  const adjectives = ['Ancient', 'Forgotten', 'Hidden', 'Mystic', 'Dark'];
  const nouns = ['Grove', 'Ruins', 'Mine', 'Outpost', 'Temple'];
  
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
}
