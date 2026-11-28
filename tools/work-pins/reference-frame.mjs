import { median } from './budgets.mjs';

/** @typedef {import('./browser-session.mjs').Page} Page */
/** @typedef {import('playwright').Browser} Browser */

const VIEWPORT = { width: 1280, height: 800 };
const TILE_PX = 14;
const LAYERS = 2;
const ATLAS_PX = 512;
const WARMUP_FRAMES = 10;

const PAGE = `<!doctype html><html><body style="margin:0;overflow:hidden">
<canvas id="c" width="${VIEWPORT.width}" height="${VIEWPORT.height}"></canvas></body></html>`;

/** @param {{ tile: number, layers: number, atlas: number }} shape */
function installScene({ tile, layers, atlas }) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
  const gl = /** @type {WebGL2RenderingContext} */ (canvas.getContext('webgl2', { antialias: false }));
  const compile = (/** @type {number} */ type, /** @type {string} */ src) => {
    const s = /** @type {WebGLShader} */ (gl.createShader(type));
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const program = /** @type {WebGLProgram} */ (gl.createProgram());
  gl.attachShader(
    program,
    compile(
      gl.VERTEX_SHADER,
      `#version 300 es
      layout(location=0) in vec2 corner;
      layout(location=1) in vec3 cell;
      uniform vec2 view; uniform float tile; uniform float shift;
      out vec2 uv; out float shade;
      void main() {
        vec2 px = (cell.xy + corner) * tile + vec2(shift, 0.0);
        gl_Position = vec4(px / view * 2.0 - 1.0, 0.0, 1.0);
        uv = (mod(cell.xy + cell.z * 7.0, 32.0) + corner) / 32.0;
        shade = 0.5 + 0.5 * fract(cell.z * 0.37);
      }`
    )
  );
  gl.attachShader(
    program,
    compile(
      gl.FRAGMENT_SHADER,
      `#version 300 es
      precision mediump float;
      in vec2 uv; in float shade; uniform sampler2D atlas; out vec4 color;
      void main() {
        vec4 a = texture(atlas, uv);
        vec4 b = texture(atlas, uv.yx);
        color = vec4(mix(a.rgb, b.rgb, 0.5) * shade, 0.6);
      }`
    )
  );
  gl.linkProgram(program);
  gl.useProgram(program);
  const cols = Math.ceil(canvas.width / tile) + 1;
  const rows = Math.ceil(canvas.height / tile);
  const cells = new Float32Array(cols * rows * layers * 3);
  let i = 0;
  for (let l = 0; l < layers; l++)
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        cells[i++] = x;
        cells[i++] = y;
        cells[i++] = l;
      }
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, cells, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);
  const pixels = new Uint8Array(atlas * atlas * 4);
  for (let p = 0; p < pixels.length; p++) pixels[p] = (p * 2654435761) >>> 24;
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, atlas, atlas, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform2f(gl.getUniformLocation(program, 'view'), canvas.width, canvas.height);
  gl.uniform1f(gl.getUniformLocation(program, 'tile'), tile);
  const shift = gl.getUniformLocation(program, 'shift');
  const count = cols * rows * layers;
  let n = 0;
  /** @type {Window & { __referenceFrame?: () => Promise<void> }} */ (window).__referenceFrame = () =>
    new Promise((done) => {
      gl.clearColor(0.1, 0.2, 0.1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(shift, -(n++ % tile));
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      requestAnimationFrame(() => requestAnimationFrame(() => done()));
    });
}

/** @param {import('./browser-session.mjs').CDPSession} cdp */
async function taskMs(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return /** @type {{ value: number }} */ (metrics.find((m) => m.name === 'TaskDuration')).value * 1000;
}

/** @param {Browser} browser @param {number} frames @param {{ tile?: number, layers?: number }} [shape] */
export async function referenceFrame(browser, frames, { tile = TILE_PX, layers = LAYERS } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.setContent(PAGE);
    await page.evaluate(installScene, { tile, layers, atlas: ATLAS_PX });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const step = () =>
      page.evaluate(() => /** @type {Window & { __referenceFrame: () => Promise<void> }} */ (window).__referenceFrame());
    for (let i = 0; i < WARMUP_FRAMES; i++) await step();
    /** @type {number[]} */
    const perFrame = [];
    let last = await taskMs(cdp);
    for (let i = 0; i < frames; i++) {
      await step();
      const now = await taskMs(cdp);
      perFrame.push(now - last);
      last = now;
    }
    return { frames, tile, layers, medianMs: median(perFrame), perFrame };
  } finally {
    await context.close();
  }
}
