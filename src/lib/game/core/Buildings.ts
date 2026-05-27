import type { Building } from './types';
import data from '../database/buildings.json';

// Enhanced affordability check using buildingCost
export const AVAILABLE_BUILDINGS = data as unknown as Building[];
