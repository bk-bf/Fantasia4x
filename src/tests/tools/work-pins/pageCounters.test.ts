import { describe, expect, it } from 'vitest';
import { connectWorkPins, countGl, receiveWorkPins } from '$lib/workPins/page';

const GL_METHODS = [
  'bufferData',
  'bufferSubData',
  'texSubImage2D',
  'texImage2D',
  'generateMipmap',
  'bindTexture',
  'deleteTexture',
  'bindFramebuffer',
  'viewport',
  'clear',
  'useProgram',
  'drawArrays',
  'drawElements',
  'drawArraysInstanced',
  'drawElementsInstanced',
  'uniform1f',
  'uniform2i',
  'uniform4fv',
  'uniform3fv',
  'uniformMatrix4fv',
  'uniformBlockBinding'
];
const UNIFORM_BUFFER = 0x8a11;
const ARRAY_BUFFER = 0x8892;

function fakeGl(): WebGL2RenderingContext {
  const methods = Object.fromEntries(GL_METHODS.map((m) => [m, () => undefined]));
  return Object.assign(Object.create(methods), {
    UNIFORM_BUFFER,
    ARRAY_BUFFER,
    TEXTURE_2D: 0x0de1,
    drawingBufferWidth: 4,
    drawingBufferHeight: 4
  });
}

async function renderTotals(): Promise<Record<string, number>> {
  const worker = {
    postMessage: (m: { id: number }) => receiveWorkPins({ kind: 'workPins', id: m.id, turn: 0 })
  } as unknown as Worker;
  connectWorkPins(worker);
  const pins = (globalThis as unknown as { __f4xWorkPins: { stats: () => Promise<{ render: Record<string, number> }> } })
    .__f4xWorkPins;
  return (await pins.stats()).render;
}

describe('work pin uniform upload counter', () => {
  it('counts uniform calls and uniform buffer uploads apart from vertex buffer uploads', async () => {
    const gl = fakeGl();
    countGl(gl);
    gl.uniform1f(null, 1);
    gl.uniform2i(null, 1, 2);
    gl.uniform4fv(null, new Float32Array(8));
    gl.uniform3fv(null, [1, 2, 3, 4, 5, 6], 3);
    gl.uniformMatrix4fv(null, false, new Float32Array(32), 16, 16);
    gl.uniformBlockBinding(null as unknown as WebGLProgram, 0, 0);
    gl.bufferSubData(UNIFORM_BUFFER, 0, new Float32Array(16));
    gl.bufferData(UNIFORM_BUFFER, 256, 0);
    gl.bufferSubData(ARRAY_BUFFER, 0, new Float32Array(10));
    const totals = await renderTotals();
    expect(totals.uniformUploadBytes).toBe(4 + 8 + 32 + 12 + 64 + 64 + 256);
    expect(totals.bufferUploadBytes).toBe(40);
  });
});
