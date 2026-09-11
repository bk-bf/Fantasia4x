#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import * as B from './lib/board.mjs';
import * as I from './lib/gh.mjs';
import * as PR from './lib/pulls.mjs';
import { ROOT, BASE, git, tail } from './lib/harness.mjs';

const STATE =
  process.env.AUDIT_MERGED_STATE ||
  join(homedir(), '.local', 'state', 'fantasia-audit', 'merged-pulls.json');
const DRY = process.argv.includes('--dry-run');
const out = (s) => process.stdout.write(s + '\n');

const seen = new Set(existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : []);
const record = (n) => {
  seen.add(n);
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify([...seen].sort((a, b) => a - b)));
};

const settle = (what, fn) => {
  try {
    return fn();
  } catch (e) {
    out(`--- could not ${what}: ${tail(String(e.message), 3)}`);
    return undefined;
  }
};

const branchExists = (b) => {
  try {
    git(['rev-parse', '--verify', '--quiet', `refs/heads/${b}`], ROOT, true);
    return true;
  } catch {
    return false;
  }
};

const removeWorktree = (dir) => {
  if (!existsSync(dir)) return;
  try {
    git(['worktree', 'remove', '--force', dir]);
  } catch {
    rmSync(dir, { recursive: true, force: true });
    git(['worktree', 'prune']);
  }
  out(`--- removed ${dir}`);
};

function landStep(pull, num, step, sha) {
  settle('tick the step', () => I.tickRemediation(num, `DONE: ${step}`));
  I.invalidate();
  const left = I.featureSteps(I.readIssue(String(num)).body).filter((s) => !s.done);
  if (left.length) {
    settle('comment on the issue', () =>
      I.comment(
        num,
        `**Step merged to \`${BASE}\` in #${pull.number} as ${sha}:** ${step}\n\n` +
          `${left.length} step(s) left; the card is back in Ready for the next one.\n`
      )
    );
    settle('move the card back to Ready', () => B.moveLane(num, 'ready'));
    out(`--- #${num}: ${left.length} step(s) left, card back in Ready`);
    return;
  }
  settle('close the issue', () => I.closeWithCommit(num, sha));
  settle('move the card to On dev', () => B.moveLane(num, 'on dev'));
  out(`--- #${num}: last step landed, closed, card in On dev`);
}

function landFix(num, sha) {
  const status = settle('read the issue', () => I.readIssue(String(num)).data.status);
  if (status !== 'closed') settle('close the issue', () => I.closeWithCommit(num, sha));
  settle('move the card to On dev', () => B.moveLane(num, 'on dev'));
  out(`--- #${num}: closed, card in On dev`);
}

const fresh = PR.mergedPulls()
  .filter((p) => !seen.has(p.number))
  .sort((a, b) => a.number - b.number);

for (const pull of fresh) {
  const link = PR.linkOf(pull);
  const sha = (pull.mergeCommit?.oid ?? '').slice(0, 8);
  out(`PR #${pull.number} ${pull.headRefName} merged as ${sha}${link ? ` for #${link.issue}` : ', names no issue'}`);
  if (DRY) continue;

  if (link?.step) landStep(pull, link.issue, link.step, sha);
  else if (link) landFix(link.issue, sha);

  const slug = pull.headRefName.slice('fix/'.length);
  removeWorktree(join(ROOT, '.claude', 'worktrees', `fix-${slug}`));
  removeWorktree(join(ROOT, '.claude', 'worktrees', `review-${slug}`));
  for (const b of [pull.headRefName, `review/${slug}`])
    if (branchExists(b)) settle(`delete ${b}`, () => git(['branch', '-D', b], ROOT, true));

  record(pull.number);
}
