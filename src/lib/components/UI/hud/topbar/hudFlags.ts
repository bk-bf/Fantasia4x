import type { WindowId } from '$lib/stores/uiState';
import type { PlacedBuilding } from '$lib/game/core/types';
import { gameCoordinator } from '$lib/game/systems/GameCoordinator';

export interface HudFlag {
  id: WindowId;
  label: string;
  key: string;
  needsResearch?: boolean;
}

const FLAGS: HudFlag[] = [
  { id: 'pawns', label: 'Pawns', key: 'F2' },
  { id: 'work', label: 'Work', key: 'F3' },
  { id: 'building', label: 'Buildings', key: 'F4' },
  { id: 'crafting', label: 'Crafting', key: 'F5' },
  { id: 'exploration', label: 'Explore', key: 'F6' },
  { id: 'culture', label: 'Culture', key: 'F7' },
  { id: 'kingdoms', label: 'Kingdoms', key: 'F8' },
  { id: 'research', label: 'Research', key: 'F9', needsResearch: true },
  { id: 'entities', label: 'Entities', key: 'F10' }
];

const DEBUG_FLAG: HudFlag = { id: 'debug', label: 'Debug', key: 'F11' };

export const LEFT_FLAGS = 5;

export const hudFlags = (debug: boolean): HudFlag[] => (debug ? [...FLAGS, DEBUG_FLAG] : FLAGS);

export const flagForKey = (key: string, debug: boolean): HudFlag | undefined =>
  hudFlags(debug).find((f) => f.key === key);

export const researchUnlocked = (buildings: PlacedBuilding[] | undefined): boolean =>
  (buildings ?? []).some(
    (b) =>
      b.status === 'complete' && gameCoordinator.getBuildingById(b.type)?.category === 'knowledge'
  );
