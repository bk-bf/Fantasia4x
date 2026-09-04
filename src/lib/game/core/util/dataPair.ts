export function pair(xs: readonly number[], what: string): [number, number] {
  if (xs.length !== 2) {
    throw new Error(`${what}: expected two numbers, found ${xs.length}`);
  }
  return [xs[0], xs[1]];
}
