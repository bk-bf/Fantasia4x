import { chromium } from 'playwright';

const FLAGS = {
  default: [],
  'angle vulkan': [
    '--use-angle=vulkan',
    '--enable-features=Vulkan',
    '--disable-vulkan-surface',
    '--ignore-gpu-blocklist'
  ],
  'angle gl-egl': ['--use-angle=gl-egl', '--ignore-gpu-blocklist'],
  egl: ['--use-gl=egl', '--ignore-gpu-blocklist']
};
const MODES = { 'headless shell': {}, 'new headless': { channel: 'chromium' } };
const DRAWS = 20;
const LAUNCH_TIMEOUT_MS = 120_000;
const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0;
  gl_Position = vec4(p, 0.0, 1.0);
}`;
const FRAGMENT = `#version 300 es
precision highp float;
out vec4 color;
void main() {
  vec2 p = gl_FragCoord.xy;
  float v = 0.0;
  for (int i = 0; i < 64; i++) v += sin(p.x * 0.01 + float(i)) * cos(p.y * 0.01 - float(i));
  color = vec4(v, 0.0, 0.0, 1.0);
}`;

function drawLoop({ draws, vertex, fragment }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 800;
  const gl = canvas.getContext('webgl2');
  if (!gl) return { renderer: 'no WebGL2' };
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment]
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  gl.useProgram(program);
  const pixel = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  sync();
  const start = performance.now();
  for (let i = 0; i < draws; i++) {
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    sync();
  }
  return { renderer, msPerDraw: (performance.now() - start) / draws };
}

async function measure(mode, flags) {
  const browser = await chromium.launch({
    ...MODES[mode],
    headless: true,
    args: ['--no-sandbox', ...FLAGS[flags]],
    timeout: LAUNCH_TIMEOUT_MS
  });
  try {
    const page = await browser.newPage();
    return await page.evaluate(drawLoop, { draws: DRAWS, vertex: VERTEX, fragment: FRAGMENT });
  } finally {
    await browser.close();
  }
}

process.stdout.write('| headless | flags | WebGL2 renderer | ms per draw |\n|---|---|---|---:|\n');
for (const mode of Object.keys(MODES)) {
  for (const flags of Object.keys(FLAGS)) {
    try {
      const { renderer, msPerDraw } = await measure(mode, flags);
      process.stdout.write(`| ${mode} | ${flags} | ${renderer} | ${msPerDraw?.toFixed(2) ?? '-'} |\n`);
    } catch (e) {
      process.stdout.write(`| ${mode} | ${flags} | failed: ${e.message.split('\n')[0]} | - |\n`);
    }
  }
}
