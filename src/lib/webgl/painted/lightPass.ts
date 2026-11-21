import vertexSource from '../shaders/paintedLight.vert.glsl?raw';
import fragmentSource from '../shaders/paintedLight.frag.glsl?raw';
import type { ShaderManager } from '../shaders.js';
import {
  MAX_LIGHTS,
  packLights,
  type LightGrade,
  type PointLight,
  type TileRect
} from './lightGrade.js';

const PROGRAM = 'paintedLight';
const LIGHT_PASS = 0;
const VIGNETTE_PASS = 1;

export interface LightPassFrame {
  canvas: [number, number];
  viewOffset: [number, number];
  zoom: [number, number];
  artPerBase: number;
  artTile: number;
  view: TileRect;
  grade: LightGrade;
  lights: readonly PointLight[];
  time: number;
}

export class PaintedLightPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly at: Record<string, WebGLUniformLocation | null>;
  private readonly packed = new Float32Array(MAX_LIGHTS * 8);

  static create(gl: WebGL2RenderingContext, shaders: ShaderManager): PaintedLightPass | null {
    const made = shaders.createProgram(PROGRAM, vertexSource, fragmentSource);
    const program = shaders.getProgram(PROGRAM)?.program;
    if (!made.success || !program) {
      console.warn('[painted light] off:', made.error);
      return null;
    }
    return new PaintedLightPass(gl, program);
  }

  private constructor(gl: WebGL2RenderingContext, program: WebGLProgram) {
    this.gl = gl;
    this.program = program;
    this.vao = gl.createVertexArray()!;
    const names = [
      'u_canvas',
      'u_viewOffset',
      'u_zoom',
      'u_artPerBase',
      'u_ambient',
      'u_vignette',
      'u_lightCount',
      'u_lights',
      'u_pass'
    ];
    this.at = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
  }

  draw(f: LightPassFrame): number {
    const gl = this.gl;
    const count = packLights(f.lights, f.view, f.grade, f.artTile, f.time, this.packed);
    gl.useProgram(this.program);
    gl.uniform2fv(this.at.u_canvas, f.canvas);
    gl.uniform2fv(this.at.u_viewOffset, f.viewOffset);
    gl.uniform2fv(this.at.u_zoom, f.zoom);
    gl.uniform1f(this.at.u_artPerBase, f.artPerBase);
    gl.uniform3fv(this.at.u_ambient, f.grade.ambient);
    gl.uniform1f(this.at.u_vignette, f.grade.vignette);
    gl.uniform1i(this.at.u_lightCount, count);
    if (count > 0) gl.uniform4fv(this.at.u_lights, this.packed, 0, count * 8);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.DST_COLOR, gl.SRC_COLOR, gl.ZERO, gl.ONE);
    gl.uniform1i(this.at.u_pass, LIGHT_PASS);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(this.at.u_pass, VIGNETTE_PASS);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    return 2;
  }

  dispose(): void {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}
