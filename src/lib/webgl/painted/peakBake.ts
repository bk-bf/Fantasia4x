import vertexSource from '../shaders/peakBake.vert.glsl?raw';
import fragmentSource from '../shaders/peakBake.frag.glsl?raw';
import type { ShaderManager } from '../shaders.js';
import { pieceLayout } from './tileset.js';
import { spriteAt, type PaintedPieces } from './manifest.js';
import type { PeakTiles } from './peakTiles.js';

export const PEAK_CHUNK = 512;
export const PEAK_HMAX = 320;
const MARGIN_WINDOW = 340;
const MARGIN_MID = 209;
const MARGIN_FINE = 57;
const MARGIN_TONE = 1;
const FIRST_JUMP = 128;
const SOFT_RADIUS = 3;
const WIDE_RADIUS = 5;
const BLUR_PASSES = 2;
const DRAIN = 2;
const FLOW_STEPS = 24;
const FAN_RADIUS = 4;
const BLUR_DIRS = [
  [1, 0],
  [0, 1]
] as const;

const PASSES = [
  'FOOT',
  'SEED',
  'JUMP',
  'RANGE',
  'BLUR',
  'ROUTE',
  'DOWN',
  'FLOW',
  'CHANNEL',
  'CRAG',
  'TONE',
  'EDGE',
  'PAINT'
] as const;
type Pass = (typeof PASSES)[number];

type Rect = { x: number; y: number; w: number; h: number };

const SAMPLERS = [
  'u_jfa',
  'u_far',
  'u_soft',
  'u_wide',
  'u_crag',
  'u_cell',
  'u_tone',
  'u_edge',
  'u_src',
  'u_foot',
  'u_atlas',
  'u_route',
  'u_down',
  'u_flow',
  'u_chan',
  'u_fan'
] as const;
type Sampler = (typeof SAMPLERS)[number];
const INTEGER: ReadonlySet<Sampler> = new Set(['u_jfa']);

interface PeakBakeArt {
  atlas: WebGLTexture;
  atlasW: number;
  atlasH: number;
  tile: number;
  lift: number;
  pieces: PaintedPieces;
}

export interface PeakJob {
  x0: number;
  y0: number;
  stage: number;
  target: WebGLTexture;
  snow: boolean;
}

interface Target {
  tex: WebGLTexture;
  rect: Rect;
}

export function peakWindow(x0: number, y0: number, lift: number): Rect {
  return {
    x: x0 - MARGIN_WINDOW,
    y: y0 + lift - MARGIN_WINDOW,
    w: PEAK_CHUNK + 2 * MARGIN_WINDOW,
    h: PEAK_CHUNK + PEAK_HMAX + 2 * MARGIN_WINDOW
  };
}

function inset(r: Rect, by: number): Rect {
  return { x: r.x + by, y: r.y + by, w: r.w - 2 * by, h: r.h - 2 * by };
}

const PEAK_STAGES = 8;

function drainRect(mid: Rect): Rect {
  const x = mid.x - (((mid.x % DRAIN) + DRAIN) % DRAIN);
  const y = mid.y - (((mid.y % DRAIN) + DRAIN) % DRAIN);
  return {
    x,
    y,
    w: Math.ceil((mid.x + mid.w - x) / DRAIN),
    h: Math.ceil((mid.y + mid.h - y) / DRAIN)
  };
}

export class PeakBake {
  private readonly gl: WebGL2RenderingContext;
  private readonly art: PeakBakeArt;
  private readonly programs = new Map<Pass, WebGLProgram>();
  private readonly at = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private readonly fbo: WebGLFramebuffer;
  private readonly vao: WebGLVertexArrayObject;
  private readonly quads: WebGLBuffer;
  private readonly far: WebGLTexture;
  private readonly blank: WebGLTexture;
  private readonly blankInt: WebGLTexture;
  private scratch: Record<string, WebGLTexture> | null = null;
  private quadCount = 0;
  private win: Rect = { x: 0, y: 0, w: 0, h: 0 };

  static create(
    gl: WebGL2RenderingContext,
    shaders: ShaderManager,
    art: PeakBakeArt
  ): PeakBake | null {
    if (!gl.getExtension('EXT_color_buffer_float')) {
      console.warn('[peaks] off: float render targets are not supported');
      return null;
    }
    const programs = new Map<Pass, WebGLProgram>();
    for (const pass of PASSES) {
      const head = `#version 300 es\n#define PASS_${pass}\n#define HMAX ${PEAK_HMAX}\n`;
      const name = `peakBake${pass}`;
      const made = shaders.createProgram(name, head + vertexSource, head + fragmentSource);
      const program = shaders.getProgram(name)?.program;
      if (!made.success || !program) {
        console.warn(`[peaks] off: the ${pass} pass did not compile`, made.error);
        return null;
      }
      programs.set(pass, program);
    }
    return new PeakBake(gl, art, programs);
  }

  private constructor(
    gl: WebGL2RenderingContext,
    art: PeakBakeArt,
    programs: Map<Pass, WebGLProgram>
  ) {
    this.gl = gl;
    this.art = art;
    for (const [pass, program] of programs) {
      this.programs.set(pass, program);
      this.at.set(program, new Map());
    }
    this.fbo = gl.createFramebuffer()!;
    this.vao = gl.createVertexArray()!;
    this.quads = gl.createBuffer()!;
    const foot = programs.get('FOOT')!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quads);
    const pos = gl.getAttribLocation(foot, 'a_position');
    const uv = gl.getAttribLocation(foot, 'a_uv');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 16, 0);
    if (uv >= 0) {
      gl.enableVertexAttribArray(uv);
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
    }
    gl.bindVertexArray(null);
    this.far = this.texture();
    this.blank = this.storage(gl.RGBA8, 1, 1);
    this.blankInt = this.storage(gl.RG16I, 1, 1);
    for (const program of programs.values()) {
      gl.useProgram(program);
      SAMPLERS.forEach((name, unit) => gl.uniform1i(this.loc(program, name), unit));
    }
  }

  private texture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private storage(format: number, w: number, h: number): WebGLTexture {
    const gl = this.gl;
    const tex = this.texture();
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, w, h);
    return tex;
  }

  private ensureScratch(): Record<string, WebGLTexture> {
    if (this.scratch) return this.scratch;
    const gl = this.gl;
    const win = peakWindow(0, 0, this.art.lift);
    const midR = inset(win, MARGIN_WINDOW - MARGIN_MID);
    const fineR = inset(win, MARGIN_WINDOW - MARGIN_FINE);
    const drainR = drainRect(midR);
    this.scratch = {
      foot: this.storage(gl.R8, win.w, win.h),
      jfaA: this.storage(gl.RG16I, win.w, win.h),
      jfaB: this.storage(gl.RG16I, win.w, win.h),
      raw: this.storage(gl.R16F, midR.w, midR.h),
      tmp: this.storage(gl.R16F, midR.w, midR.h),
      soft: this.storage(gl.R16F, midR.w, midR.h),
      wide: this.storage(gl.R16F, midR.w, midR.h),
      crag: this.storage(gl.RGBA16F, fineR.w, fineR.h),
      cell: this.storage(gl.RGBA16F, fineR.w, fineR.h),
      tone: this.storage(gl.RGBA16F, fineR.w, fineR.h),
      edge: this.storage(gl.RGBA16F, fineR.w, fineR.h),
      route: this.storage(gl.R32F, drainR.w, drainR.h),
      down: this.storage(gl.R16F, drainR.w, drainR.h),
      flowA: this.storage(gl.R32F, drainR.w, drainR.h),
      flowB: this.storage(gl.R32F, drainR.w, drainR.h),
      chan: this.storage(gl.R16F, drainR.w, drainR.h),
      fan: this.storage(gl.R16F, drainR.w, drainR.h),
      drainTmp: this.storage(gl.R16F, drainR.w, drainR.h)
    };
    return this.scratch;
  }

  releaseScratch(): void {
    if (!this.scratch) return;
    for (const tex of Object.values(this.scratch)) this.gl.deleteTexture(tex);
    this.scratch = null;
  }

  chunkTexture(): WebGLTexture {
    return this.storage(this.gl.RGBA8, PEAK_CHUNK, PEAK_CHUNK);
  }

  private loc(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    const table = this.at.get(program)!;
    if (!table.has(name)) table.set(name, this.gl.getUniformLocation(program, name));
    return table.get(name) ?? null;
  }

  private use(pass: Pass): WebGLProgram {
    const gl = this.gl;
    const program = this.programs.get(pass)!;
    gl.useProgram(program);
    const win = this.win;
    const midR = inset(win, MARGIN_WINDOW - MARGIN_MID);
    const fineR = inset(win, MARGIN_WINDOW - MARGIN_FINE);
    gl.uniform2i(this.loc(program, 'u_origin'), win.x, win.y);
    gl.uniform2i(this.loc(program, 'u_size'), win.w, win.h);
    gl.uniform2i(this.loc(program, 'u_mid'), midR.x, midR.y);
    gl.uniform2i(this.loc(program, 'u_midSize'), midR.w, midR.h);
    gl.uniform2i(this.loc(program, 'u_fine'), fineR.x, fineR.y);
    gl.uniform2i(this.loc(program, 'u_fineSize'), fineR.w, fineR.h);
    const drainR = drainRect(midR);
    gl.uniform2i(this.loc(program, 'u_drain'), drainR.x, drainR.y);
    gl.uniform2i(this.loc(program, 'u_drainSize'), drainR.w, drainR.h);
    gl.uniform1i(this.loc(program, 'u_lift'), this.art.lift);
    return program;
  }

  private bind(textures: Partial<Record<Sampler, WebGLTexture>>): void {
    const gl = this.gl;
    SAMPLERS.forEach((name, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(
        gl.TEXTURE_2D,
        textures[name] ?? (INTEGER.has(name) ? this.blankInt : this.blank)
      );
    });
  }

  private into(program: WebGLProgram, target: Target, region: Rect, extra?: WebGLTexture): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.tex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, extra ?? null, 0);
    gl.drawBuffers(extra ? [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1] : [gl.COLOR_ATTACHMENT0]);
    const x = region.x - target.rect.x;
    const y = region.y - target.rect.y;
    gl.viewport(x, y, region.w, region.h);
    gl.uniform2i(this.loc(program, 'u_at'), target.rect.x, target.rect.y);
  }

  private fill(): void {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  private footQuads(tiles: PeakTiles): void {
    const { tile, lift, pieces, atlasW, atlasH } = this.art;
    const win = this.win;
    const tx0 = Math.floor((win.x - tile) / tile);
    const ty0 = Math.floor((win.y - tile) / tile);
    const tx1 = Math.ceil((win.x + win.w + tile) / tile);
    const ty1 = Math.ceil((win.y + win.h + tile) / tile);
    const out: number[] = [];
    const mass = (x: number, y: number) => tiles.isMass(x, y);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!mass(tx, ty)) continue;
        const s = spriteAt(pieces.layouts[pieceLayout(pieces, mass, tx, ty)], tx, ty);
        const u = Math.round(s.u1 * atlasW);
        const v = Math.round(s.v1 * atlasH);
        const w = Math.round(s.w * tile);
        const h = Math.round(s.h * tile) - lift;
        const x = tx * tile + Math.round(s.ox * tile) - win.x;
        const y = ty * tile + Math.round(s.oy * tile) + lift - win.y;
        out.push(x, y, u, v, x + w, y, u + w, v, x, y + h, u, v + h);
        out.push(x + w, y, u + w, v, x + w, y + h, u + w, v + h, x, y + h, u, v + h);
      }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quads);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.STREAM_DRAW);
    this.quadCount = out.length / 4;
  }

  private uploadFar(tiles: PeakTiles): void {
    const gl = this.gl;
    const { tile } = this.art;
    const win = this.win;
    const fx = Math.floor(win.x / tile) - 1;
    const fy = Math.floor(win.y / tile) - 1;
    const fw = Math.ceil(win.w / tile) + 3;
    const fh = Math.ceil(win.h / tile) + 3;
    gl.bindTexture(gl.TEXTURE_2D, this.far);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      fw,
      fh,
      0,
      gl.RGBA,
      gl.FLOAT,
      tiles.farWindow(fx, fy, fw, fh, tile)
    );
    for (const pass of ['RANGE', 'CRAG', 'TONE'] as const) {
      const program = this.programs.get(pass)!;
      gl.useProgram(program);
      gl.uniform2i(this.loc(program, 'u_farOrigin'), fx, fy);
      gl.uniform2i(this.loc(program, 'u_farSize'), fw, fh);
    }
  }

  step(job: PeakJob, tiles: PeakTiles, mapPx: [number, number]): boolean {
    const gl = this.gl;
    const t = this.ensureScratch();
    this.win = peakWindow(job.x0, job.y0, this.art.lift);
    const win = this.win;
    const midR = inset(win, MARGIN_WINDOW - MARGIN_MID);
    const fineR = inset(win, MARGIN_WINDOW - MARGIN_FINE);
    const drainR = drainRect(midR);
    const W = (tex: WebGLTexture): Target => ({ tex, rect: win });
    const M = (tex: WebGLTexture): Target => ({ tex, rect: midR });
    const F = (tex: WebGLTexture): Target => ({ tex, rect: fineR });
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(this.vao);
    if (job.stage === 0) {
      this.footQuads(tiles);
      this.uploadFar(tiles);
      let p = this.use('FOOT');
      this.into(p, W(t.foot), win);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.bind({ u_atlas: this.art.atlas });
      if (this.quadCount > 0) gl.drawArrays(gl.TRIANGLES, 0, this.quadCount);
      p = this.use('SEED');
      this.into(p, W(t.jfaA), win);
      this.bind({ u_foot: t.foot });
      this.fill();
    } else if (job.stage === 1) {
      let src = t.jfaA;
      let dst = t.jfaB;
      const steps: number[] = [];
      for (let s = FIRST_JUMP; s >= 1; s >>= 1) steps.push(s);
      steps.push(1);
      for (const s of steps) {
        const p = this.use('JUMP');
        this.into(p, W(dst), win);
        gl.uniform1i(this.loc(p, 'u_step'), s);
        this.bind({ u_jfa: src });
        this.fill();
        [src, dst] = [dst, src];
      }
      if (src !== t.jfaA) [t.jfaA, t.jfaB] = [src, dst];
    } else if (job.stage === 2) {
      const p = this.use('RANGE');
      this.into(p, M(t.raw), midR);
      this.bind({ u_jfa: t.jfaA, u_far: this.far });
      this.fill();
      this.blur(t.raw, t.soft, t.tmp, SOFT_RADIUS, midR);
      this.blur(t.soft, t.wide, t.tmp, WIDE_RADIUS, midR);
    } else if (job.stage === 3) {
      const D = (tex: WebGLTexture): Target => ({ tex, rect: drainR });
      let p = this.use('ROUTE');
      this.into(p, D(t.route), drainR);
      this.bind({ u_jfa: t.jfaA, u_soft: t.soft });
      this.fill();
      p = this.use('DOWN');
      this.into(p, D(t.down), drainR);
      this.bind({ u_route: t.route });
      this.fill();
      p = this.use('FLOW');
      this.into(p, D(t.flowA), drainR);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.flow(FLOW_STEPS, drainR);
    } else if (job.stage === 4) {
      this.flow(FLOW_STEPS, drainR);
      const p = this.use('CHANNEL');
      this.into(p, { tex: t.chan, rect: drainR }, drainR);
      this.bind({ u_flow: t.flowA });
      this.fill();
      this.blur(t.chan, t.fan, t.drainTmp, FAN_RADIUS, drainR);
    } else if (job.stage === 5) {
      const p = this.use('CRAG');
      this.into(p, F(t.crag), fineR, t.cell);
      this.bind({ u_jfa: t.jfaA, u_far: this.far, u_soft: t.soft, u_wide: t.wide });
      this.fill();
      this.into(p, F(t.crag), fineR);
    } else if (job.stage === 6) {
      let p = this.use('TONE');
      this.into(p, F(t.tone), inset(fineR, MARGIN_FINE - MARGIN_TONE));
      this.bind({
        u_jfa: t.jfaA,
        u_far: this.far,
        u_soft: t.soft,
        u_crag: t.crag,
        u_cell: t.cell,
        u_chan: t.chan,
        u_fan: t.fan
      });
      gl.uniform1i(this.loc(p, 'u_snow'), job.snow ? 1 : 0);
      this.fill();
      p = this.use('EDGE');
      this.into(p, F(t.edge), inset(fineR, MARGIN_FINE));
      this.bind({ u_jfa: t.jfaA, u_tone: t.tone });
      this.fill();
    } else {
      const p = this.use('PAINT');
      const rect = { x: job.x0, y: job.y0, w: PEAK_CHUNK, h: PEAK_CHUNK };
      this.into(p, { tex: job.target, rect }, rect);
      gl.uniform2i(this.loc(p, 'u_chunk'), job.x0, job.y0);
      gl.uniform2i(this.loc(p, 'u_mapPx'), mapPx[0], mapPx[1]);
      this.bind({ u_jfa: t.jfaA, u_crag: t.crag, u_edge: t.edge, u_cell: t.cell, u_tone: t.tone });
      this.fill();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    job.stage++;
    return job.stage >= PEAK_STAGES;
  }

  private flow(steps: number, region: Rect): void {
    const t = this.scratch!;
    for (let i = 0; i < steps; i++) {
      const p = this.use('FLOW');
      this.into(p, { tex: t.flowB, rect: region }, region);
      this.bind({ u_route: t.route, u_down: t.down, u_flow: t.flowA });
      this.fill();
      [t.flowA, t.flowB] = [t.flowB, t.flowA];
    }
  }

  private blur(
    src: WebGLTexture,
    out: WebGLTexture,
    tmp: WebGLTexture,
    radius: number,
    region: Rect
  ): void {
    let from = src;
    for (let i = 0; i < BLUR_PASSES; i++) {
      for (const dir of BLUR_DIRS) {
        const to = dir[0] === 1 ? tmp : out;
        const p = this.use('BLUR');
        this.into(p, { tex: to, rect: region }, region);
        this.gl.uniform2i(this.loc(p, 'u_dir'), dir[0], dir[1]);
        this.gl.uniform1i(this.loc(p, 'u_radius'), radius);
        this.gl.uniform2i(this.loc(p, 'u_blurSize'), region.w, region.h);
        this.bind({ u_src: from });
        this.fill();
        from = to;
      }
    }
  }

  dispose(): void {
    const gl = this.gl;
    this.releaseScratch();
    gl.deleteTexture(this.far);
    gl.deleteTexture(this.blank);
    gl.deleteTexture(this.blankInt);
    gl.deleteFramebuffer(this.fbo);
    gl.deleteBuffer(this.quads);
    gl.deleteVertexArray(this.vao);
    for (const p of this.programs.values()) gl.deleteProgram(p);
  }
}
