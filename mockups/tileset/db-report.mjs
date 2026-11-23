import { loadRegistry } from './db-sheet.mjs';
const { DBX, data } = loadRegistry();
const by = {};
let fail = 0;
for (const e of DBX.list) { try { DBX.bake(e); } catch (err) { fail++; console.log('FAIL', e.id, err.message); } }
for (const o of data.objects) {
  const c = by[o.cat] || (by[o.cat] = { total: 0, covered: 0, fresh: 0, skipped: 0, missing: [] });
  const l = DBX.of(o.cat, o.id);
  c.total++;
  if (l.length) { c.covered++; if (l[0].origin === 'new') c.fresh++; } else if (DBX.skipReason(o)) c.skipped++; else c.missing.push(o.id);
}
for (const [k, c] of Object.entries(by)) console.log(k.padEnd(9), `${c.covered}/${c.total}`.padEnd(10), 'new', String(c.fresh).padEnd(5), 'skipped', String(c.skipped).padEnd(4), process.argv.includes('--missing') && c.missing.length < 80 ? c.missing.join(' ') : c.missing.length + ' missing');
console.log('registry entries', DBX.list.length, 'bake failures', fail);
