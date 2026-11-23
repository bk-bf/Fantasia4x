let provider: (() => string) | null = null;

export function setPerfContextProvider(fn: () => string): void {
  provider = fn;
}

export function perfContext(): string {
  try {
    return provider?.() ?? '';
  } catch {
    return '';
  }
}
