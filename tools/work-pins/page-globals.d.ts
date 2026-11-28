interface Window {
  __f4xTurn: number;
  __f4xGpu?: { backend: string; detail: string; wgsl: string };
  __f4xSim: Worker;
  __f4xSpeed: number | null;
  __f4xWorkerTps: number[];
  __f4xScenarioLoaded?: boolean;
  __reseedRandom: (seed: number) => void;
  __f4xPanelWrites: { panelStyleWrites: number; tintMatrixWrites: number };
  __f4xWorkPins: {
    step: (ticks: number) => Promise<number>;
    stats: () => Promise<{ worker?: { turn?: number } }>;
  };
}
