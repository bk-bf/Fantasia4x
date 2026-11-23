import vertexSource from './shaders/groundRing.vert.glsl?raw';
import fragmentSource from './shaders/groundRing.frag.glsl?raw';
import type { ShaderManager } from './shaders.js';

const PROGRAM = 'groundRing';
const SHADOW_OFFSET = 1;

export interface GroundRing {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RingInk {
  color: readonly [number, number, number];
  shadow: readonly [number, number, number];
  line: number;
}

export class GroundRings {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly at: Record<string, WebGLUniformLocation | null>;

  static create(gl: WebGL2RenderingContext, shaders: ShaderManager): GroundRings | null {
    const made = shaders.createProgram(PROGRAM, vertexSource, fragmentSource);
    const program = shaders.getProgram(PROGRAM)?.program;
    if (!made.success || !program) {
      console.warn('[ground rings] off:', made.error);
      return null;
    }
    return new GroundRings(gl, program);
  }

  private constructor(gl: WebGL2RenderingContext, program: WebGLProgram) {
    this.gl = gl;
    this.program = program;
    this.vao = gl.createVertexArray()!;
    this.at = Object.fromEntries(
      ['u_canvas', 'u_area', 'u_ring', 'u_line', 'u_offset', 'u_color', 'u_shadow'].map((name) => [
        name,
        gl.getUniformLocation(program, name)
      ])
    );
  }

  draw(rings: readonly GroundRing[], ink: RingInk, canvas: [number, number]): number {
    if (rings.length === 0) return 0;
    const gl = this.gl;
    const depth = gl.isEnabled(gl.DEPTH_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2fv(this.at.u_canvas, canvas);
    gl.uniform1f(this.at.u_line, ink.line);
    gl.uniform1f(this.at.u_offset, SHADOW_OFFSET);
    gl.uniform3fv(this.at.u_color, ink.color);
    gl.uniform3fv(this.at.u_shadow, ink.shadow);
    for (const r of rings) {
      gl.uniform4f(this.at.u_ring, r.x, r.y, r.w, r.h);
      gl.uniform4f(this.at.u_area, r.x, r.y, r.w + SHADOW_OFFSET, r.h + SHADOW_OFFSET);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
    if (depth) gl.enable(gl.DEPTH_TEST);
    return rings.length;
  }

  dispose(): void {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}
