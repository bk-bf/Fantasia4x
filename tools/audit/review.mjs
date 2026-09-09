#!/usr/bin/env node
// Take one card out of the board's In review lane, verify it by the route its Verify field
// names, and merge it to dev if that route is green.
//
//   node tools/audit/review.mjs --next            the oldest In review card
//   node tools/audit/review.mjs --issue 24        a named one
//   node tools/audit/review.mjs --next --dry-run  pick and print, change nothing
//   node tools/audit/review.mjs --next --keep     leave the worktree for inspection
//
// The fix branch is re-merged onto a freshly fetched origin/dev in its own worktree, so what
// is verified is the merge result and not the branch in isolation. The diff is checked against
// the files the issue cites before anything runs. `tests` is deterministic and runs no model.
//
// Green means merged to `dev`. `main` is the branch Kirill plays and builds from; nothing here
// writes to it, and `promote.mjs` is what carries `dev` across when he decides. `headless` runs a session that must drive the real sim and report a
// delta. A card on the playtest route never reaches here -- that lane is Kirill's.
//
// Green means merged to dev and the card in On dev. Anything else sends the card back to Ready
// with the failure written up on the issue.

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import * as B from './lib/board.mjs';
import * as I from './lib/gh.mjs';
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

const say = (n, text) => {
  try {
    I.comment(n, text);
    return true;
  } catch (e) {
    out(`--- could not comment on #${n}: ${String(e.message).split('\n').slice(0, 4).join(' ')}`);
    return false;
  }
};

function fail(msg) {
  out(`ABORT: ${msg}`);
  process.exit(1);
}

const branchExists = (b) => {
  try {
    git(['rev-parse', '--verify', '--quiet', `refs/heads/${b}`], ROOT, true);
    return true;
  } catch {
    return false;
  }
};

function pick() {
  const named = arg('issue', null);
  const cards = B.inLane('in review')
    .filter((it) => it.content?.type === 'Issue')
    .sort((a, b) => a.content.number - b.content.number);

  const wanted = named
    ? cards.filter((it) => String(it.content.number) === String(named))
    : cards.filter((it) => ROUTES.has((it.verify ?? '').toLowerCase()));

  if (named && wanted.length === 0) fail(`#${named} is not In review`);
  if (wanted.length === 0) fail('no card In review is on the tests or headless route');

  const skipped = [];
  for (const it of wanted) {
    const issue = I.readIssue(String(it.content.number));
    const route = (it.verify ?? '').toLowerCase();
    if (!ROUTES.has(route)) fail(`#${it.content.number} is on the ${route || 'unset'} route`);
    if (!branchExists(`fix/${issue.data.id}`)) {
      skipped.push(`#${it.content.number} has no branch fix/${issue.data.id}`);
      continue;
    }
    return { issue, route };
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

Report what you ran, what you measured, and the delta. Write it for someone reading the issue
later, not for me.

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

const { issue, route } = pick();
const d = issue.data;
const num = issue.number;
const fixBranch = `fix/${d.id}`;
const revBranch = `review/${d.id}`;
const wt = join(ROOT, '.claude', 'worktrees', `review-${d.id}`);

out(`#${num} ${d.id} — ${d.title}`);
out(`--- route ${route}, branch ${fixBranch}`);

if (flag('dry-run')) {
  out(`would verify ${fixBranch} merged onto origin/${BASE} in ${wt}`);
  out(`  green -> merge to ${BASE}, card to On dev`);
  out(`  red   -> comment on #${num}, card back to Ready`);
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
git(['fetch', '--quiet', 'origin', BASE]);
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
    say(num, P.renderReview({ branch: fixBranch, route, ran, ok: false, failures, account }));
    B.moveLane(num, 'ready');
  } catch (e) {
    out(`--- could not write the issue back: ${e.message}`);
  }
};

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    out(`\n--- ${sig}: sending #${num} back to Ready, worktree left at ${wt}`);
    sendBack(`The review was interrupted by ${sig}.`, [], '');
    process.exit(130);
  });
}

try {
  out(`--- merging ${fixBranch} onto origin/${BASE}`);
  try {
    git(['merge', '--no-ff', '--no-edit', fixBranch], wt);
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

  // Reported, not refused. Removing a restated roster means editing the file that declares the
  // set, which the issue never cites, so refusing blocked the canonical fix twice. The tests
  // still gate correctness, and this lands on dev, which is read before it is promoted.
  const wandered = outOfScope(issue, files);
  if (wandered) out(`--- outside the issue's scope: ${wandered.outside.join(', ')}`);

  await prepareWorktree(wt, out);

  out(`--- ${PNPM} check and the related tests`);
  const v = await verifyTests(wt, files);
  for (const r of v.results) out(`    ${r.code === 0 ? 'pass' : 'FAIL'}  ${r.name}`);
  const ran = v.results.map((r) => r.name);

  if (!v.ok) {
    sendBack(failureDetail(v.results), ran, '');
    out(`--- not green on the merge. Written up on #${num}; worktree kept at ${wt}`);
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

    // A headless session may write a scenario file to drive the sim. It reviews, so nothing
    // it wrote belongs in the merge.
    git(['reset', '--hard', 'HEAD'], wt);
    git(['clean', '-fd'], wt);

    if (verdict[1] === 'FAIL') {
      sendBack('The headless review measured the change and did not accept it.', ran, account);
      out(`--- FAIL on the headless route. Written up on #${num}; worktree kept at ${wt}`);
      keepTree = true;
      process.exit(1);
    }
  }

  out(`--- pushing to ${BASE}`);
  try {
    git(['push', 'origin', `HEAD:${BASE}`], wt);
  } catch (e) {
    throw new Error(`the merge is green but ${BASE} moved under it:\n${tail(String(e.message), 10)}`);
  }
  const sha = git(['rev-parse', 'HEAD'], wt).slice(0, 8);
  out(`--- merged as ${sha}`);

  // The merge is on dev from here on. Nothing below is allowed to turn that into a failure
  // that sends the card back to Ready, so each step reports and continues.
  const settle = (what, fn) => {
    try {
      fn();
    } catch (e) {
      out(`--- merged, but could not ${what}: ${tail(String(e.message), 3)}`);
    }
  };
  sent = true;
  // The fixer already wrote up the attempt and the commands it ran. Repeating that here says
  // nothing, so a clean pass leaves only `Fixed in <sha>.` on the close. A headless account or
  // a reach past the cited files is new, and does get written.
  if (account || wandered?.outside?.length) {
    say(
      num,
      P.renderReview({
        branch: fixBranch,
        route,
        ran,
        ok: true,
        sha,
        account,
        base: BASE,
        outside: wandered?.outside
      })
    );
  }
  settle('close the issue', () => I.closeWithCommit(num, sha));
  settle('move the card to On dev', () => B.moveLane(num, 'on dev'));
  out(`--- #${num} closed, card in On dev — main is untouched`);

  git(['branch', '-D', fixBranch], ROOT, true);
  settle(`delete origin/${fixBranch}`, () => git(['push', 'origin', '--delete', fixBranch], ROOT));
  const fixWt = join(ROOT, '.claude', 'worktrees', `fix-${d.id}`);
  if (existsSync(fixWt)) {
    try {
      git(['worktree', 'remove', '--force', fixWt]);
    } catch {
      rmSync(fixWt, { recursive: true, force: true });
    }
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
