#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const URL_BASE = process.env.CI_STATS_URL || 'https://dashboard.callmedaddy.dedyn.io/api/ci/stats';

/** @param {string} name @param {string} fallback */
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const origin = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
const repo = arg('repo', origin.replace(/^.*github\.com[:/]/, '').replace(/\.git$/, ''));
const query = new URLSearchParams({ repo, days: arg('days', '14') });
const workflow = arg('workflow', '');
if (workflow) query.set('workflow', workflow);

const response = await fetch(`${URL_BASE}?${query}`);
if (!response.ok) {
  process.stderr.write(`ci:stats: ${URL_BASE} answered ${response.status}\n`);
  process.exit(2);
}
const d = await response.json();
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(d, null, 2) + '\n');
  process.exit(0);
}
if (!d.repo) {
  process.stderr.write(
    `ci:stats: ${d.building ? 'the dashboard is still recording runs' : 'no runs recorded'}\n`
  );
  process.exit(1);
}

/** @param {number | null | undefined} sec */
const t = (sec) => {
  if (sec == null) return '—';
  const s = Math.round(sec);
  if (s >= 3600)
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
};
/** @param {string} label @param {string} value @param {string} [was] */
const line = (label, value, was = '') =>
  process.stdout.write(`  ${label.padEnd(12)} ${value.padEnd(34)} ${was}\n`);
/** @param {(string | number)[]} cells @param {number[]} widths */
const row = (cells, widths) =>
  process.stdout.write(
    '  ' +
      cells
        .map((c, i) => (i ? String(c).padStart(widths[i]) : String(c).padEnd(widths[i])))
        .join(' ') +
      '\n'
  );

const { cur, prev } = d;
process.stdout.write(
  `${d.workflow || 'all workflows'} on ${d.repo}, last ${d.days} days, recorded since ${d.since.slice(0, 10)}\n`
);
line('per run', `${t(cur.wall_p50)} median, ${t(cur.wall_p90)} p90`, `was ${t(prev.wall_p50)}`);
line('waited', `${t(cur.waited_sec)} over ${cur.waited_runs} runs`, `was ${t(prev.waited_sec)}`);
line('red', `${t(cur.red_sec)} in ${cur.red} of ${cur.runs} runs`, `was ${t(prev.red_sec)}`);
line('queued', `${t(cur.queue_p50)} median, ${t(cur.queue_p90)} p90`, `was ${t(prev.queue_p50)}`);
line('after merge', t(cur.unwaited_sec), `was ${t(prev.unwaited_sec)}`);

const jobWidths = [44, 8, 8, 8, 6];
process.stdout.write('\n');
row(['job', 'median', 'p90', 'last', 'failed'], jobWidths);
for (const j of d.jobs)
  row(
    [
      j.name.slice(0, 44),
      t(j.run_p50),
      t(j.run_p90),
      cur.runs ? `${Math.round((100 * j.last) / cur.runs)}%` : '—',
      j.failed
    ],
    jobWidths
  );

const branchWidths = [44, 5, 4, 9, 9];
process.stdout.write('\n');
row(['branch', 'runs', 'red', 'in CI', 'to green'], branchWidths);
for (const b of d.branches.slice(0, Number(arg('branches', '12'))))
  row([b.branch.slice(0, 44), b.runs, b.red, t(b.ci_sec), t(b.to_green_sec)], branchWidths);
