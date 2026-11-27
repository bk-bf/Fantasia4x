import type { GlStencilFace, Webgl2Pipeline } from './pipeline.js';

const STENCIL_MASK = 0xff;

export class Webgl2State {
  private program: WebGLProgram | null = null;
  private blendOn: boolean | null = null;
  private blendFuncs: readonly number[] | null = null;
  private depthOn: boolean | null = null;
  private depthFunc: number | null = null;
  private depthWrite: boolean | null = null;
  private stencil: Webgl2Pipeline['stencil'] = null;
  private stencilOn: boolean | null = null;
  private stencilKey = '';
  private reference = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {}

  use(program: WebGLProgram): void {
    if (program === this.program) return;
    this.gl.useProgram(program);
    this.program = program;
  }

  apply(p: Webgl2Pipeline): void {
    const gl = this.gl;
    this.use(p.program);
    this.toggle(gl.BLEND, p.blend !== null, this.blendOn);
    this.blendOn = p.blend !== null;
    if (p.blend && !sameFuncs(p.blend, this.blendFuncs)) {
      gl.blendFuncSeparate(p.blend[0], p.blend[1], p.blend[2], p.blend[3]);
      this.blendFuncs = p.blend;
    }
    this.toggle(gl.STENCIL_TEST, p.stencil !== null, this.stencilOn);
    this.stencilOn = p.stencil !== null;
    this.stencil = p.stencil;
    this.applyStencil();
    this.toggle(gl.DEPTH_TEST, p.depth !== null, this.depthOn);
    this.depthOn = p.depth !== null;
    if (!p.depth) return;
    if (p.depth.func !== this.depthFunc) {
      gl.depthFunc(p.depth.func);
      this.depthFunc = p.depth.func;
    }
    if (p.depth.write !== this.depthWrite) {
      gl.depthMask(p.depth.write);
      this.depthWrite = p.depth.write;
    }
  }

  setStencilReference(reference: number): void {
    this.reference = reference;
    this.applyStencil();
  }

  private applyStencil(): void {
    const s = this.stencil;
    if (!s) return;
    const key = `${s.front.func},${s.front.passOp},${s.back.func},${s.back.passOp},${this.reference}`;
    if (key === this.stencilKey) return;
    this.stencilKey = key;
    const gl = this.gl;
    const face = (side: number, f: GlStencilFace) => {
      gl.stencilFuncSeparate(side, f.func, this.reference, STENCIL_MASK);
      gl.stencilOpSeparate(side, gl.KEEP, gl.KEEP, f.passOp);
    };
    face(gl.FRONT, s.front);
    face(gl.BACK, s.back);
  }

  allowDepthWrite(): void {
    if (this.depthWrite === true) return;
    this.gl.depthMask(true);
    this.depthWrite = true;
  }

  private toggle(cap: number, on: boolean, was: boolean | null): void {
    if (on === was) return;
    if (on) this.gl.enable(cap);
    else this.gl.disable(cap);
  }
}

function sameFuncs(a: readonly number[], b: readonly number[] | null): boolean {
  return b !== null && a.every((f, i) => f === b[i]);
}
