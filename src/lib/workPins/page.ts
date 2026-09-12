export interface WorkPinsReply {
  kind: 'workPins';
  id: number;
  turn: number;
}

interface FrameStats {
  drawCalls: number;
  vertexCount: number;
}

const totals = {
  frames: 0,
  drawCalls: 0,
  vertexCount: 0,
  bufferUploadBytes: 0,
  textureUploadBytes: 0
};
type Totals = typeof totals;
type UploadMethod = 'bufferData' | 'bufferSubData' | 'texImage2D' | 'texSubImage2D';

const waiting = new Map<number, (reply: WorkPinsReply) => void>();
let nextId = 1;

export function addFrameTotals(stats: FrameStats): void {
  totals.frames++;
  totals.drawCalls += stats.drawCalls;
  totals.vertexCount += stats.vertexCount;
}

function dataBytes(data: unknown): number {
  return ArrayBuffer.isView(data) || data instanceof ArrayBuffer ? data.byteLength : 0;
}

function pixelBytes(pixels: unknown, width?: unknown, height?: unknown): number {
  if (pixels === null || pixels === undefined || typeof pixels === 'number') return 0;
  if (ArrayBuffer.isView(pixels)) return pixels.byteLength;
  const source = pixels as { width: number; height: number };
  return Number(width ?? source.width) * Number(height ?? source.height) * 4;
}

export function countUploads(gl: WebGL2RenderingContext): void {
  const wrap = (method: UploadMethod, into: keyof Totals, bytes: (a: unknown[]) => number) => {
    const original = (gl[method] as (...a: unknown[]) => void).bind(gl);
    (gl as unknown as Record<UploadMethod, (...a: unknown[]) => void>)[method] = (...a) => {
      totals[into] += bytes(a);
      original(...a);
    };
  };
  wrap('bufferData', 'bufferUploadBytes', (a) => (typeof a[1] === 'number' ? a[1] : dataBytes(a[1])));
  wrap('bufferSubData', 'bufferUploadBytes', (a) => dataBytes(a[2]));
  wrap('texImage2D', 'textureUploadBytes', (a) =>
    a.length >= 9 ? pixelBytes(a[8], a[3], a[4]) : pixelBytes(a[5])
  );
  wrap('texSubImage2D', 'textureUploadBytes', (a) =>
    a.length >= 9 ? pixelBytes(a[8], a[4], a[5]) : pixelBytes(a[6])
  );
}

function takeTotals(): Totals {
  const taken = { ...totals };
  for (const key of Object.keys(totals) as Array<keyof Totals>) totals[key] = 0;
  return taken;
}

export function connectWorkPins(post: (msg: unknown) => void): void {
  const request = (op: string, extra: Record<string, unknown> = {}) =>
    new Promise<WorkPinsReply>((resolve) => {
      const id = nextId++;
      waiting.set(id, resolve);
      post({ kind: 'workPins', op, id, ...extra });
    });
  (globalThis as Record<string, unknown>).__f4xWorkPins = {
    step: async (ticks: number) => (await request('step', { ticks })).turn,
    stats: async () => ({ worker: await request('stats'), render: takeTotals() })
  };
}

export function receiveWorkPins(reply: WorkPinsReply): void {
  waiting.get(reply.id)?.(reply);
  waiting.delete(reply.id);
}
