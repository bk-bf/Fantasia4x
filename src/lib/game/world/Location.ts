import type { Location, Resource } from '../core/types';
import { createMagicalResource } from '../core/Resources';

export function exploreLocation(location: Location): { resources: Resource[], events: string[] } {
  const resources: Resource[] = [];
  const events: string[] = [];
  
  switch (location.type) {
    case 'forest':
      resources.push({ id: 'wood', name: 'Wood', amount: 20, type: 'basic' });
      events.push(`Explored ${location.name} and gathered wood`);
      break;
      
    case 'mine':
      resources.push({ id: 'iron', name: 'Iron', amount: 15, type: 'basic' });
      if (Math.random() < 0.3) {
        resources.push(createMagicalResource());
        events.push(`Discovered magical materials in ${location.name}!`);
      }
      break;
      
    case 'ruins':
      if (Math.random() < 0.5) {
        resources.push(createMagicalResource());
        events.push(`Ancient magic discovered in ${location.name}`);
      }
      break;
  }
  
  return { resources, events };
}
