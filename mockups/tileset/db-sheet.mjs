import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
export const SCRIPTS = ['gfx.js', 'mat.js', 'world.js', 'flora.js', 'build.js', 'actors.js', 'scene.js', 'db-core.js', 'db-mockup.js', 'db-flora.js', 'db-creatures.js', 'db-buildings.js', 'db-ground.js', 'db-folk.js', 'db-items.js', 'db-hd.js', 'db-tools.js', 'db-weapons.js', 'db-gear.js', 'db-goods.js', 'db-armor.js', 'db-rare.js', 'db-rot.js', 'db-stations.js', 'db-facings.js'];

export function loadRegistry() {
  let src = '';
  for (const f of SCRIPTS) { try { src += readFileSync(join(here, f), 'utf8') + '\n;'; } catch { continue; } }
  const data = JSON.parse(readFileSync(join(here, 'catalog-data.json'), 'utf8'));
  const DBX = new Function('DATA', src + '\nif (typeof DBX.fromData === "function") DBX.fromData(DATA);\nreturn DBX;')(data.objects);
  return { DBX, data };
}

export function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'ascii'); d.copy(b, 8); b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const FONT = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || '1']; }));
  const { DBX, data } = loadRegistry();
  const re = new RegExp(args.match || '.'), scale = +(args.scale || 3), season = args.season || 'summer', mode = args.mode || 'scene';
  const names = Object.fromEntries(data.objects.map(o => [o.cat + '/' + o.id, o.name]));
  let entries = DBX.list.filter(e => re.test(e.id));
  if (!args.all) { const seen = new Set(); entries = entries.filter(e => { const k = e.cat + '/' + e.dbId; if (seen.has(k)) return false; seen.add(k); return true; }).map(e => DBX.pick(e.cat, e.dbId, season)); }
  if (args.origin) entries = entries.filter(e => e.origin === args.origin);
  const cells = entries.map(e => { try { return mode === 'bake' ? DBX.bake(e) : DBX.scene(e, season, args.ground); } catch (err) { console.error('FAIL', e.id, err.message); return null; } });
  const live = entries.map((e, i) => [e, cells[i]]).filter(p => p[1]);
  const cols = +(args.cols || Math.ceil(Math.sqrt(live.length * 1.6))), pad = 4, bg = mode === 'bake' ? (args.bg || '#3b5a2c') : (args.bg || '#17141d');
  const bgc = [parseInt(bg.slice(1, 3), 16), parseInt(bg.slice(3, 5), 16), parseInt(bg.slice(5, 7), 16)];
  const rows = [];
  for (let i = 0; i < live.length; i += cols) rows.push(live.slice(i, i + cols));
  const colW = [], rowH = rows.map(r => Math.max(...r.map(p => p[1].h)) + 8);
  for (let c = 0; c < cols; c++) colW.push(Math.max(8, ...rows.map(r => r[c] ? r[c][1].w : 0)));
  const W = colW.reduce((a, b) => a + b + pad, pad), H = rowH.reduce((a, b) => a + b + pad, pad);
  const img = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { img[i * 4] = bgc[0]; img[i * 4 + 1] = bgc[1]; img[i * 4 + 2] = bgc[2]; img[i * 4 + 3] = 255; }
  let n = 0, y0 = pad;
  rows.forEach((r, ri) => {
    let x0 = pad;
    r.forEach((p, ci) => {
      const b = p[1], dy = rowH[ri] - b.h;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const s = (y * b.w + x) * 4; if (!b.rgba[s + 3]) continue; const d = ((y0 + dy + y) * W + x0 + x) * 4; img[d] = b.rgba[s]; img[d + 1] = b.rgba[s + 1]; img[d + 2] = b.rgba[s + 2]; }
      String(n).split('').forEach((ch, k) => { const g = FONT[ch]; for (let j = 0; j < 15; j++) if (g[j] === '1') { const d = ((y0 + 1 + ((j / 3) | 0)) * W + x0 + 1 + k * 4 + (j % 3)) * 4; img[d] = 255; img[d + 1] = 232; img[d + 2] = 120; } });
      console.log(n++, p[0].id, names[p[0].cat + '/' + p[0].dbId] || p[0].extra || '', b.w + 'x' + b.h, mode === 'bake' ? `ox ${b.ox} oy ${b.oy}` : '');
      x0 += colW[ci] + pad;
    });
    y0 += rowH[ri] + pad;
  });
  const big = new Uint8ClampedArray(W * scale * H * scale * 4);
  for (let y = 0; y < H * scale; y++) for (let x = 0; x < W * scale; x++) { const s = (((y / scale) | 0) * W + ((x / scale) | 0)) * 4, d = (y * W * scale + x) * 4; big[d] = img[s]; big[d + 1] = img[s + 1]; big[d + 2] = img[s + 2]; big[d + 3] = 255; }
  const out = args.out || join(here, 'db-sheet.png');
  writeFileSync(out, png(W * scale, H * scale, big));
  console.log(out, W * scale + 'x' + H * scale, live.length, 'of', DBX.list.length, 'entries');
}
