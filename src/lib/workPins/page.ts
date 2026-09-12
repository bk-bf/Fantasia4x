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
  textureUploadBytes: 0,
  framebufferBinds: 0,
  clears: 0,
  clearedPixels: 0,
  glDrawCalls: 0,
  glVertices: 0,
  glInstances: 0,
  programSwitches: 0
};
type Totals = typeof totals;
type GlArgs = unknown[];

const textureBytes = new Map<WebGLTexture, Map<number, number>>();
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

function texImageBytes(a: GlArgs): number {
  if (a.length >= 9) {
    const [width, height] = [Number(a[3]), Number(a[4])];
    return a[8] === null || a[8] === undefined ? width * height * 4 : pixelBytes(a[8], width, height);
  }
  return pixelBytes(a[5]);
}

function residentTextureBytes(): number {
  let sum = 0;
  for (const levels of textureBytes.values()) for (const bytes of levels.values()) sum += bytes;
  return sum;
}

function wrapGl(gl: WebGL2RenderingContext, method: keyof WebGL2RenderingContext, before: (a: GlArgs) => void) {
  const original = (gl[method] as (...a: GlArgs) => unknown).bind(gl);
  (gl as unknown as Record<string, (...a: GlArgs) => unknown>)[method] = (...a) => {
    before(a);
    return original(...a);
  };
}

export function countGl(gl: WebGL2RenderingContext): void {
  let viewportArea = gl.drawingBufferWidth * gl.drawingBufferHeight;
  let program: unknown = null;
  let bound: WebGLTexture | null = null;
  wrapGl(gl, 'bufferData', (a) => (totals.bufferUploadBytes += typeof a[1] === 'number' ? a[1] : dataBytes(a[1])));
  wrapGl(gl, 'bufferSubData', (a) => (totals.bufferUploadBytes += dataBytes(a[2])));
  wrapGl(gl, 'texSubImage2D', (a) => {
    totals.textureUploadBytes += a.length >= 9 ? pixelBytes(a[8], a[4], a[5]) : pixelBytes(a[6]);
  });
  wrapGl(gl, 'texImage2D', (a) => {
    const bytes = texImageBytes(a);
    totals.textureUploadBytes += a.length >= 9 && (a[8] === null || a[8] === undefined) ? 0 : bytes;
    if (!bound) return;
    const levels = textureBytes.get(bound) ?? new Map<number, number>();
    levels.set(Number(a[1]), bytes);
    textureBytes.set(bound, levels);
  });
  wrapGl(gl, 'generateMipmap', () => {
    const levels = bound && textureBytes.get(bound);
    if (levels) levels.set(-1, Math.round((levels.get(0) ?? 0) / 3));
  });
  wrapGl(gl, 'bindTexture', (a) => {
    if (a[0] === gl.TEXTURE_2D) bound = a[1] as WebGLTexture | null;
  });
  wrapGl(gl, 'deleteTexture', (a) => textureBytes.delete(a[0] as WebGLTexture));
  wrapGl(gl, 'bindFramebuffer', () => totals.framebufferBinds++);
  wrapGl(gl, 'viewport', (a) => (viewportArea = Number(a[2]) * Number(a[3])));
  wrapGl(gl, 'clear', () => {
    totals.clears++;
    totals.clearedPixels += viewportArea;
  });
  wrapGl(gl, 'useProgram', (a) => {
    if (a[0] !== program) totals.programSwitches++;
    program = a[0];
  });
  const draw = (count: number, instances: number) => {
    totals.glDrawCalls++;
    totals.glVertices += count * instances;
    totals.glInstances += instances;
  };
  wrapGl(gl, 'drawArrays', (a) => draw(Number(a[2]), 1));
  wrapGl(gl, 'drawElements', (a) => draw(Number(a[1]), 1));
  wrapGl(gl, 'drawArraysInstanced', (a) => draw(Number(a[2]), Number(a[3])));
  wrapGl(gl, 'drawElementsInstanced', (a) => draw(Number(a[1]), Number(a[4])));
}

function takeTotals(): Totals & { residentTextureBytes: number } {
  const taken = { ...totals, residentTextureBytes: residentTextureBytes() };
  for (const key of Object.keys(totals) as Array<keyof Totals>) totals[key] = 0;
  return taken;
}

export function connectWorkPins(worker: Worker): void {
  const request = (op: string, extra: Record<string, unknown> = {}) =>
    new Promise<WorkPinsReply>((resolve) => {
      const id = nextId++;
      waiting.set(id, resolve);
      worker.postMessage({ kind: 'workPins', op, id, ...extra });
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
