// O(1) id lookup over the static building DB (buildings.jsonc) at the CORE layer — same pattern as
// core/itemDefs.ts. `getBuildingById` was a per-call `.find()` and showed up hot in the sim worker
// profile (~3.6%); the DB never mutates at runtime, so it indexes once. BuildingService delegates
// here, and the WebGL renderer reads defs (roof/effects flags) without importing the service.
import buildingsData from '../database/buildings.jsonc';
import type { Building } from './types';

const BUILDINGS_DATABASE = buildingsData as unknown as Building[];

let _byId: Map<string, Building> | null = null;

/** The static building DEFINITION for an id, or undefined. */
export function buildingDefById(id: string): Building | undefined {
  return (_byId ??= new Map(BUILDINGS_DATABASE.map((b) => [b.id, b]))).get(id);
}
