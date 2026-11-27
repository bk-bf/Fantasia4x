import { Webgl2Device } from './device.js';

export function isWebGL2Supported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return gl !== null;
  } catch (e) {
    return false;
  }
}

export function createWebgl2Device(
  canvas: HTMLCanvasElement,
  attributes: WebGLContextAttributes
): Webgl2Device | null {
  const gl = canvas.getContext('webgl2', attributes);
  return gl ? new Webgl2Device(gl) : null;
}
