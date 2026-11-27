import { readFile, writeFile } from 'node:fs/promises';
import { config, typedEnd } from './timing.mjs';
const root = new URL('..', import.meta.url).pathname;
const shots = JSON.parse(await readFile(root + 'shots.json', 'utf8'));
const cps = 22, lead = 0.6, hold = 1.5, tail = 0.3;
let t = 0;
const lines = [], narration = [];
for (const s of shots.shots) {
  const start = +(t + lead).toFixed(3), shotEnd = t + s.durationSec;
  const [l] = config({ charsPerSecond: cps, lines: [{ start, end: shotEnd, text: s.narration }] }).lines;
  const typing = typedEnd(l);
  const end = +Math.min(typing + hold, shotEnd - tail).toFixed(3);
  if (typing + hold > shotEnd - tail) console.error(`${s.id}: typing ends ${typing.toFixed(2)}, shot ends ${shotEnd}, hold only ${(end - typing).toFixed(2)}`);
  lines.push({ start, end, text: s.narration });
  narration.push({ shot: s.id, start, end, typingEnd: +typing.toFixed(3), text: s.narration });
  t = shotEnd;
}
await writeFile(root + 'lines.json', JSON.stringify({ charsPerSecond: cps, duration: t, lines }, null, 1) + '\n');
await writeFile(root + 'narration.json', JSON.stringify(narration, null, 1) + '\n');
console.log(narration.map(n => `${n.shot} ${n.start}-${n.end} typed ${n.typingEnd}`).join('\n'));
