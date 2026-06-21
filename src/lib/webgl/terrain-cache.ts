/* filepath: src/lib/webgl/terrain-cache.ts */
/**
 * Terrain FBO cache — "freeze the heavy layer while paused, keep the light layers live".
 *
 * The terrain pass is the fillrate-heavy part of a frame: a complex fragment shader (atlas sample +
 * 4× outline taps + lighting) runs for EVERY screen pixel, every frame — fine while the world is
 * changing, pure waste while it's static. When the game is PAUSED the map + entities don't move, but
 * the player still wants the light overlays to breathe (weather — a separate canvas; status anims +
 * selection — the sparse glyph overlays, redrawn live). So while paused we render the terrain ONCE
 * into a viewport-sized FBO texture and then each frame just blit that texture (1 sample/pixel)
 * instead of re-running the terrain shader; the entity overlays still draw live on top.
 *
 * The cache is invalidated by anything that changes the terrain image — camera pan/zoom, a terrain
 * content change, or a canvas resize — so a pan while paused re-captures, and a static view reuses.
 * It's viewport-resolution (≈20MB at 4K), so it's pixel-identical to the direct render and tiny in
 * memory (NOT a whole-map texture). The one cosmetic cost: glow/fire-flicker is baked into the terrain
 * pass, so it freezes in the cached image while paused (a frozen moment — arguably fine).
 *
 * Gated on paused in the renderer, so RUNNING play never touches this path.
 */

const VERT_SRC = `#version 300 es
in vec2 a_pos;        // fullscreen clip-space quad (-1..1)
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 fragColor;
void main() { fragColor = texture(u_tex, v_uv); }`;

export class TerrainCache {
  private gl: WebGL2RenderingContext;
  private fbo: WebGLFramebuffer | null = null;
  private texture: WebGLTexture | null = null;
  private program: WebGLProgram | null = null;
  private uTex: WebGLUniformLocation | null = null;
  private aPos = -1;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private w = 0;
  private h = 0;
  /** Whether the cached texture currently holds a valid capture (else the caller must re-capture). */
  private valid = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.initProgram();
    this.initQuad();
  }

  private initProgram(): void {
    const gl = this.gl;
    const vs = this.compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('❌ Terrain-cache shader link failed:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }
    this.program = program;
    this.uTex = gl.getUniformLocation(program, 'u_tex');
    this.aPos = gl.getAttribLocation(program, 'a_pos');
  }

  private compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl;
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('❌ Terrain-cache shader compile failed:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  private initQuad(): void {
    const gl = this.gl;
    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    // Two triangles covering clip space (-1..1).
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** (Re)allocate the FBO colour texture to the current viewport size. Invalidates the cache. */
  private ensureSize(w: number, h: number): void {
    if (this.w === w && this.h === h && this.fbo && this.texture) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    if (!this.texture) this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (!this.fbo) this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.valid = false;
  }

  /** Force a re-capture on the next frame (camera/terrain/resize change). */
  invalidate(): void {
    this.valid = false;
  }

  isValid(): boolean {
    return this.valid && this.program !== null;
  }

  /**
   * Bind the FBO (sized to w×h) and clear it, so the caller can render the terrain pass into it.
   * Pair with endCapture(). Returns false if the program failed (caller should render directly).
   */
  beginCapture(w: number, h: number): boolean {
    if (!this.program) return false;
    const gl = this.gl;
    this.ensureSize(w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.173, 0.094, 0.063, 1.0); // match WebGLStateManager.clear() (#2c1810) for off-map areas
    gl.clear(gl.COLOR_BUFFER_BIT);
    return true;
  }

  /** Unbind the FBO (back to the default framebuffer) + restore the viewport. Marks the cache valid. */
  endCapture(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    this.valid = true;
  }

  /**
   * Blit the cached terrain texture to the default framebuffer as a fullscreen quad (1 sample/pixel).
   * No projection/flip needed: the FBO was rendered in the same NDC orientation we sample it in.
   */
  draw(): void {
    if (!this.program || !this.valid) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uTex, 0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.program) gl.deleteProgram(this.program);
    this.fbo = null;
    this.texture = null;
    this.vbo = null;
    this.vao = null;
    this.program = null;
    this.valid = false;
  }
}
