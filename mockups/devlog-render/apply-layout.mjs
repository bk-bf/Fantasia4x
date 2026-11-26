import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.MOCKUPS || 'http://ubuntuserver:8794';
const want = process.argv[2];
const dir = new URL('layouts/', import.meta.url).pathname;
const { threads } = await (await fetch(`${BASE}/_comments/api/fantasia4x-devlog-render`)).json();
const latest = new Map();
for (const t of threads) for (const m of t.messages) {
  const r = m.body.match(/^layout ([\w-]+)\n```json\n([\s\S]*)\n```\s*$/);
  if (!r || (want && want !== r[1] && want !== t.id)) continue;
  if (!latest.has(r[1]) || latest.get(r[1]).at <= m.at) latest.set(r[1], { json: r[2], thread: t.id, at: m.at });
}
if (!latest.size) { console.error(`no saved layout${want ? ' for ' + want : ''}`); process.exit(1); }
mkdirSync(dir, { recursive: true });
for (const [v, { json, thread, at }] of latest) {
  const L = JSON.parse(json);
  if (L.v !== v) throw new Error(`thread ${thread}: layout says ${L.v}, comment says ${v}`);
  writeFileSync(`${dir}${v}.json`, JSON.stringify(L, null, 1) + '\n');
  console.log(`layouts/${v}.json from thread ${thread} (${new Date(at * 1000).toISOString()})`);
}
console.log(`next: THUMBS=${[...latest.keys()].join(',')} node check-pixels.mjs --write`);
