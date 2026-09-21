#!/usr/bin/env node
// @ts-nocheck
import { execFileSync, spawnSync } from 'node:child_process';

const WORKFLOW = 'check.yml';
const pre = process.argv.includes('--pre');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const fail = (message) => {
  process.stderr.write(`pnpm chain: ${message}\n`);
  process.exit(2);
};

const branch = read('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch === 'HEAD') fail('check out a branch first');
if (branch === 'dev' || branch === 'main')
  fail(`every push to ${branch} runs the chain already; run pnpm chain on a work branch`);
if (read('git', ['status', '--porcelain']))
  fail('commit first: GitHub checks the pushed commit, and this tree has uncommitted changes');

const sha = read('git', ['rev-parse', 'HEAD']);
if (spawnSync('git', ['push', 'origin', `HEAD:refs/heads/${branch}`], { stdio: 'inherit' }).status !== 0)
  fail(`the push of ${branch} was refused`);

const pull = JSON.parse(read('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number']))[0];
const event = pull && !pre ? 'pull_request' : pre ? 'workflow_dispatch' : 'push';
const chainRef = `chain/${branch.replaceAll('/', '-')}`;
const since = Date.now() - 5_000;
if (event === 'workflow_dispatch')
  read('gh', ['workflow', 'run', WORKFLOW, '--ref', branch, '-f', 'mode=pre']);
if (event === 'push' && spawnSync('git', ['push', '--force', 'origin', `HEAD:refs/heads/${chainRef}`], { stdio: 'inherit' }).status !== 0)
  fail(`the push of ${chainRef} was refused`);

async function findRun() {
  for (let i = 0; i < 40; i++) {
    const runs = JSON.parse(
      read('gh', [
        'run', 'list', '--workflow', WORKFLOW, '--commit', sha, '--event', event,
        '--limit', '5', '--json', 'databaseId,createdAt,url'
      ])
    );
    const found = runs.find((r) => event === 'pull_request' || Date.parse(r.createdAt) >= since);
    if (found) return found;
    await sleep(3_000);
  }
  return null;
}

const found = await findRun();
if (!found) fail(`no ${event} run of ${WORKFLOW} started for ${sha.slice(0, 8)} within two minutes`);
const what = event === 'pull_request' ? `pull request #${pull.number}` : pre ? 'the pre-check' : 'the chain';
process.stdout.write(`pnpm chain: ${what} on ${branch} at ${sha.slice(0, 8)}: ${found.url}\n`);
const watched = spawnSync('gh', ['run', 'watch', String(found.databaseId), '--exit-status', '--interval', '15'], {
  stdio: 'inherit'
});
if (event === 'push') spawnSync('git', ['push', 'origin', '--delete', chainRef], { stdio: 'inherit' });
process.stdout.write(`pnpm chain: ${watched.status === 0 ? 'green' : 'red'}, ${found.url}\n`);
process.exit(watched.status ?? 1);
