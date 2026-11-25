import { get } from 'svelte/store';
import { gameState, currentTurn, savedStateReady } from '$lib/stores/gameState';
import { pathfinderService } from '$lib/game/services/PathfinderService';

const TPS_SAMPLE_MS = 250;
const TPS_ALPHA = 0.3;

export function startGameLoop(onTps: (tps: number) => void): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  savedStateReady.then(() => {
    if (stopped) return;
    gameState.startAutoTurns();
    pathfinderService.init().catch((err) => {
      console.warn('[WASM] Pathfinder failed to load — pawns will stay idle until resolved:', err);
    });
    let lastTurn = get(currentTurn);
    let lastTime = performance.now();
    let ema = 0;
    timer = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - lastTime) / 1000;
      const turn = get(currentTurn);
      const dTurn = turn - lastTurn;
      lastTurn = turn;
      lastTime = now;
      if (get(gameState.isPaused)) {
        ema = 0;
        onTps(0);
        return;
      }
      if (elapsed <= 0) return;
      const instant = dTurn / elapsed;
      ema = ema === 0 ? instant : ema * (1 - TPS_ALPHA) + instant * TPS_ALPHA;
      onTps(Math.round(ema));
    }, TPS_SAMPLE_MS);
  });
  return () => {
    stopped = true;
    gameState.stopAutoTurns();
    if (timer) clearInterval(timer);
  };
}
