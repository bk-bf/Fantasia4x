#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import * as B from './lib/board.mjs';
import { ROOT, git, tail, prepareWorktree } from './lib/harness.mjs';

const flag = (n) => process.argv.includes(`--${n}`);
const out = (s) => process.stdout.write(s + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const wt = join(ROOT, '.claude', 'worktrees', 'promote');
const branch = 'promote/main';
const WORKFLOW = 'promote.yml';
const POLL_MS = 60_000;
const WAIT_MS = 7 * 3600_000;

const gh = (args) =>
  execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

git(['fetch', '--quiet', 'origin', 'main', 'dev']);

const commits = git(['log', '--oneline', '--no-merges', 'origin/main..origin/dev']).split('\n').filter(Boolean);
if (commits.length === 0) {
  out('dev has nothing main does not. Nothing to promote.');
  process.exit(0);
}

const files = git(['diff', '--stat', 'origin/main...origin/dev']).split('\n').filter(Boolean);
const cards = B.inLane('on dev').filter((i) => i.content?.number);

out(`${commits.length} commit(s) on dev, ${cards.length} card(s) in On dev\n`);
for (const c of cards) out(`  #${c.content.number}  ${c.content.title.slice(0, 66)}`);
out('');
for (const f of files.slice(-14)) out(`  ${f}`);
out('');

if (flag('list')) process.exit(0);

const mainSha = git(['rev-parse', 'origin/main']);
const devSha = git(['rev-parse', 'origin/dev']);

function reusableCandidate() {
  try {
    git(['fetch', '--quiet', 'origin', branch], ROOT, true);
  } catch {
    return null;
  }
  const [sha, ...parents] = git(['rev-list', '--parents', '-n', '1', `origin/${branch}`]).split(' ');
  return parents[0] === mainSha && parents[1] === devSha ? sha : null;
}

async function waitForRun(sha) {
  const until = Date.now() + WAIT_MS;
  let shown = '';
  while (Date.now() < until) {
    const [run] = JSON.parse(
      gh(['run', 'list', '--workflow', WORKFLOW, '--commit', sha, '--limit', '1', '--json', 'databaseId,status,conclusion,url'])
    );
    if (run) {
      const { jobs } = JSON.parse(gh(['run', 'view', String(run.databaseId), '--json', 'jobs']));
      const line = jobs.map((j) => `${j.name} ${j.conclusion || j.status}`).join(', ');
      if (line !== shown) out(`    ${line}`);
      shown = line;
      if (run.status === 'completed') return { run, jobs };
    }
    await sleep(POLL_MS);
  }
  return null;
}

if (existsSync(wt)) {
  try {
    git(['worktree', 'remove', '--force', wt]);
  } catch {
    rmSync(wt, { recursive: true, force: true });
    git(['worktree', 'prune']);
  }
}
try {
  git(['branch', '-D', branch], ROOT, true);
} catch {
  out(`--- no local ${branch} to replace`);
}

let code = 0;
let pushed = false;
try {
  const reused = reusableCandidate();
  if (reused) {
    git(['worktree', 'add', '-b', branch, wt, reused]);
    out(`--- reusing ${reused.slice(0, 8)} on origin/${branch}: main and dev have not moved`);
  } else {
    git(['worktree', 'add', '-b', branch, wt, 'origin/main']);
    git(['merge', '--no-ff', '--no-edit', 'origin/dev'], wt);
    out('--- dev merges onto main cleanly');
    git(['push', '--force', 'origin', `HEAD:refs/heads/${branch}`], wt);
    out(`--- pushed the merge to ${branch}, where ${WORKFLOW} runs`);
  }

  const sha = git(['rev-parse', 'HEAD'], wt);
  out(`--- waiting for ${WORKFLOW} on ${sha.slice(0, 8)}`);
  const result = await waitForRun(sha);
  if (!result) throw new Error(`${WORKFLOW} did not finish on ${sha.slice(0, 8)} within ${WAIT_MS / 3600_000} h`);
  const { run, jobs } = result;

  if (run.conclusion !== 'success') {
    for (const j of jobs.filter((j) => !['success', 'skipped'].includes(j.conclusion)))
      out(`    ${j.conclusion || j.status}  ${j.name}`);
    out(`\nNot green: ${run.url}\nmain is untouched and the worktree is kept so you can look.`);
    code = 1;
  } else if (!flag('push')) {
    await prepareWorktree(wt, out);
    out(`\nGreen: ${run.url}`);
    out('\nPlay it first — the worktree above has its own checkout:');
    out(`  cd ${wt} && ./dev.sh`);
    out('\nThen, when you are happy:');
    out('  pnpm audit:promote --push');
  } else {
    git(['push', 'origin', 'HEAD:main'], wt);
    pushed = true;
    out(`--- pushed ${sha.slice(0, 8)} to main after ${run.url}`);
    for (const c of cards) {
      try {
        B.moveLane(c.content.number, 'done');
        out(`    #${c.content.number} -> Done`);
      } catch (e) {
        out(`    #${c.content.number} stayed put: ${tail(String(e.message), 2)}`);
      }
    }
  }
} catch (e) {
  out(`--- ${e.message}`);
  out('main is untouched.');
  code = 1;
} finally {
  if (pushed) {
    try {
      git(['worktree', 'remove', '--force', wt]);
      git(['branch', '-D', branch], ROOT, true);
    } catch {
      rmSync(wt, { recursive: true, force: true });
    }
  } else {
    out(`--- worktree kept at ${wt}`);
  }
}

process.exit(code);
