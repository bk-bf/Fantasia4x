const g = globalThis as {
  WorkerGlobalScope?: unknown;
  importScripts?: unknown;
};

export const isClientRuntime: boolean =
  typeof window !== 'undefined' ||
  typeof g.WorkerGlobalScope !== 'undefined' ||
  typeof g.importScripts === 'function';
