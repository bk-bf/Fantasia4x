import { readFileSync } from 'node:fs';
const m = await import(new URL('../../src/lib/sim-core-pkg/sim_core.js', import.meta.url).href);
m.initSync({ module: readFileSync(new URL('../../src/lib/sim-core-pkg/sim_core_bg.wasm', import.meta.url)) });
const ents = Number(process.argv[2] ?? 2419), W = 1060, H = 1060, ticks = 600, CHUNK = 32;
/** @param {() => unknown} f */
const med = (f) => { f(); const s = []; for (let r = 0; r < 7; r++) { const t = performance.now(); f(); s.push((performance.now() - t) / ticks); } s.sort((a, b) => a - b); return s[3]; };
const w = new m.SimWorld(ents + 16, W, H);
for (let i = 0; i < ents; i++) w.spawn();
const wasm = med(() => w.bench_step(ticks));
const DIRS = [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
const cx = Math.ceil(W / CHUNK);
const tCost = new Float32Array(cx * Math.ceil(H / CHUNK) * CHUNK * CHUNK).fill(1);
/** @param {number} x @param {number} y */
const ti = (x, y) => (((y / CHUNK) | 0) * cx + ((x / CHUNK) | 0)) * CHUNK * CHUNK + (y % CHUNK) * CHUNK + (x % CHUNK);
const make = () => Array.from({ length: ents }, (_, i) => ({ x: (i * 131) % W, y: (i * 197) % H, hunger: 10, fatigue: 0, thirst: 0, hygiene: 0, ncc: 0, dir: i & 7 }));
let mut = make();
const oopMut = med(() => { let cs = 0; for (let t = 0; t < ticks; t++) for (const e of mut) { e.hunger = Math.min(100, e.hunger + 0.1); e.fatigue = Math.min(100, e.fatigue + 0.05); e.thirst = Math.min(100, e.thirst + 0.08); e.hygiene = Math.min(100, e.hygiene + 0.02); const n = e.ncc - 1; if (n <= 0) { const [dx, dy] = DIRS[e.dir]; let nx = e.x + dx, ny = e.y + dy; if (nx < 0 || nx >= W) nx -= 2 * dx; if (ny < 0 || ny >= H) ny -= 2 * dy; e.x = nx; e.y = ny; e.ncc = tCost[ti(nx, ny)]; } else e.ncc = n; cs += e.x + e.hunger; } return cs; });
const oopImm = med(() => { let cs = 0; let es = make(); for (let t = 0; t < ticks; t++) es = es.map((e) => { const n = e.ncc - 1; let nx2; if (n <= 0) { const [dx, dy] = DIRS[e.dir]; let nx = e.x + dx, ny = e.y + dy; if (nx < 0 || nx >= W) nx -= 2 * dx; if (ny < 0 || ny >= H) ny -= 2 * dy; nx2 = { ...e, x: nx, y: ny, ncc: tCost[ti(nx, ny)] }; } else nx2 = { ...e, ncc: n }; nx2.hunger = Math.min(100, e.hunger + 0.1); nx2.fatigue = Math.min(100, e.fatigue + 0.05); nx2.thirst = Math.min(100, e.thirst + 0.08); nx2.hygiene = Math.min(100, e.hygiene + 0.02); cs += nx2.x + nx2.hunger; return nx2; }); return cs; });
console.log(JSON.stringify({ ents, msPerTick: { wasm, jsOopMutable: oopMut, jsOopImmutable: oopImm }, ratios: { 'oopImm/wasm': oopImm / wasm, 'oopMut/wasm': oopMut / wasm } }));
