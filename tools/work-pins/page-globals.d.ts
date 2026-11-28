interface Window {
  __f4xTurn: number;
  __f4xSim: Worker;
  __f4xSpeed: number | null;
  __f4xWorkerTps: number[];
  __f4xScenarioLoaded?: boolean;
  __reseedRandom: (seed: number) => void;
  __f4xFrameTimes: number[];
  __f4xFrameLoop: number;
  __f4xTicks?: number[];
  __f4xMessageKinds?: Record<string, number>;
  __f4xWorkers?: number;
  __f4xWorldEffects: { mutations: number; styleWrites: number; childListChanges: number };
  __f4xPanelWrites: { panelStyleWrites: number; tintMatrixWrites: number };
  __f4xWorkPins: {
    step: (ticks: number) => Promise<number>;
    stats: () => Promise<{
      worker: { turn: number; phases: Record<string, number>; messages: Record<string, { count: number; bytes: number }> };
      render: Record<string, number>;
    }>;
  };
}
