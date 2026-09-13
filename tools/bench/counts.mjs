// @ts-nocheck
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const EVENTS = ['Ir', 'Dr', 'Dw', 'I1mr', 'D1mr', 'D1mw', 'ILmr', 'DLmr', 'DLmw'];
const PROFILE_FOLDER = /^profile\..+\.out$/;
const PROFILE_FILE = /^\d+\.out$/;

export const llMisses = (c) => c.ILmr + c.DLmr + c.DLmw;

export function parseProfile(text) {
  const counts = {};
  for (const part of text.split(/^part: \d+$/m)) {
    const desc = part.match(/^desc: Trigger: Client Request: (.+)$/m);
    const events = part.match(/^events: (.+)$/m);
    const totals = part.match(/^totals: (.+)$/m);
    if (!desc || !events || !totals) continue;
    const uri = desc[1].trim();
    if (uri.startsWith('Metadata:')) continue;
    const names = events[1].trim().split(/\s+/);
    const values = totals[1].trim().split(/\s+/).map(Number);
    counts[uri] = Object.fromEntries(EVENTS.map((e) => [e, values[names.indexOf(e)] ?? 0]));
  }
  return counts;
}

export function readCounts(dirs) {
  const counts = {};
  for (const dir of dirs) {
    const folders = PROFILE_FOLDER.test(basename(dir))
      ? [dir]
      : readdirSync(dir).filter((n) => PROFILE_FOLDER.test(n)).map((n) => join(dir, n));
    for (const folder of folders)
      for (const name of readdirSync(folder).filter((n) => PROFILE_FILE.test(n)))
        Object.assign(counts, parseProfile(readFileSync(join(folder, name), 'utf8')));
  }
  return counts;
}

const number = (n) => (n === undefined ? '-' : n.toLocaleString('en-US'));

function change(base, head) {
  if (base === undefined) return 'new';
  if (head === undefined) return 'gone';
  if (base === 0) return head === 0 ? '0.000%' : 'new';
  const d = ((head - base) / base) * 100;
  return `${d > 0 ? '+' : ''}${d.toFixed(3)}%`;
}

export function countsTable(head, base) {
  const uris = [...new Set([...Object.keys(base ?? {}), ...Object.keys(head)])].sort();
  const name = (uri) => `\`${uri.replace(/^tools\/bench\//, '')}\``;
  if (!base)
    return [
      '| benchmark | instructions | LL misses |',
      '|---|---:|---:|',
      ...uris.map((u) => `| ${name(u)} | ${number(head[u].Ir)} | ${number(llMisses(head[u]))} |`)
    ].join('\n');
  return [
    '| benchmark | instructions, base | instructions, head | change | LL misses, base | LL misses, head | change |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...uris.map((u) => {
      const b = base[u];
      const h = head[u];
      const bl = b && llMisses(b);
      const hl = h && llMisses(h);
      return `| ${name(u)} | ${number(b?.Ir)} | ${number(h?.Ir)} | ${change(b?.Ir, h?.Ir)} | ${number(bl)} | ${number(hl)} | ${change(bl, hl)} |`;
    })
  ].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
  const counts = readCounts(args);
  if (!Object.keys(counts).length) {
    process.stdout.write(`no CodSpeed profile with benchmark counts under ${args.join(', ')}\n`);
    return;
  }
  const table = countsTable(counts);
  process.stdout.write(`${table}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Exact counts from CodSpeed's profiles\n\n${table}\n`);
  if (out) writeFileSync(out, JSON.stringify({ sha: process.env.GITHUB_SHA ?? null, counts }, null, 1));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
