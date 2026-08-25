let enabled = false;

export function setGameDebug(on: boolean): void {
  enabled = on;
}

export function isGameDebug(): boolean {
  return enabled;
}

export const glog = (...args: unknown[]): void => {
  if (enabled) console.log(...args);
};

export const gdebug = (...args: unknown[]): void => {
  if (enabled) console.debug(...args);
};

export const gwarn = (...args: unknown[]): void => {
  if (enabled) console.warn(...args);
};

export const gatedConsole = {
  log: glog,
  debug: gdebug,
  info: glog,
  warn: gwarn,
  error: (...args: unknown[]): void => console.error(...args)
};

if (typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>).gameDebug = setGameDebug;
}
