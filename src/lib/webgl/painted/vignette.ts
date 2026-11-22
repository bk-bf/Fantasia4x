import vertexSource from '../shaders/paintedLight.vert.glsl?raw';
import fragmentSource from '../shaders/paintedVignette.frag.glsl?raw';
import type { ShaderManager } from '../shaders.js';
import { clamp, dith } from '../../pixelArt/noise.js';

const PROGRAM = 'paintedVignette';
export const VIGNETTE_START = 0.62;
export const VIGNETTE_SPAN = 0.8;
export const VIGNETTE_STEPS = 4;
export const VIGNETTE_FULL_TILE_PX = 32;
export const VIGNETTE_GONE_TILE_PX = 16;

export function vignetteAtZoom(tilePx: number): number {
  const t = clamp(
    (tilePx - VIGNETTE_GONE_TILE_PX) / (VIGNETTE_FULL_TILE_PX - VIGNETTE_GONE_TILE_PX),
    0,
    1
  );
  return t * t * (3 - 2 * t);
}

export function vignetteAlpha(
  x: number,
  y: number,
  w: number,
  h: number,
  strength: number
): number {
  const cx = Math.max(0.5, (w - 1) / 2);
  const cy = Math.max(0.5, (h - 1) / 2);
  const v = clamp(
    (Math.hypot((x - cx) / cx, (y - cy) / cy) - VIGNETTE_START) / VIGNETTE_SPAN,
    0,
    1
  );
  const q = Math.min(VIGNETTE_STEPS, Math.floor(v * v * (3 - 2 * v) * VIGNETTE_STEPS + dith(x, y)));
  return q * strength;
}

export interface VignetteFrame {
  canvas: [number, number];
  strength: number;
  tilePx: number;
}

export class PaintedVignette {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uCanvas: WebGLUniformLocation | null;
  private readonly uStrength: WebGLUniformLocation | null;

  static create(gl: WebGL2RenderingContext, shaders: ShaderManager): PaintedVignette | null {
    const made = shaders.createProgram(PROGRAM, vertexSource, fragmentSource);
    const program = shaders.getProgram(PROGRAM)?.program;
    if (!made.success || !program) {
      console.warn('[painted vignette] off:', made.error);
      return null;
    }
    return new PaintedVignette(gl, program);
  }

  private constructor(gl: WebGL2RenderingContext, program: WebGLProgram) {
    this.gl = gl;
    this.program = program;
    this.vao = gl.createVertexArray()!;
    this.uCanvas = gl.getUniformLocation(program, 'u_canvas');
    this.uStrength = gl.getUniformLocation(program, 'u_strength');
  }

  draw(f: VignetteFrame): number {
    const strength = f.strength * vignetteAtZoom(f.tilePx);
    if (strength <= 0) return 0;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform2fv(this.uCanvas, f.canvas);
    gl.uniform1f(this.uStrength, strength);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    return 1;
  }

  dispose(): void {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}
