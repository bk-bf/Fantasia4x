#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';

const API = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const REPO = process.env.GITHUB_REPOSITORY;
const PR = process.env.PR_NUMBER;
const SHA = process.env.HEAD_SHA;
const NOTES = process.env.WORK_PINS_NOTES;
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

function readNotes() {
  if (!NOTES || !existsSync(NOTES)) return [];
  return readFileSync(NOTES, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const escapeData = (s) => s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const warn = (title, text) => process.stdout.write(`::warning title=${title}::${escapeData(text)}\n`);

function pct(t) {
  if (t.base === 0) return 'new';
  const d = ((t.head - t.base) / t.base) * 100;
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
}

function codspeedSection(run, rows) {
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
const notes = readNotes();

for (const r of rows) warn('CodSpeed', `${r.file} ${r.name}: ${r.base} → ${r.head} (${r.change})`);
for (const t of notes.flatMap((n) => n.totals))
  warn('Work pins', `${t.scenario} ${t.fn}: ${t.base} → ${t.head} (${pct(t)})`);

const hasNews = rows.length > 0 || notes.some((n) => n.totals.length || n.changed);
const body = [
  MARKER,
  '## Performance notes',
  '',
  'Advisory: `check` fails only on work-pin totals that grow past their budget. CodSpeed is not gated, ' +
    'and its tick benchmarks have moved by up to 3% on pull requests whose call counts were identical.',
  '',
  codspeedSection(run, rows),
  '',
  workPinsSection(notes),
  '',
  `[This run](${RUN_URL})`
].join('\n');

process.stdout.write(`${body}\n`);
await upsert(body, hasNews);
