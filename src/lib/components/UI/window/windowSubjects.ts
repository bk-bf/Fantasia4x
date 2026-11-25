import { derived } from 'svelte/store';
import type { WindowId } from '$lib/stores/uiState';
import { uiState } from '$lib/stores/uiState';
import { gameState } from '$lib/stores/gameState';
import { buildingService } from '$lib/game/services/BuildingService';
import { buildingTarget, storeTarget } from '$lib/components/UI/canvas/windowTargets';

export const windowSubjects = derived(
  [gameState, uiState, buildingTarget, storeTarget],
  ([$game, $ui, $building, $store]): Partial<Record<WindowId, string>> => {
    const buildingName = (id: string | null | undefined) => {
      const b = id ? ($game.buildings ?? []).find((x) => x.id === id) : undefined;
      return b ? buildingService.getBuildingById(b.type)?.name : undefined;
    };
    const pawn = ($game.pawns ?? []).find((p) => p.id === $ui.selectedPawnId);
    const store =
      $store?.kind === 'zone'
        ? ($game.zoneInstances ?? []).find((z) => z.id === $store.id)?.label
        : buildingName($store?.id);
    const out: Partial<Record<WindowId, string>> = {};
    if (pawn) out.mood = pawn.name.split(' ')[0];
    const target = buildingName($building);
    if (target) out.repair = out.fuel = target;
    if (store) out.stores = store;
    return out;
  }
);
