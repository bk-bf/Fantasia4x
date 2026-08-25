import buildingsData from '../../database/world/buildings.jsonc';
import type { Building } from '../types';

const BUILDINGS_DATABASE = buildingsData as unknown as Building[];

let _byId: Map<string, Building> | null = null;

export function buildingDefById(id: string): Building | undefined {
  return (_byId ??= new Map(BUILDINGS_DATABASE.map((b) => [b.id, b]))).get(id);
}
