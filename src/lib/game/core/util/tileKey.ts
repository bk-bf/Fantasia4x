export function tileKey(x: number, y: number, width: number): number {
  return y * width + x;
}
