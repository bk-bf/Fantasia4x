import vertexSource from '../shaders/paintedLight.vert.glsl?raw';
import fragmentSource from '../shaders/paintedLight.frag.glsl?raw';
import type { ShaderManager } from '../shaders.js';
import {
  MAX_LIGHTS,
  TIMES,
  packLights,
  type LightGrade,
  type PointLight,
  type TileRect
} from './lightGrade.js';

const TIME_AMBIENT = new Float32Array([
  ...TIMES.day.ambient,
  ...TIMES.dusk.ambient,
  ...TIMES.night.ambient
]);
const TIME_STRENGTH = new Float32Array([
  TIMES.day.strength,
  TIMES.dusk.strength,
  TIMES.night.strength
]);

const PROGRAM = 'paintedLight';
export const LIGHT_FIELD_UNIT = 6;

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
  private readonly field: WebGLTexture;
  private readonly target: WebGLFramebuffer;
  private fieldSize: [number, number] = [0, 0];

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
    this.field = gl.createTexture()!;
    this.target = gl.createFramebuffer()!;
    const names = [
      'u_canvas',
      'u_viewOffset',
      'u_zoom',
      'u_artPerBase',
      'u_weights',
      'u_timeAmbient',
      'u_timeStrength',
      'u_lightCount',
      'u_lights'
    ];
    this.at = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]));
  }

  private sizeField(w: number, h: number): void {
    if (this.fieldSize[0] === w && this.fieldSize[1] === h) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + LIGHT_FIELD_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.field);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.field, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    this.fieldSize = [w, h];
  }

  private use(f: LightPassFrame): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform2fv(this.at.u_canvas, f.canvas);
    gl.uniform2fv(this.at.u_viewOffset, f.viewOffset);
    gl.uniform2fv(this.at.u_zoom, f.zoom);
    gl.uniform1f(this.at.u_artPerBase, f.artPerBase);
    gl.uniform3fv(this.at.u_weights, f.grade.weights);
    gl.uniform3fv(this.at.u_timeAmbient, TIME_AMBIENT);
    gl.uniform3fv(this.at.u_timeStrength, TIME_STRENGTH);
    gl.bindVertexArray(this.vao);
  }

  drawField(f: LightPassFrame): number {
    const gl = this.gl;
    const [w, h] = [Math.max(1, Math.round(f.canvas[0])), Math.max(1, Math.round(f.canvas[1]))];
    this.sizeField(w, h);
    const count = packLights(f.lights, f.view, f.artTile, f.time, this.packed);
    this.use(f);
    gl.uniform1i(this.at.u_lightCount, count);
    if (count > 0) gl.uniform4fv(this.at.u_lights, this.packed, 0, count * 8);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0 + LIGHT_FIELD_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.field);
    gl.activeTexture(gl.TEXTURE0);
    return 1;
  }

  dispose(): void {
    this.gl.deleteFramebuffer(this.target);
    this.gl.deleteTexture(this.field);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}
