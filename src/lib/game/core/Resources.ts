import type { Resource } from './types';

// Resource display data
export const BASIC_RESOURCES: Resource[] = [
  { id: 'food', name: 'Food', amount: 0, type: 'basic', emoji: '🌾', color: '#FFA726' },
  { id: 'wood', name: 'Wood', amount: 0, type: 'basic', emoji: '🪵', color: '#8BC34A' },
  { id: 'stone', name: 'Stone', amount: 0, type: 'basic', emoji: '🪨', color: '#9E9E9E' },
  { id: 'iron', name: 'Iron', amount: 0, type: 'basic', emoji: '⛓️', color: '#4CAF50' },
  { id: 'herbs', name: 'Herbs', amount: 0, type: 'basic', emoji: '🌿', color: '#4CAF50' }
];


// Helper to get display data by id
export function getResourceDisplayData(resourceId: string): Resource | undefined {
  return BASIC_RESOURCES.find(r => r.id === resourceId);
}

// Helper functions for resource display
export function getResourceIcon(resourceId: string): string {
  return getResourceDisplayData(resourceId)?.emoji || '📦';
}

export function getResourceColor(resourceId: string): string {
  return getResourceDisplayData(resourceId)?.color || '#4CAF50';
}

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
