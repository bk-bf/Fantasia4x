#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { chainRefOf, pickRun, runBranch, verdict } from './lib/chain-run.mjs';

const WORKFLOW = 'check.yml';
const pre = process.argv.includes('--pre');
/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** @param {string} cmd @param {string[]} args @returns {string} */
const read = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
/** @param {string} message @returns {never} */
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
const chainRef = chainRefOf(branch);
const headBranch = runBranch(event, branch);
const since = Date.now() - 5_000;
if (event === 'workflow_dispatch')
  read('gh', ['workflow', 'run', WORKFLOW, '--ref', branch, '-f', 'mode=pre']);
if (event === 'push' && spawnSync('git', ['push', '--force', 'origin', `HEAD:refs/heads/${chainRef}`], { stdio: 'inherit' }).status !== 0)
  fail(`the push of ${chainRef} was refused`);

async function findRun() {
  for (let i = 0; i < 40; i++) {
    /** @type {(import('./lib/chain-run.mjs').RunSummary & { databaseId: number, url: string })[]} */
    const runs = JSON.parse(
      read('gh', [
        'run', 'list', '--workflow', WORKFLOW, '--commit', sha, '--event', event, '--branch', headBranch,
        '--limit', '5', '--json', 'databaseId,createdAt,url,event,headBranch,headSha'
      ])
    );
    const found = pickRun(runs, { event, headBranch, sha, since });
    if (found) return found;
    await sleep(3_000);
  }
  return null;
}

const found = await findRun();
if (!found) fail(`no ${event} run of ${WORKFLOW} started for ${sha.slice(0, 8)} within two minutes`);
const what = event === 'pull_request' ? `pull request #${pull.number}` : pre ? 'the pre-check' : 'the chain';
process.stdout.write(`pnpm chain: ${what} on ${branch} at ${sha.slice(0, 8)}: ${found.url}\n`);
const runId = String(found.databaseId);
/** @returns {import('./lib/chain-run.mjs').Run} */
function watchRun() {
  for (let attempt = 1; ; attempt++) {
    spawnSync('gh', ['run', 'watch', runId, '--interval', '15'], { stdio: 'inherit' });
    /** @type {import('./lib/chain-run.mjs').Run} */
    const run = JSON.parse(read('gh', ['run', 'view', runId, '--json', 'status,conclusion,jobs']));
    if (run.status === 'completed' || attempt === 3) return run;
  }
}
const run = watchRun();
const result = verdict(run);
if (event === 'push' && run.status === 'completed')
  spawnSync('git', ['push', 'origin', '--delete', chainRef], { stdio: 'inherit' });
if (result.reason) process.stderr.write(`pnpm chain: ${result.reason}\n`);
process.stdout.write(`pnpm chain: ${result.green ? 'green' : 'red'}, ${found.url}\n`);
process.exit(result.green ? 0 : 1);
