import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const EVENTS = ['Ir', 'Dr', 'Dw', 'I1mr', 'D1mr', 'D1mw', 'ILmr', 'DLmr', 'DLmw'];
export const NOISE = { instructions: 0.75, llMisses: 15 };
const PROFILE_FOLDER = /^profile\..+\.out$/;
const PROFILE_FILE = /^\d+\.out$/;
const COUNTS_ARTIFACT = 'codspeed-counts-';
const BASE_RUNS_SEARCHED = 100;

/** @typedef {Record<string, number>} Events */
/** @typedef {Record<string, Events>} Counts */
/** @typedef {{ sha: string, url: string, counts: Counts }} BaseCounts */

/** @param {Events} c */
export const llMisses = (c) => c.ILmr + c.DLmr + c.DLmw;

/** @param {string} text @returns {Counts} */
export function parseProfile(text) {
  /** @type {Counts} */
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

/** @param {string[]} dirs @returns {Counts} */
export function readCounts(dirs) {
  /** @type {Counts} */
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

/** @param {number | undefined} n */
const number = (n) => (n === undefined ? '-' : n.toLocaleString('en-US'));

/** @param {number} base @param {number} head */
const percent = (base, head) => ((head - base) / base) * 100;

/** @param {number | undefined} base @param {number | undefined} head @param {number} digits */
export function change(base, head, digits) {
  if (base === undefined) return 'new';
  if (head === undefined) return 'gone';
  if (base === 0) return head === 0 ? '0%' : 'new';
  const d = percent(base, head);
  return `${d > 0 ? '+' : ''}${d.toFixed(digits)}%`;
}

/** @param {Events | undefined} base @param {Events | undefined} head */
export function verdict(base, head) {
  if (!base) return 'new benchmark';
  if (!head) return 'benchmark gone';
  const ir = percent(base.Ir, head.Ir);
  const work = ir > NOISE.instructions ? '**slower**' : ir < -NOISE.instructions ? '**faster**' : 'within noise';
  const ll = llMisses(base) ? percent(llMisses(base), llMisses(head)) : 0;
  const memory = Math.abs(ll) > NOISE.llMisses ? `, LL misses ${ll > 0 ? 'up' : 'down'} past noise` : '';
  return work + memory;
}

const LEGEND = [
  `- **instructions**: the CPU instructions the benchmark ran. Six runs of the same code on GitHub's runners, on two CPU models, differed by up to 0.65%, so a change within ±${NOISE.instructions}% is noise and a larger one means the code does more or less work.`,
  `- **LL misses**: memory reads and writes that missed every CPU cache and went to RAM. Four runs of the same code differed by up to 12.8%, so only a change past ±${NOISE.llMisses}% means something.`,
  '- **verdict**: slower or faster when the instructions changed past their noise band.'
].join('\n');

/** @param {string} uri */
const benchName = (uri) => `\`${uri.replace(/^tools\/bench\//, '')}\``;

/** @param {Counts} head @param {Counts | null} [base] */
export function countsTable(head, base) {
  const uris = [...new Set([...Object.keys(base ?? {}), ...Object.keys(head)])].sort();
  if (!base)
    return [
      '| benchmark | instructions | LL misses |',
      '|---|---:|---:|',
      ...uris.map((u) => `| ${benchName(u)} | ${number(head[u].Ir)} | ${number(llMisses(head[u]))} |`)
    ].join('\n');
  return [
    '| benchmark | instructions | change | LL misses | change | verdict |',
    '|---|---:|---:|---:|---:|---|',
    ...uris.map((u) => {
      const b = base[u];
      const h = head[u];
      const bl = b && llMisses(b);
      const hl = h && llMisses(h);
      return `| ${benchName(u)} | ${number(h?.Ir)} | ${change(b?.Ir, h?.Ir, 2)} | ${number(hl)} | ${change(bl, hl, 1)} | ${verdict(b, h)} |`;
    })
  ].join('\n');
}

/** @param {Counts} head @param {BaseCounts | null} base */
export function countsReport(head, base) {
  const intro = base
    ? `Exact counts from CodSpeed's profiles; each change is against \`dev\` at \`${base.sha.slice(0, 8)}\` ([run](${base.url})).`
    : "Exact counts from CodSpeed's profiles; no `dev` run has counts to compare against yet.";
  return [intro, '', countsTable(head, base?.counts), '', LEGEND].join('\n');
}

/** @param {string} path @param {string} token @returns {Promise<unknown>} */
async function api(path, token) {
  const res = await fetch(`${process.env.GITHUB_API_URL ?? 'https://api.github.com'}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error(`GET ${path} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** @typedef {{ id: number, name: string, expired: boolean, archive_download_url: string }} Artifact */

/** @param {Artifact} artifact @param {string} token @returns {Promise<{ counts: Counts }>} */
async function artifactJson(artifact, token) {
  const res = await fetch(artifact.archive_download_url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`artifact ${artifact.id} answered ${res.status}`);
  const zip = join(mkdtempSync(join(tmpdir(), 'counts-')), 'counts.zip');
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  return JSON.parse(execFileSync('unzip', ['-p', zip, 'codspeed-counts.json'], { encoding: 'utf8' }));
}

/** @param {{ repo?: string, token?: string, sha?: string }} options @returns {Promise<BaseCounts | null>} */
export async function baseCounts({ repo, token, sha }) {
  if (!repo || !token || !sha) return null;
  const { workflow_runs: runs } = /** @type {{ workflow_runs: { id: number, head_sha: string, html_url: string }[] }} */ (
    await api(`/repos/${repo}/actions/workflows/check.yml/runs?branch=dev&event=push&status=completed&per_page=100`, token)
  );
  const from = runs.findIndex((r) => r.head_sha === sha);
  if (from < 0) return null;
  for (const run of runs.slice(from, from + BASE_RUNS_SEARCHED)) {
    const { artifacts } = /** @type {{ artifacts: Artifact[] }} */ (
      await api(`/repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`, token)
    );
    const latest = artifacts
      .filter((a) => a.name.startsWith(COUNTS_ARTIFACT) && !a.expired)
      .sort((a, b) => b.id - a.id)[0];
    if (latest) return { sha: run.head_sha, url: run.html_url, counts: (await artifactJson(latest, token)).counts };
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
  const counts = readCounts(args);
  if (!Object.keys(counts).length) {
    process.stdout.write(`no CodSpeed profile with benchmark counts under ${args.join(', ')}\n`);
    return;
  }
  if (out) writeFileSync(out, JSON.stringify({ sha: process.env.GITHUB_SHA ?? null, counts }, null, 1));
  let base = null;
  try {
    base = await baseCounts({
      repo: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      sha: process.env.BASE_SHA
    });
  } catch (e) {
    process.stdout.write(`base counts unavailable: ${e instanceof Error ? e.message : e}\n`);
  }
  const report = countsReport(counts, base);
  process.stdout.write(`${report}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Exact counts from CodSpeed's profiles\n\n${report}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
