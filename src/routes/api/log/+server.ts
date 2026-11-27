import { mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadavg, freemem, totalmem } from 'node:os';
import { appendToLog, logDir } from '$lib/server/logFiles';
import type { RequestHandler } from './$types';

const CATEGORY_RE = /^[a-z][a-z0-9_]*$/;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function logStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

const SESSION_LINE = /^\[T\d+\] \[\w+\] session /;

function readSys(path: string): string {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return '-';
  }
}

function powerState(): string {
  let power = '-';
  try {
    const supplies = readdirSync('/sys/class/power_supply').filter((d) => d.startsWith('BAT'));
    if (supplies.length) power = readSys(`/sys/class/power_supply/${supplies[0]}/status`);
  } catch {
    power = '-';
  }
  return [
    `power=${power}`,
    `profile=${readSys('/sys/firmware/acpi/platform_profile')}`,
    `governor=${readSys('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor')}`
  ].join(' ');
}

let lastPower = '';

function hostState(): string {
  const gib = (b: number) => (b / 2 ** 30).toFixed(1);
  return [
    powerState(),
    `load=${loadavg().map((l) => l.toFixed(2)).join('/')}`,
    `freeGb=${gib(freemem())}/${gib(totalmem())}`
  ].join(' ');
}

export const POST: RequestHandler = async ({ request }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 204 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }
  const entries = (body as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return new Response('bad request', { status: 400 });

  const buckets = new Map<string, string[]>();
  const stamp = logStamp(new Date());
  for (const e of entries) {
    if (typeof e !== 'object' || e === null) continue;
    const cat = (e as { category?: unknown }).category;
    const line = (e as { line?: unknown }).line;
    if (typeof cat !== 'string' || !CATEGORY_RE.test(cat)) continue;
    if (typeof line !== 'string' || line.length === 0 || line.length > 2048) continue;
    const safe = line.replace(/[\r\n]/g, '↵');
    let bucket = buckets.get(cat);
    if (!bucket) buckets.set(cat, (bucket = []));
    bucket.push(`${stamp} ${safe}${SESSION_LINE.test(safe) ? ` ${hostState()}` : ''}`);
  }
  if (buckets.size === 0) return new Response(null, { status: 204 });

  const perf = buckets.get('perf');
  if (perf) {
    const power = powerState();
    if (lastPower && power !== lastPower) perf.unshift(`${stamp} host ${power}`);
    lastPower = power;
  }

  const dir = logDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  for (const [cat, lines] of buckets) appendToLog(join(dir, `${cat}.log`), lines);

  return new Response(null, { status: 204 });
};
