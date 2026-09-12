#!/usr/bin/env node
// Take one card out of the board's Ready lane, fix it in a worktree, move the card.
//
// Everything here happens off `dev`. `main` is the branch Kirill plays and builds from, and
// nothing automated writes to it.
//
//   node tools/audit/fix.mjs --next               the oldest Ready card on the tests route
//   node tools/audit/fix.mjs --next --verify headless
//   node tools/audit/fix.mjs --issue 24           a named one
//   node tools/audit/fix.mjs --next --dry-run     pick and print, change nothing
//   node tools/audit/fix.mjs --next --keep        leave the worktree for inspection

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import * as B from './lib/board.mjs';
import * as I from './lib/gh.mjs';
import * as PR from './lib/pulls.mjs';
import { branchFor } from './lib/branch.mjs';
import {
  ROOT,
  PNPM,
  BASE,
  CLAUDE,
  run,
  git,
  tail,
  changedFiles,
  prepareWorktree,
  verifyTests,
  failureDetail,
  assignDevPort
} from './lib/harness.mjs';
import { readControl } from './lib/pace.mjs';
import * as P from './lib/prs.mjs';
import { ledgerEvidence } from './lib/raise.mjs';

const MODEL = process.env.AUDIT_FIX_MODEL || 'sonnet';
const ROUTES = new Set(['tests', 'headless', 'playtest']);

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) fail(`--${n} needs a value`);
  return v;
};
const flag = (n) => process.argv.includes(`--${n}`);
const out = (s) => process.stdout.write(s + '\n');

// --- pick --------------------------------------------------------------------

function pick() {
  const named = arg('issue', null);
  if (named) {
    const issue = I.listIssues(ROOT).find(
      (x) => x.data.id === named || x.path === String(named)
    );
    if (!issue) fail(`no issue ${named}`);
    if (B.laneOf(issue.number) === 'manual')
      fail(`#${issue.number} is in Manual, so it is being worked by hand`);
    const card = B.itemFor(issue.number);
    const route = (card?.verify ?? '').toLowerCase();
    if (!ROUTES.has(route)) fail(`#${issue.number} has no Verify route on the board`);
    return { issue, route };
  }

  const route = arg('verify', 'tests').toLowerCase();
  if (!ROUTES.has(route))
    fail(`--verify ${route} is not a route — one of: ${[...ROUTES].join(', ')}`);

  const ready = B.inLane('ready')
    .filter((it) => it.content?.type === 'Issue')
    .filter((it) => (it.verify ?? '').toLowerCase() === route)
    .sort((a, b) => a.content.number - b.content.number);

  if (ready.length === 0) fail(`no card in Ready is on the ${route} route`);

  for (const it of ready) {
    const issue = I.readIssue(String(it.content.number));
    if (issue.data.status !== 'closed') return { issue, route };
  }
  fail(`every ${route} card in Ready is already closed`);
}

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

// --- prompt ------------------------------------------------------------------
// AGENTS.md tells an agent in this repo to stop at a proposal and wait. That rule is right
// for a conversation and wrong here, so the authorisation is stated explicitly -- otherwise
// every fixer run ends with a plan and no diff.

const nextStep = (issue) =>
  issue.data.kind === 'feature'
    ? (I.featureSteps(issue.body).find((s) => !s.done)?.text ?? null)
    : null;

const featureScope = (step) => `This issue is a feature, built one step per branch. Work only its next open step:

    ${step}

The ticked steps are already on \`${BASE}\`. The open steps after this one are later branches, so
do not start them.`;

const feedbackSection = (pull, notes) =>
  notes.length
    ? `

---

# Said on the previous attempt

This issue already has pull request #${pull}, and what follows was written on it by the reviewer or
by Kirill. This attempt starts again from \`${BASE}\`, so the earlier diff is gone. Address every
point below in the new one.

${notes.map((n) => `- ${n.replace(/\n/g, '\n  ')}`).join('\n')}
`
    : '';

function buildPrompt(issue, step) {
  const d = issue.data;
  return `You are fixing one recorded issue in this repository, end to end.

# Authorisation

This repository's AGENTS.md says not to touch code without being asked, and to stop at a
proposal. **You have been asked.** This issue's card was triaged into the board's Ready lane,
which is the explicit go-ahead to implement ${step ? 'the step named under Scope' : 'its whole Remediation list'}. Do not stop at a
proposal, do not ask for confirmation, and do not report back a plan — make the changes.

Everything else in AGENTS.md still applies in full: the layering, the service singletons, the
in-place mutation exemption on hot per-tick paths, no ids or dev jargon in player-facing text,
the 200-line component limit, Svelte 5 runes, \`pnpm\` never \`npm\`.

# Scope

${step ? featureScope(step) : 'Work the Remediation list below, all of it, in this worktree. This is one class of defect and\none PR.'}

- Change only what the issue names. \`Out of scope\` is binding.${
    (d.files ?? []).length ? `\n- The issue scopes this to: ${(d.files ?? []).join(', ')}.` : ''
  }
- Do **not** run \`git commit\`, \`git push\`, or any \`gh\` command. The harness re-runs the
  verification itself and commits only if it passes.
- If a citation in the issue no longer holds, say so in your final message and skip it rather
  than inventing a nearby change.
- If the whole issue is already fixed, change nothing and say so.

# Verification

Before you finish, run and get green:

    ${PNPM} check
    ${PNPM} test:related <the src files you changed>
    ${PNPM} vitest run <each test file you added or edited, by path>

\`test:related\` selects tests that import the files you name. It selects **nothing** for a
change to a \`.json\` data file, and nothing for a test file you added — those have to be run
by path, and a change with no test naming it is not verified. The harness re-runs all of this
and will refuse to commit if nothing executed.

Run every verification in the foreground. Never use \`run_in_background\`, never background a
command with \`&\`, and never wait for a notification: the Bash tool moves anything over 600
seconds into the background, this session ends when your turn ends, and a result you did not
see is a result nobody saw. If a run is too slow, narrow it to specific files or describe
blocks and run it again — do not walk away from it.

Do not run the full test suite. If you cannot get everything green, stop, leave the tree as it
is, and explain in your final message exactly what is failing and what you tried. A failed
attempt with a clear account is more useful than a passing one that narrowed the fix.

# Finish

End with a short account of: what you changed and why, and the exact verification commands you
ran with their result. That text becomes the review document, so write it for a reviewer, not
for me.

Then account for the Remediation list, one line per item, quoting each checkbox's text exactly
as it appears below:

    DONE: <checkbox text>
    SKIPPED: <checkbox text> - <why>

The harness ticks the DONE items in the issue file and leaves the rest. An item you do not
list counts as skipped.

The last line of your final message must be exactly:

    ACCOUNT COMPLETE

If you cannot get there, stop and say why instead — the harness treats a missing final line as
an unfinished session and will not commit.

---

# Issue ${d.id}

${issue.body}
${ledgerEvidence(issue.number)}`;
}

// --- commit message ----------------------------------------------------------

// scripts/hooks/commit-msg refuses anything else: `type(scope): lowercase summary`, a blank
// line, then bullets ending in a full stop. The board's work type is the commit type, except
// for the two options git has no type for.
const COMMIT_TYPE = { tooling: 'dev', decision: 'chore' };
const GIT_TYPES = /^(feat|fix|refactor|chore|docs|dev|perf|style|test|ci|build)$/;

function commitMessage(d, num, files, workType, step) {
  const raw = workType ?? B.itemFor(num)?.['work type'] ?? 'fix';
  const type = COMMIT_TYPE[raw] ?? (GIT_TYPES.test(raw) ? raw : 'fix');
  const scope = /^[a-z0-9./-]+$/.test(d.subarea ?? '') ? `(${d.subarea})` : '';
  const summary = String(step ? step.replace(/`/g, '') : d.title)
    .replace(/\s+—\s+[^—]*$/, '')
    .replace(/^[^A-Za-z]+/, '')
    .replace(/^./, (c) => c.toLowerCase())
    .slice(0, 68)
    .trim()
    .replace(/[.\s]+$/, '');
  const named = files.slice(0, 6).map((f) => `\`${f}\``).join(', ');
  const rest = files.length > 6 ? ` and ${files.length - 6} more` : '';
  return [
    `${type}${scope}: ${summary}`,
    '',
    step ? `- Take the next step on #${num}.` : `- Work the remediation list on #${num}.`,
    `- Change ${named}${rest}.`,
    '',
    'Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>'
  ].join('\n');
}

// --- main --------------------------------------------------------------------

const control = readControl();
const paused = control.paused === true;
if (paused) {
  const why = control.reason ? `: ${control.reason}` : '';
  if (flag('force')) out(`--- the audit is paused${why}; --force overrides it for this card`);
  else if (!flag('dry-run'))
    fail(
      `the audit is paused${why}, and the fixer spends the same limits. ` +
        `--force runs this one card anyway and leaves the audit paused.`
    );
  else out(`--- the audit is paused${why}; a real run would stop here`);
}

const pulls = PR.openPulls();
const withPull = new Set(pulls.map((p) => PR.linkOf(p)?.issue).filter(Boolean));

for (const it of B.inLane('in progress')) {
  const n = it.content?.number;
  if (!n) continue;
  const stale = I.readIssue(String(n));
  const trees = [`fix-${stale.data.id}`, `fix-${branchFor(stale).slice('fix/'.length)}`];
  if (trees.some((t) => existsSync(join(ROOT, '.claude', 'worktrees', t)))) continue;
  if (withPull.has(n)) continue;
  out(`--- releasing #${n}, left In progress by a run that did not exit`);
  B.moveLane(n, 'ready');
}

const { issue, route } = pick();
const d = issue.data;
const num = issue.number;
out(`#${num} ${d.id} — ${d.title}`);
out(`--- route ${route}`);

if (d.status === 'closed') fail(`#${num} is closed`);
const errs = I.validate(issue);
if (errs.length) fail(`${d.id} is invalid: ${errs.join('; ')}`);
const step = nextStep(issue);
if (d.kind === 'feature' && !step) fail(`#${num} is a feature with no open step under ## Steps`);

const earlier = pulls.find((p) => PR.linkOf(p)?.issue === num) ?? null;
const branch = earlier?.headRefName ?? branchFor(issue);
const wt = join(ROOT, '.claude', 'worktrees', `fix-${branch.slice('fix/'.length)}`);
const notes = earlier ? PR.feedback(earlier.number) : [];

if (flag('dry-run')) {
  out(`would work #${num} on ${branch} in ${wt}`);
  out(
    `  lane ${B.laneOf(num)} -> in progress, then a pull request into ${BASE}` +
      (route === 'playtest' ? ` labelled ${PR.PLAYTEST_LABEL} and the card to pr ready` : '')
  );
  if (earlier) out(`  PR #${earlier.number} is open; ${notes.length} comment(s) go into the prompt`);
  out(`  ${(issue.body.match(/^\s*- \[ \]/gm) ?? []).length} open remediation step(s)`);
  if (step) out(`  next step: ${step}`);
  process.exit(0);
}

out(`--- worktree ${wt}`);
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
  git(['branch', '-D', branch], ROOT, true);
} catch {
  /* no such branch yet */
}
git(['worktree', 'add', '-b', branch, wt, `origin/${BASE}`]);

B.moveLane(num, 'in progress');

// A killed run would otherwise leave the card sitting In progress with no worktree behind
// it, so the board looks busy forever. Put it back on the way out.
let released = false;
const release = () => {
  if (released) return;
  released = true;
  try {
    B.moveLane(num, 'ready');
  } catch {
    /* board unreachable */
  }
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    out(`\n--- ${sig}: releasing #${num} and leaving the worktree at ${wt}`);
    release();
    process.exit(130);
  });
}

let exitCode = 0;
let keepTree = flag('keep');
let committed = false;
try {
  await prepareWorktree(wt, out);

  out(`--- ${CLAUDE} (${MODEL})`);
  const t0 = Date.now();
  const res = await run(
    CLAUDE,
    [
      '--print',
      '--model',
      MODEL,
      '--permission-mode',
      'acceptEdits',
      // Bash is granted deliberately: the model is told to get `pnpm check` and
      // `pnpm test:related` green, and cannot without it. Scope is a throwaway worktree on
      // a branch, and the harness re-runs both itself before anything is committed.
      '--allowedTools',
      'Bash',
      'Edit',
      'Write',
      'Read',
      'Grep',
      'Glob'
    ],
    {
      cwd: wt,
      input: buildPrompt(issue, step) + feedbackSection(earlier?.number, notes),
      timeoutMs: 3_600_000
    }
  );
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  if (res.code !== 0) throw new Error(`the model exited ${res.code}:\n${tail(res.err)}`);
  const raw = res.out.trim();
  if (!/^ACCOUNT COMPLETE$/m.test(raw))
    throw new Error(
      `the session ended without finishing (${raw.length} chars back):\n${tail(raw, 5)}`
    );
  const account = raw.replace(/^ACCOUNT COMPLETE$/m, '').trim();
  out(`    ${mins} min, ${account.length} chars back`);

  const files = changedFiles(wt);
  if (files.length === 0) {
    out('--- nothing changed');
    say(num,
      `**Fix attempt on \`${branch}\` changed nothing.**\n\n## What it reports\n\n${
        account || '_(the attempt returned nothing)_'
      }\n`
    );
    B.moveLane(num, 'failed');
    exitCode = 0;
  } else {
    out(`--- changed ${files.length} file(s)`);
    out(`--- verifying`);
    const v = await verifyTests(wt, files);
    for (const r of v.results) out(`    ${r.code === 0 ? 'pass' : 'FAIL'}  ${r.name}`);

    if (!v.ok) {
      const detail = failureDetail(v.results);
      say(num,
        P.renderAttempt({ branch, files, account, verified: 'fail', failures: detail })
      );
      B.moveLane(num, 'failed');
      out(`--- not green. Written up on #${num}, card in Failed; worktree kept at ${wt}.`);
      keepTree = true;
      exitCode = 1;
    } else {
      out(`--- committing`);
      git(['add', '-A'], wt);
      const msg = commitMessage(
        d,
        num,
        files,
        step ? 'feat' : route === 'playtest' ? 'fix' : undefined,
        step
      );
      execFileSync('git', ['commit', '-q', '-F', '-'], { cwd: wt, input: msg });
      // The commit exists from here on. Nothing below may reach the catch and write the branch
      // up as a failed attempt that was never committed.
      committed = true;

      const ran = v.results.map((r) => r.name);

      let pushed = true;
      try {
        git(['push', '--force-with-lease', '-u', 'origin', `${branch}:${branch}`], wt);
        out(`--- pushed ${branch}`);
      } catch (e) {
        pushed = false;
        out(`    [warn] could not push ${branch}: ${tail(String(e.message), 3)}`);
      }

      const port = route === 'playtest' ? await assignDevPort(wt) : null;
      if (route === 'playtest') keepTree = true;
      const body = P.renderPull({ issue: num, step, route, account, ran, files, worktree: wt, port });
      let pull = pushed ? PR.openPullFor(branch) : null;
      if (pull) {
        PR.editPull(pull.number, body);
        out(`--- pushed onto PR #${pull.number} and rewrote its description`);
      } else if (pushed) {
        pull = PR.createPull({
          branch,
          title: msg.split('\n')[0],
          body,
          labels: route === 'playtest' ? [PR.PLAYTEST_LABEL] : []
        });
        out(`--- opened PR #${pull?.number} into ${BASE}`);
      }

      if (!pull)
        say(num, P.renderAttempt({ branch, files, account, verified: 'pass', ran, pushed }));

      if (!step) {
        try {
          const ticked = I.tickRemediation(num, account);
          out(`--- ticked ${ticked} remediation item(s)`);
        } catch (e) {
          out(`--- could not tick #${num}: ${String(e.message).split('\n').slice(0, 3).join(' ')}`);
        }
      }

      if (pull && route === 'playtest') {
        B.moveLane(num, 'pr ready');
        out(`--- #${num} waits in PR ready on PR #${pull.number}; the worktree stays at ${wt}`);
      } else {
        out(
          pull
            ? `--- #${num} stays In progress on PR #${pull.number}; review.mjs takes it from here`
            : `--- #${num} stays In progress; ${branch} is committed and not pushed`
        );
      }
    }
  }
} catch (e) {
  out(`--- ${e.message}`);
  keepTree = true;
  if (committed) {
    out(`--- ${branch} is committed; leaving #${num} where it is`);
    say(
      num,
      `**The work landed; the bookkeeping after it did not.**\n\n` +
        `\`${branch}\` is committed and pushed. What failed afterwards:\n\n` +
        `\`\`\`\n${e.message}\n\`\`\`\n`
    );
  } else {
    say(num,
      P.renderAttempt({ branch, files: [], account: '', verified: 'fail', failures: e.message })
    );
    B.moveLane(num, 'failed');
  }
  exitCode = 1;
} finally {
  if (keepTree) {
    out(`--- worktree kept at ${wt}`);
  } else {
    try {
      git(['worktree', 'remove', '--force', wt]);
    } catch {
      rmSync(wt, { recursive: true, force: true });
    }
    out('--- worktree removed');
  }
}

process.exit(exitCode);
