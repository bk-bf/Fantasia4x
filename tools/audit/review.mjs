#!/usr/bin/env node
//   node tools/audit/review.mjs --next            the oldest pull request not yet reviewed
//   node tools/audit/review.mjs --issue 24        the pull request for a named issue
//   node tools/audit/review.mjs --next --dry-run  pick and print, change nothing
//   node tools/audit/review.mjs --next --keep     leave the worktree for inspection

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import * as B from './lib/board.mjs';
import * as I from './lib/gh.mjs';
import * as PR from './lib/pulls.mjs';
import {
  ROOT,
  PNPM,
  BASE,
  CLAUDE,
  run,
  git,
  tail,
  committedFiles,
  prepareWorktree,
  verifyTests,
  failureDetail
} from './lib/harness.mjs';
import { readControl } from './lib/pace.mjs';
import * as P from './lib/prs.mjs';

const MODEL = process.env.AUDIT_REVIEW_MODEL || 'sonnet';
const ROUTES = new Set(['tests', 'headless']);

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) fail(`--${n} needs a value`);
  return v;
};
const flag = (n) => process.argv.includes(`--${n}`);
const out = (s) => process.stdout.write(s + '\n');

const sayOnPull = (n, text) => {
  try {
    PR.commentOnPull(n, text);
    return true;
  } catch (e) {
    out(`--- could not comment on PR #${n}: ${String(e.message).split('\n').slice(0, 4).join(' ')}`);
    return false;
  }
};

function fail(msg) {
  out(`ABORT: ${msg}`);
  process.exit(1);
}

function pick() {
  const named = arg('issue', null);
  const pulls = PR.openPulls()
    .filter((p) => !p.labels.includes(PR.PLAYTEST_LABEL))
    .sort((a, b) => a.number - b.number);

  const wanted = named
    ? pulls.filter((p) => PR.linkOf(p)?.issue === Number(named))
    : pulls.filter((p) => PR.reviewState(p.headRefOid) === null);

  if (named && wanted.length === 0) fail(`#${named} has no open pull request into ${BASE}`);
  if (wanted.length === 0) fail('no open pull request is waiting for review');

  const skipped = [];
  for (const pull of wanted) {
    const link = PR.linkOf(pull);
    if (!link) {
      skipped.push(`PR #${pull.number} names no issue`);
      continue;
    }
    const route = (B.itemFor(link.issue)?.verify ?? '').toLowerCase();
    if (!ROUTES.has(route)) {
      skipped.push(`#${link.issue} is on the ${route || 'unset'} route`);
      continue;
    }
    return { issue: I.readIssue(String(link.issue)), route, pull };
  }
  fail(`nothing reviewable:\n  ${skipped.join('\n  ')}`);
}

/** The tests route runs no model, so nothing reads the diff against the issue. An issue names
 *  the files its findings sit in; a fix that edits something else has either widened its own
 *  scope or fixed a different problem. A test file is always allowed -- "add the check that
 *  would have caught it" is on every remediation list -- and so is a doc, which cannot change
 *  behaviour and is usually where that check gets stated. An issue that cites no code at all
 *  cannot be checked this way. */
function outOfScope(issue, changed) {
  const cited = new Set(
    (issue.data.files ?? []).flatMap((f) =>
      [...String(f).matchAll(/((?:src|tools)\/[A-Za-z0-9._/-]+?\.(?:ts|svelte|json|mjs))/g)].map(
        (m) => m[1]
      )
    )
  );
  if (cited.size === 0) return null;
  const free = (f) => f.startsWith('src/tests/') || f.startsWith('docs/') || f.endsWith('.md');
  const outside = changed.filter((f) => !cited.has(f) && !free(f));
  return outside.length ? { cited: [...cited], outside } : null;
}

function headlessPrompt(issue, route, files) {
  return `You are reviewing one finished change in this repository. You do not write the fix —
it is already committed in this worktree and merged onto the current origin/${BASE}.

# Authorisation

AGENTS.md tells an agent here to stop at a proposal. **You are not implementing anything**, so
that rule does not bind you. Read, run, measure, and report. Change no source file.

# What to do

Invoke the \`headless\` skill and follow it. This issue was routed to \`headless\` because a unit
test cannot settle it: the behaviour only appears in the running sim. Build a scenario that
exercises what the issue describes, run real ticks, and read the state back.

A unit test is not a playtest. \`${PNPM} check\` and the related unit tests have already passed —
re-running them proves nothing new. What is missing is the loop.

# What to decide

Does the sim now behave the way the issue's Remediation list says it should?

- Measure it. State the mechanism, the delta and the tree, in the skill's form:
  "HeadlessSession, N ticks, <thing> X→Y, on <branch> at <short sha>". Read the branch and sha
  from this worktree with git; do not state them from memory.
- If the change did nothing observable, that is a FAIL, even when the code looks right.
- If the change works but broke something adjacent that your scenario exposes, that is a FAIL.
- Do not judge whether the numbers are the right numbers for the game. That is a playtest
  question and it is not yours. Judge only whether the stated behaviour happens.

# Files this change touched

${files.map((f) => `- ${f}`).join('\n')}

# Finish

Report what you ran, what you measured, and the delta. Write it for someone reading the pull
request later, not for me.

The last line of your final message must be exactly one of:

    VERDICT: PASS
    VERDICT: FAIL

If you could not get a scenario to run at all, that is \`VERDICT: FAIL\` with the reason above
it. Never guess a verdict you did not measure.

---

# Issue #${issue.number} — ${issue.data.title}

${issue.body}
`;
}

// --- main --------------------------------------------------------------------

const control = readControl();
if (control.paused === true) {
  const why = control.reason ? `: ${control.reason}` : '';
  if (flag('force')) out(`--- the audit is paused${why}; --force overrides it for this card`);
  else if (!flag('dry-run'))
    fail(
      `the audit is paused${why}, and the reviewer spends the same limits. ` +
        `--force runs this one card anyway and leaves the audit paused.`
    );
  else out(`--- the audit is paused${why}; a real run would stop here`);
}

const { issue, route, pull } = pick();
const d = issue.data;
const num = issue.number;
const head = pull.headRefOid;
const fixBranch = pull.headRefName;
const slug = fixBranch.slice('fix/'.length);
const revBranch = `review/${slug}`;
const wt = join(ROOT, '.claude', 'worktrees', `review-${slug}`);

out(`#${num} ${d.id} — ${d.title}`);
out(`--- PR #${pull.number}, route ${route}, ${fixBranch} at ${head.slice(0, 8)}`);

if (flag('dry-run')) {
  out(`would verify ${fixBranch} merged onto origin/${BASE} in ${wt}`);
  out(`  green -> ${PR.REVIEW_CONTEXT} success on PR #${pull.number}, card to PR ready`);
  out(`  red   -> ${PR.REVIEW_CONTEXT} failure, the failure on PR #${pull.number}, card back to Ready`);
  process.exit(0);
}

if (existsSync(wt)) {
  try {
    git(['worktree', 'remove', '--force', wt]);
  } catch {
    rmSync(wt, { recursive: true, force: true });
    git(['worktree', 'prune']);
  }
}
git(['fetch', '--quiet', 'origin', BASE, fixBranch]);
try {
  git(['branch', '-D', revBranch], ROOT, true);
} catch {
  /* no such branch yet */
}
git(['worktree', 'add', '-b', revBranch, wt, `origin/${BASE}`]);
out(`--- worktree ${wt}`);

let exitCode = 0;
let keepTree = flag('keep');
let sent = false;

const sendBack = (failures, ran, account) => {
  if (sent) return;
  sent = true;
  try {
    PR.setReviewState(head, 'failure', `did not pass on the ${route} route`);
  } catch (e) {
    out(`--- could not mark PR #${pull.number}: ${tail(String(e.message), 3)}`);
  }
  sayOnPull(pull.number, P.renderReview({ route, ran, ok: false, failures, account }));
  try {
    B.moveLane(num, 'ready');
  } catch (e) {
    out(`--- could not move #${num} back to Ready: ${e.message}`);
  }
};

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    out(`\n--- ${sig}: PR #${pull.number} left unreviewed, worktree at ${wt}`);
    process.exit(130);
  });
}

try {
  out(`--- merging ${fixBranch} onto origin/${BASE}`);
  try {
    git(['merge', '--no-ff', '--no-edit', head], wt);
  } catch (e) {
    const conflicts = (() => {
      try {
        return git(['diff', '--name-only', '--diff-filter=U'], wt);
      } catch {
        return '';
      }
    })();
    throw new Error(
      `${fixBranch} no longer merges onto origin/${BASE}.\n\n\`\`\`\n${tail(
        conflicts || String(e.message),
        20
      )}\n\`\`\``
    );
  }

  const files = committedFiles(wt);
  if (files.length === 0) throw new Error(`${fixBranch} adds nothing on top of origin/${BASE}`);
  out(`--- ${files.length} file(s) against ${BASE}`);

  const wandered = outOfScope(issue, files);
  if (wandered) out(`--- outside the issue's scope: ${wandered.outside.join(', ')}`);

  await prepareWorktree(wt, out);

  out(`--- ${PNPM} check and the related tests`);
  const v = await verifyTests(wt, files);
  for (const r of v.results) out(`    ${r.code === 0 ? 'pass' : 'FAIL'}  ${r.name}`);
  const ran = v.results.map((r) => r.name);

  if (!v.ok) {
    sendBack(failureDetail(v.results), ran, '');
    out(`--- not green on the merge. Written up on PR #${pull.number}; worktree kept at ${wt}`);
    keepTree = true;
    process.exit(1);
  }

  let account = '';
  if (route === 'headless') {
    out(`--- ${CLAUDE} (${MODEL}) on the headless route`);
    const t0 = Date.now();
    const res = await run(
      CLAUDE,
      [
        '--print',
        '--model',
        MODEL,
        '--permission-mode',
        'acceptEdits',
        '--allowedTools',
        'Bash',
        'Read',
        'Grep',
        'Glob',
        'Write',
        'Edit',
        'Skill'
      ],
      { cwd: wt, input: headlessPrompt(issue, route, files), timeoutMs: 3_600_000 }
    );
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    if (res.code !== 0) throw new Error(`the review session exited ${res.code}:\n${tail(res.err)}`);
    const raw = res.out.trim();
    const verdict = raw.match(/^VERDICT: (PASS|FAIL)$/m);
    if (!verdict)
      throw new Error(
        `the review session ended without a verdict (${raw.length} chars back):\n${tail(raw, 8)}`
      );
    account = raw.replace(/^VERDICT: (PASS|FAIL)$/m, '').trim();
    out(`    ${mins} min, VERDICT: ${verdict[1]}`);
    ran.push(`headless review (${MODEL})`);

    git(['reset', '--hard', 'HEAD'], wt);
    git(['clean', '-fd'], wt);

    if (verdict[1] === 'FAIL') {
      sendBack('The headless review measured the change and did not accept it.', ran, account);
      out(`--- FAIL on the headless route. Written up on PR #${pull.number}; worktree kept at ${wt}`);
      keepTree = true;
      process.exit(1);
    }
  }

  sent = true;
  PR.setReviewState(head, 'success', `${route} route green on a fresh ${BASE}`);
  if (account || wandered?.outside?.length)
    sayOnPull(
      pull.number,
      P.renderReview({ route, ran, ok: true, account, outside: wandered?.outside })
    );
  try {
    B.moveLane(num, 'pr ready');
    out(`--- PR #${pull.number} for #${num} passed; the card waits in PR ready`);
  } catch (e) {
    out(`--- PR #${pull.number} passed, but #${num} could not be moved: ${tail(String(e.message), 3)}`);
  }
} catch (e) {
  out(`--- ${e.message}`);
  keepTree = true;
  sendBack(e.message, [], '');
  exitCode = 1;
} finally {
  if (keepTree) {
    out(`--- worktree kept at ${wt}`);
  } else {
    try {
      git(['worktree', 'remove', '--force', wt]);
      git(['branch', '-D', revBranch], ROOT, true);
    } catch {
      rmSync(wt, { recursive: true, force: true });
    }
    out('--- worktree removed');
  }
}

process.exit(exitCode);
