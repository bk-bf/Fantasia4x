#!/usr/bin/env node
// What is on dev that is not in the build you play, verified as one merge.
//
//   node tools/audit/promote.mjs             what is waiting, and the full suite on the merge
//   node tools/audit/promote.mjs --list      what is waiting, run nothing
//   node tools/audit/promote.mjs --push      push main and move the cards, after it is green
//
// This does not write to main on its own. It merges dev into main in a throwaway worktree,
// runs the whole suite there rather than the related subset, and prints the command to run.
// `--push` is the same run with the merge pushed at the end, for when you have decided.

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import * as B from './lib/board.mjs';
import { ROOT, PNPM, run, git, tail, errorLines, prepareWorktree } from './lib/harness.mjs';

const flag = (n) => process.argv.includes(`--${n}`);
const out = (s) => process.stdout.write(s + '\n');

const wt = join(ROOT, '.claude', 'worktrees', 'promote');
const branch = 'promote/main';

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
  /* no such branch yet */
}
git(['worktree', 'add', '-b', branch, wt, 'origin/main']);
out(`--- worktree ${wt}`);

let code = 0;
try {
  git(['merge', '--no-ff', '--no-edit', 'origin/dev'], wt);
  out('--- dev merges onto main cleanly');

  await prepareWorktree(wt, out);

  out(`--- ${PNPM} check`);
  const check = await run(PNPM, ['check'], { cwd: wt, timeoutMs: 1_200_000 });
  out(`    ${check.code === 0 ? 'pass' : 'FAIL'}  ${PNPM} check`);
  if (check.code !== 0) out(errorLines(check.out + check.err));

  out(`--- ${PNPM} test — the whole suite, not the related subset`);
  const t0 = Date.now();
  const test = await run(PNPM, ['test'], { cwd: wt, timeoutMs: 2_400_000 });
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  out(`    ${test.code === 0 ? 'pass' : 'FAIL'}  ${PNPM} test  (${mins} min)`);
  const summary = (test.out + test.err)
    .split('\n')
    .filter((l) => /Test Files|Tests\s+\d|Duration/.test(l));
  for (const l of summary) out(`    ${l.trim()}`);
  if (test.code !== 0) out(errorLines(test.out + test.err));

  if (check.code !== 0 || test.code !== 0) {
    out('\nNot green. main is untouched and the worktree is kept so you can look.');
    process.exit(1);
  }

  const sha = git(['rev-parse', 'HEAD'], wt).slice(0, 8);
  out(`\nGreen. The merge is ${sha} on ${branch}.`);

  if (!flag('push')) {
    out('\nPlay it first — the worktree above has its own checkout:');
    out(`  cd ${wt} && ./dev.sh`);
    out('\nThen, when you are happy:');
    out('  node tools/audit/promote.mjs --push');
    process.exit(0);
  }

  git(['push', 'origin', 'HEAD:main'], wt);
  out(`--- pushed ${sha} to main`);
  for (const c of cards) {
    try {
      B.moveLane(c.content.number, 'done');
      out(`    #${c.content.number} -> Done`);
    } catch (e) {
      out(`    #${c.content.number} stayed put: ${tail(String(e.message), 2)}`);
    }
  }
} catch (e) {
  out(`--- ${e.message}`);
  out('main is untouched.');
  code = 1;
} finally {
  if (code === 0 && flag('push')) {
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
