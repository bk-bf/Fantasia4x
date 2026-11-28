import { get } from 'svelte/store';
import { gameState } from '$lib/stores/gameState';
import { uiState } from '$lib/stores/uiState';

export function holdPauseWhileMenuOpen(): () => void {
  let open = false;
  let wasPaused = false;
  return uiState.subscribe((s) => {
    const now = s.windows.includes('pause');
    if (now === open) return;
    open = now;
    if (now) {
      wasPaused = get(gameState.isPaused);
      if (!wasPaused) gameState.pauseGame();
    } else if (!wasPaused) gameState.unpauseGame();
  });
}
