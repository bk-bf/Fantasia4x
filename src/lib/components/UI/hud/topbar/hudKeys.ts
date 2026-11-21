import { get } from 'svelte/store';
import { gameState } from '$lib/stores/gameState';
import { uiState } from '$lib/stores/uiState';
import { flagForKey, researchUnlocked } from './hudFlags';

function escape(): void {
  const ui = get(uiState);
  if (ui.blueprintBuildingId) uiState.deactivateBlueprint();
  else if (ui.designationActive) uiState.deactivateDesignation();
  else if (ui.windows.length) uiState.closeTopWindow();
  else if (ui.selectedPawnId || ui.selectedMobId || ui.cameraFollowPawnId || ui.cameraFollowMobId) {
    uiState.selectPawn(null);
    uiState.selectMob(null);
    uiState.setFollowPawn(null);
    uiState.setFollowMob(null);
  } else uiState.openWindow('pause');
}

export function handleHudKey(e: KeyboardEvent, debug: boolean): void {
  if (get(uiState).windows.includes('pause')) {
    if (e.key === 'Escape') {
      e.preventDefault();
      uiState.closeWindow('pause');
    }
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    gameState.togglePause();
    return;
  }
  if (e.key === 'Escape') {
    escape();
    return;
  }
  if (e.key === 'F1') {
    e.preventDefault();
    uiState.closeAllWindows();
    return;
  }
  const flag = e.key ? flagForKey(e.key, debug) : undefined;
  if (!flag) return;
  e.preventDefault();
  if (flag.needsResearch && !researchUnlocked(get(gameState).buildings)) return;
  uiState.toggleWindow(flag.id);
}
