import { Webgl2Device } from './device.js';

export function createWebgl2Device(
  canvas: HTMLCanvasElement,
  attributes: WebGLContextAttributes
): Webgl2Device | null {
  const gl = canvas.getContext('webgl2', attributes);
  return gl ? new Webgl2Device(gl) : null;
}
