// src/lib/game/core/Resources.ts
import type { Resource } from './types';

export const BASIC_RESOURCES: Resource[] = [
  { id: 'food', name: 'Food', amount: 0, type: 'basic' },
  { id: 'wood', name: 'Wood', amount: 0, type: 'basic' },
  { id: 'stone', name: 'Stone', amount: 0, type: 'basic' },
  { id: 'iron', name: 'Iron', amount: 0, type: 'basic' }
];

export function createMagicalResource(): Resource {
  const magicalTypes = ['Crystal', 'Essence', 'Rune', 'Shard'];
  const properties = ['Fire', 'Ice', 'Lightning', 'Shadow', 'Light'];
  
  const type = magicalTypes[Math.floor(Math.random() * magicalTypes.length)];
  const property = properties[Math.floor(Math.random() * properties.length)];
  
  return {
    id: `${property.toLowerCase()}_${type.toLowerCase()}`,
    name: `${property} ${type}`,
    amount: Math.floor(Math.random() * 5) + 1,
    type: 'magical',
    properties: {
      element: property.toLowerCase(),
      power: Math.floor(Math.random() * 10) + 1
    }
  };
}
