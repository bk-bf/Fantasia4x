interface Window {
  __f4xTurn: number;
  __f4xSim: Worker;
  __f4xScenarioLoaded?: boolean;
  __reseedRandom: (seed: number) => void;
  __f4xPanelWrites: { panelStyleWrites: number; tintMatrixWrites: number };
  __f4xWorkPins: {
    step: (ticks: number) => Promise<number>;
    stats: () => Promise<{ worker?: { turn?: number } }>;
  };
}
