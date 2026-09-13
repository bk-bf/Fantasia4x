#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { baseCounts, countsReport } from '../bench/counts.mjs';

const API = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const REPO = process.env.GITHUB_REPOSITORY;
const PR = process.env.PR_NUMBER;
const SHA = process.env.HEAD_SHA;
const BASE_SHA = process.env.BASE_SHA;
const NOTES = process.env.WORK_PINS_NOTES;
const WARNINGS = process.env.WARNINGS_NOTES;
const COUNTS = process.env.CODSPEED_COUNTS;
const CODSPEED_RAN = process.env.CODSPEED_RAN === 'true';
const RUN_URL = `${process.env.GITHUB_SERVER_URL}/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const MARKER = '<!-- f4x-perf-notes -->';
const CODSPEED = 'CodSpeed Performance Analysis';
const WAIT_MS = 10 * 60_000;
const POLL_MS = 15_000;
const ROW =
  /^\|\s*(\S+)\s*\|\s*\[``\s*(.+?)\s*``\]\(([^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([+-][\d.]+%)\s*\|/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? {} : res.json();
}

async function codspeedRun() {
  if (!CODSPEED_RAN) return null;
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    const found = await api(
      'GET',
      `/repos/${REPO}/commits/${SHA}/check-runs?check_name=${encodeURIComponent(CODSPEED)}`
    );
    const run = (found.check_runs ?? []).find((r) => r.status === 'completed');
    if (run) return run;
    await sleep(POLL_MS);
  }
  return null;
}

function benchFile(url) {
  try {
    return (new URL(url).searchParams.get('uri') ?? '').split('::')[0];
  } catch {
    return '';
  }
}

function codspeedRows(run) {
  return (run?.output?.summary ?? '')
    .split('\n')
    .map((line) => line.match(ROW))
    .filter(Boolean)
    .map(([, mark, name, url, base, head, change]) => ({ mark, name, file: benchFile(url), base, head, change }));
}

function readJsonl(path) {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const headCounts = () => (COUNTS && existsSync(COUNTS) ? JSON.parse(readFileSync(COUNTS, 'utf8')).counts : null);

const escapeData = (s) => s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const warn = (title, text) => process.stdout.write(`::warning title=${title}::${escapeData(text)}\n`);
const html = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function pct(t) {
  if (t.base === 0) return 'new';
  const d = ((t.head - t.base) / t.base) * 100;
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
}

function warningsSection(notes) {
  if (!notes.length) return 'Warnings: no report from the check job.';
  const lines = [
    "Warnings from `svelte-check` and `eslint`, and type errors from `tsc` over `tools/`; the check job's summary on the run page lists every one by rule:",
    '',
    '| tool | errors | warnings | budget | most common |',
    '|---|---:|---:|---:|---|',
    ...notes.map(
      (n) =>
        `| ${n.tool} | ${n.errors} | ${n.warnings} | ${n.budget} | ${n.rules
          .slice(0, 3)
          .map((r) => `\`${r.rule}\` ${r.count}`)
          .join(', ')} |`
    )
  ];
  const flagged = notes.flatMap((n) => n.annotate);
  if (flagged.length)
    lines.push(
      '',
      'Errors, and warnings in files this pull request touches:',
      '',
      ...flagged.map((a) => `- \`${a.file}:${a.line}\` ${a.tool} ${a.severity} \`${a.rule}\`: ${html(a.message)}`)
    );
  return lines.join('\n');
}

function codspeedSection(run, rows) {
  if (!CODSPEED_RAN) return 'CodSpeed: not run, because no game or bench file changed.';
  if (!run) return `CodSpeed had not reported on \`${SHA.slice(0, 8)}\` after ${WAIT_MS / 60_000} minutes.`;
  if (!rows.length) return `CodSpeed: no benchmark changed on \`${SHA.slice(0, 8)}\`.`;
  return [
    `CodSpeed on \`${SHA.slice(0, 8)}\`, [${run.output?.title ?? 'report'}](${run.details_url}):`,
    '',
    '| | benchmark | base | head | change |',
    '|---|---|---:|---:|---:|',
    ...rows.map((r) => `| ${r.mark} | \`${r.file}\` ${r.name} | ${r.base} | ${r.head} | ${r.change} |`)
  ].join('\n');
}

const countsSection = (head, base) =>
  head ? countsReport(head, base) : 'Exact counts: this run left no CodSpeed profile.';

function workPinsSection(notes) {
  const totals = notes.flatMap((n) => n.totals);
  const changed = notes.reduce((s, n) => s + n.changed, 0);
  if (!notes.length) return 'Work pins: no report from the check job.';
  if (!totals.length && !changed) return 'Work pins: no call count changed.';
  const lines = [];
  if (totals.length)
    lines.push(
      'Work pins, totals that changed:',
      '',
      '| scenario | total | base | head | change |',
      '|---|---|---:|---:|---:|',
      ...totals.map((t) => `| ${t.scenario} | \`${t.fn}\` | ${t.base} | ${t.head} | ${pct(t)} |`),
      ''
    );
  if (changed) lines.push(`${changed} per-function count(s) changed; the check job's summary lists them.`);
  return lines.join('\n');
}

async function upsert(body, hasNews) {
  const comments = await api('GET', `/repos/${REPO}/issues/${PR}/comments?per_page=100`);
  const mine = comments.find((c) => c.body?.startsWith(MARKER));
  if (mine) return api('PATCH', `/repos/${REPO}/issues/comments/${mine.id}`, { body });
  if (hasNews) return api('POST', `/repos/${REPO}/issues/${PR}/comments`, { body });
  return null;
}

const run = await codspeedRun();
const rows = codspeedRows(run);
const notes = readJsonl(NOTES);
const warnings = readJsonl(WARNINGS);
const head = headCounts();
let base = null;
try {
  base = head ? await baseCounts({ repo: REPO, token: process.env.GITHUB_TOKEN, sha: BASE_SHA }) : null;
} catch (e) {
  process.stdout.write(`base counts unavailable: ${e.message}\n`);
}

for (const r of rows) warn('CodSpeed', `${r.file} ${r.name}: ${r.base} → ${r.head} (${r.change})`);
for (const t of notes.flatMap((n) => n.totals))
  warn('Work pins', `${t.scenario} ${t.fn}: ${t.base} → ${t.head} (${pct(t)})`);

const hasNews =
  Boolean(head) ||
  rows.length > 0 ||
  notes.some((n) => n.totals.length || n.changed) ||
  warnings.some((n) => n.errors || n.warnings);
const body = [
  MARKER,
  '## Check notes',
  '',
  'The check job fails on an error, on a warning count past its budget and on a work-pin total past its budget. CodSpeed and the exact counts are advisory; CodSpeed\'s estimate is computed from those counts.',
  '',
  warningsSection(warnings),
  '',
  codspeedSection(run, rows),
  '',
  countsSection(head, base),
  '',
  workPinsSection(notes),
  '',
  `[This run](${RUN_URL})`
].join('\n');

process.stdout.write(`${body}\n`);
await upsert(body, hasNews);
