#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { baseCounts, change, countsReport, NOISE } from '../bench/counts.mjs';
import { api, WAIT_MS, waitForCodspeed } from '../bench/codspeed-check.mjs';

const REPO = process.env.GITHUB_REPOSITORY;
const PR = process.env.PR_NUMBER;
const SHA = process.env.HEAD_SHA;
const BASE_SHA = process.env.BASE_SHA;
const NOTES = process.env.WORK_PINS_NOTES;
const WARNINGS = process.env.WARNINGS_NOTES;
const COUNTS = process.env.CODSPEED_COUNTS;
const TPS = process.env.TPS_NOTES;
const CODSPEED_RAN = process.env.CODSPEED_RAN === 'true';
const RUN_URL = `${process.env.GITHUB_SERVER_URL}/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const MARKER = '<!-- f4x-perf-notes -->';
const ROW =
  /^\|\s*(\S+)\s*\|\s*\[``\s*(.+?)\s*``\]\(([^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([+-][\d.]+%)\s*\|/;

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
      '| scenario | total | base | head | change | largest changes |',
      '|---|---|---:|---:|---:|---|',
      ...totals.map((t) => {
        const named = leads
          .filter((r) => t.fn === 'all calls' && r.scenario === t.scenario)
          .map((r) => `\`${r.fn}\` ${r.head > r.base ? '+' : ''}${(r.head - r.base).toLocaleString('en-US')}`)
          .join(', ');
        return `| ${t.scenario} | \`${t.fn}\` | ${t.base} | ${t.head} | ${pct(t)} | ${named} |`;
      }),
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

const run = CODSPEED_RAN ? await waitForCodspeed({ repo: REPO, sha: SHA }) : null;
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

const tps = readJsonl(TPS).at(-1);
const tickWork =
  head && base
    ? Object.keys(head)
        .filter((u) => /::\d+ ticks$/.test(u) && base.counts[u])
        .sort()
        .map((u) => `${u.split('::')[1]} ${change(base.counts[u].Ir, head[u].Ir, 2)}`)
    : [];
const callTotals = notes.flatMap((n) => n.totals).filter((t) => t.fn === 'all calls');
const leads = notes.flatMap((n) => n.top ?? []);
let fasterRounds = 0;
for (let i = 0; tps && i < tps.head.length; i++) if (tps.head[i] < tps.base[i]) fasterRounds += 1;
const net = [
  tps &&
    `ticks per second ${Math.round((tps.ticks * 1000) / tps.baseMs)} → ${Math.round((tps.ticks * 1000) / tps.headMs)}, time per tick ${change(tps.baseMs, tps.headMs, 1)}, head faster in ${fasterRounds} of ${tps.head.length} rounds`,
  tickWork.length && `CPU instructions over the timed ticks: ${tickWork.join(', ')}, noise ±${NOISE.instructions}%`,
  callTotals.length &&
    `work-pin calls: ${callTotals
      .map((t) => {
        const lead = leads.find((r) => r.scenario === t.scenario);
        return `${t.scenario} ${pct(t)}${lead ? `, most in \`${lead.fn}\`` : ''}`;
      })
      .join('; ')}`
].filter(Boolean);

for (const r of rows) warn('CodSpeed', `${r.file} ${r.name}: ${r.base} → ${r.head} (${r.change})`);
for (const t of notes.flatMap((n) => n.totals))
  warn('Work pins', `${t.scenario} ${t.fn}: ${t.base} → ${t.head} (${pct(t)})`);

const hasNews =
  Boolean(head) ||
  Boolean(tps) ||
  rows.length > 0 ||
  notes.some((n) => n.totals.length || n.changed) ||
  warnings.some((n) => n.errors || n.warnings);
const body = [
  MARKER,
  '## Check notes',
  '',
  net.length ? `**Net effect:** ${net.join(' · ')}` : '**Net effect:** no measurement ran on this commit.',
  '',
  'The check job fails on an error, on a warning count past its budget and on a work-pin total past its budget, and the CodSpeed job fails on a regression CodSpeed reports; the `perf change accepted` label lets a budget or a regression through. The exact counts are advisory; CodSpeed\'s estimate is computed from those counts.',
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
