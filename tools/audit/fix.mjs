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
//
// The gate is the board: Ready, and a Verify route this harness can settle. The card moves
// Ready -> In progress -> In review, and back to Ready if the run fails or dies. A card the
// audit's pause is holding is not picked up at all -- both spend the same limits.
//
// Nothing is committed unless `pnpm check` and the related tests are green, and nothing is
// pushed at all: the branch is local and a person decides whether it reaches main. A run
// that cannot get green writes up why on the issue, so a failed attempt leaves a record
// rather than a half-finished branch.

import { execFileSync } from 'node:child_process';
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
  changedFiles,
  prepareWorktree,
  verifyTests,
  failureDetail,
  assignDevPort
} from './lib/harness.mjs';
import { readControl } from './lib/pace.mjs';
import * as P from './lib/prs.mjs';

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

function buildPrompt(issue) {
  const d = issue.data;
  return `You are fixing one recorded issue in this repository, end to end.

# Authorisation

This repository's AGENTS.md says not to touch code without being asked, and to stop at a
proposal. **You have been asked.** This issue's card was triaged into the board's Ready lane,
which is the explicit go-ahead to implement its whole Remediation list. Do not stop at a
proposal, do not ask for confirmation, and do not report back a plan — make the changes.

Everything else in AGENTS.md still applies in full: the layering, the service singletons, the
in-place mutation exemption on hot per-tick paths, no ids or dev jargon in player-facing text,
the 200-line component limit, Svelte 5 runes, \`pnpm\` never \`npm\`.

# Scope

Work the Remediation list below, all of it, in this worktree. This is one class of defect and
one PR.

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
`;
}

// --- commit message ----------------------------------------------------------

// scripts/hooks/commit-msg refuses anything else: `type(scope): lowercase summary`, a blank
// line, then bullets ending in a full stop. The board's work type is the commit type, except
// for the two options git has no type for.
const COMMIT_TYPE = { tooling: 'dev', decision: 'chore' };
const GIT_TYPES = /^(feat|fix|refactor|chore|docs|dev|perf|style|test|ci|build)$/;

function commitMessage(d, num, files, workType) {
  const raw = workType ?? B.itemFor(num)?.['work type'] ?? 'fix';
  const type = COMMIT_TYPE[raw] ?? (GIT_TYPES.test(raw) ? raw : 'fix');
  const scope = /^[a-z0-9./-]+$/.test(d.subarea ?? '') ? `(${d.subarea})` : '';
  const summary = String(d.title)
    .replace(/\s+—\s+[^—]*$/, '')
    .replace(/^[^A-Za-z]+/, '')
    .replace(/^./, (c) => c.toLowerCase())
    .slice(0, 68)
    .trim();
  const named = files.slice(0, 6).map((f) => `\`${f}\``).join(', ');
  const rest = files.length > 6 ? ` and ${files.length - 6} more` : '';
  return [
    `${type}${scope}: ${summary}`,
    '',
    `- Work the remediation list on #${num}.`,
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

for (const it of B.inLane('in progress')) {
  const n = it.content?.number;
  if (!n) continue;
  const stale = I.readIssue(String(n));
  if (existsSync(join(ROOT, '.claude', 'worktrees', `fix-${stale.data.id}`))) continue;
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

const branch = `fix/${d.id}`;
const wt = join(ROOT, '.claude', 'worktrees', `fix-${d.id}`);

if (flag('dry-run')) {
  out(`would work #${num} on ${branch} in ${wt}`);
  out(`  lane ${B.laneOf(num)} -> in progress -> ${route === 'playtest' ? 'needs playtest' : 'in review'}`);
  out(`  ${(issue.body.match(/^\s*- \[ \]/gm) ?? []).length} open remediation step(s)`);
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
    { cwd: wt, input: buildPrompt(issue), timeoutMs: 3_600_000 }
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
    B.moveLane(num, 'ready');
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
      B.moveLane(num, 'ready');
      out(`--- not green. Written up on #${num}; worktree kept at ${wt}.`);
      keepTree = true;
      exitCode = 1;
    } else {
      out(`--- committing`);
      git(['add', '-A'], wt);
      const msg = commitMessage(d, num, files, route === 'playtest' ? 'fix' : undefined);
      execFileSync('git', ['commit', '-q', '-F', '-'], { cwd: wt, input: msg });

      const ran = v.results.map((r) => r.name);

      let pushed = true;
      try {
        git(['push', '--force-with-lease', '-u', 'origin', `${branch}:${branch}`], wt);
        out(`--- pushed ${branch}`);
      } catch (e) {
        pushed = false;
        out(`    [warn] could not push ${branch}: ${tail(String(e.message), 3)}`);
      }

      if (route === 'playtest') {
        const port = await assignDevPort(wt);
        say(num,
          P.renderPlaytest({ branch, worktree: wt, port, files, account, ran, pushed })
        );
        keepTree = true;
      } else {
        say(num, P.renderAttempt({ branch, files, account, verified: 'pass', ran, pushed }));
      }

      const ticked = I.tickRemediation(num, account);
      out(`--- ticked ${ticked} remediation item(s)`);

      if (route === 'playtest') {
        B.moveLane(num, 'needs playtest');
        out(`--- #${num} is in Needs playtest on ${branch}; the worktree stays at ${wt}`);
      } else {
        B.moveLane(num, 'in review');
        out(`--- #${num} is In review on ${branch}; review.mjs takes it from here`);
      }
    }
  }
} catch (e) {
  out(`--- ${e.message}`);
  keepTree = true;
  say(num,
    P.renderAttempt({ branch, files: [], account: '', verified: 'fail', failures: e.message })
  );
  B.moveLane(num, 'ready');
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
