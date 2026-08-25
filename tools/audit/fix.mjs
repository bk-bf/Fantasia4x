#!/usr/bin/env node
// Phase 3: take one ready issue, fix it in a worktree, open a PR.
//
//   node tools/audit/fix.mjs --next            the oldest ready issue
//   node tools/audit/fix.mjs --issue <slug>    a named one
//   node tools/audit/fix.mjs --next --dry-run  pick and print, change nothing
//   node tools/audit/fix.mjs --next --keep     leave the worktree for inspection
//   node tools/audit/fix.mjs --next --no-mon   do not register a mon session
//
// The gate is `ready: true` in the issue's frontmatter, and only a person sets it. An issue
// the audit raised is never picked up by the fixer that raised it.
//
// Nothing is committed unless `pnpm check` and the related tests are green, and nothing is
// pushed at all — the branch is local and a person decides whether it reaches main. A run
// that cannot get green writes up why on the review board, so a failed attempt leaves a
// record rather than a half-finished branch.
//
// Every attempt is handed to `mon` under the `fix` tag. A failed attempt keeps its worktree
// and the session runs *in* it, so `mon steer` can carry the same attempt forward from any
// machine instead of it having to start over.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as I from './lib/issues.mjs';
import * as P from './lib/prs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.AUDIT_ROOT || join(HERE, '..', '..');
const CLAUDE = process.env.AUDIT_CLAUDE || 'claude';
const MODEL = process.env.AUDIT_FIX_MODEL || 'sonnet';
const PNPM = process.env.AUDIT_PNPM || 'pnpm';
const MON = process.env.AUDIT_MON || `${process.env.HOME}/Documents/Projects/mon/mon`;
const FIX_TAG = process.env.AUDIT_FIX_TAG || 'fix';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const flag = (n) => process.argv.includes(`--${n}`);
const out = (s) => process.stdout.write(s + '\n');

function run(cmd, args, { cwd = ROOT, input, timeoutMs = 1_800_000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let o = '',
      e = '',
      settled = false;
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    const done = (r) => {
      if (!settled) {
        settled = true;
        clearTimeout(t);
        resolve(r);
      }
    };
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('error', (err) => done({ code: -1, out: o, err: `${e}spawn ${cmd}: ${err.message}` }));
    p.on('close', (code) => done({ code, out: o, err: e }));
    p.stdin.on('error', () => {});
    if (input !== undefined) {
      p.stdin.write(input);
      p.stdin.end();
    }
  });
}

const git = (args, cwd = ROOT, quiet = false) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: quiet ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'pipe']
  }).trim();

// --- pick --------------------------------------------------------------------

function pick() {
  const issues = I.listIssues(ROOT);
  const named = arg('issue', null);
  if (named) {
    const i = issues.find((x) => x.data.id === named);
    if (!i) fail(`no issue with id ${named}`);
    return i;
  }
  const ready = issues.filter(
    (i) => i.data.ready === true && i.data.status === 'open' && !i.data.pr
  );
  if (ready.length === 0) fail('no issue is ready: true, open and without a PR');
  return ready[0];
}

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
proposal. **You have been asked.** A person set \`ready: true\` on this issue, which is the
explicit go-ahead to implement its whole Remediation list. Do not stop at a proposal, do not
ask for confirmation, and do not report back a plan — make the changes.

Everything else in AGENTS.md still applies in full: the layering, the service singletons, the
in-place mutation exemption on hot per-tick paths, no ids or dev jargon in player-facing text,
the 200-line component limit, Svelte 5 runes, \`pnpm\` never \`npm\`.

# Scope

Work the Remediation list below, all of it, in this worktree. This is one class of defect and
one PR.

- Change only what the issue names. \`Out of scope\` is binding.
- Do **not** edit anything under \`docs/issues/\` — the harness owns that file.
- Do **not** run \`git commit\`, \`git push\`, or any \`gh\` command. The harness commits
  and opens the PR after it has verified your work.
- If a citation in the issue no longer holds, say so in your final message and skip it rather
  than inventing a nearby change.
- If the whole issue is already fixed, change nothing and say so.

# Verification

Before you finish, run and get green:

    ${PNPM} check
    ${PNPM} test:related <the files you changed>

Do not run the full test suite. If you cannot get both green, stop, leave the tree as it is,
and explain in your final message exactly what is failing and what you tried. A failed
attempt with a clear account is more useful than a passing one that narrowed the fix.

# Finish

End with a short account of: what you changed and why, anything in the Remediation list you
did not do and why, and the exact verification commands you ran with their result. That text
becomes the pull-request body, so write it for a reviewer, not for me.

---

# Issue ${d.id}

${issue.body}
`;
}

// --- verification ------------------------------------------------------------

function changedFiles(cwd) {
  const s = git(['status', '--porcelain'], cwd);
  return s
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
}

async function verify(cwd, files) {
  const results = [];
  const check = await run(PNPM, ['check'], { cwd, timeoutMs: 900_000 });
  results.push({
    name: `${PNPM} check`,
    code: check.code,
    tail: errorLines(check.out + check.err)
  });

  const src = files.filter((f) => /^src\/.*\.(ts|svelte)$/.test(f) && !/\.test\.ts$/.test(f));
  if (src.length) {
    const t = await run(PNPM, ['test:related', ...src], { cwd, timeoutMs: 1_800_000 });
    results.push({ name: `${PNPM} test:related`, code: t.code, tail: errorLines(t.out + t.err) });
  } else {
    results.push({ name: `${PNPM} test:related`, code: 0, tail: 'no source files changed' });
  }
  return { ok: results.every((r) => r.code === 0), results };
}

const tail = (s, n = 40) => s.trim().split('\n').slice(-n).join('\n');

/** svelte-check and vitest both bury their errors in a wall of warnings; a reviewer needs
 *  the error lines, not the last forty lines of whatever scrolled past. */
const errorLines = (s, n = 25) => {
  const hits = s.split('\n').filter((l) => /\bERROR\b|✕|FAIL|Error:|failed/i.test(l));
  return (hits.length ? hits : s.trim().split('\n')).slice(0, n).join('\n');
};

/** Surface the attempt in mon. On failure the session runs in the kept worktree, so it can
 *  be steered to finish the job rather than only describe why it stopped. */
function toMon({ issue, cwd, title, prompt }) {
  if (flag('no-mon') || !existsSync(MON)) return null;
  const r = spawnSyncSafe(MON, [
    'run',
    prompt,
    '--project',
    cwd,
    '--title',
    title,
    '--tag',
    FIX_TAG,
    '--by',
    'fix.mjs',
    '--mode',
    'acceptEdits'
  ]);
  if (r.ok) out(`--- mon: ${r.out.split('\n')[0]}`);
  else out(`--- mon registration failed: ${r.err}`);
  return r.ok ? r.out : null;
}

function spawnSyncSafe(cmd, args) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', cwd: ROOT }).trim() };
  } catch (e) {
    return { ok: false, err: `${e.stderr || e.message}`.trim() };
  }
}

// --- main --------------------------------------------------------------------

const issue = pick();
const d = issue.data;
out(`issue ${d.id} — ${d.title}`);

if (d.ready !== true) fail(`${d.id} is not ready: true`);
if (d.status !== 'open') fail(`${d.id} is ${d.status}, not open`);
if (d.pr) fail(`${d.id} already has a review at docs/pr/${d.pr}.md`);
const errs = I.validate(issue);
if (errs.length) fail(`${d.id} is invalid: ${errs.join('; ')}`);

const branch = `fix/${d.id}`;
const wt = join(ROOT, '.claude', 'worktrees', `fix-${d.id}`);

if (flag('dry-run')) {
  out(`would work ${d.id} on ${branch} in ${wt}`);
  out(`  ${(issue.body.match(/^\s*- \[ \]/gm) ?? []).length} open remediation step(s)`);
  process.exit(0);
}

out(`--- worktree ${wt}`);
if (existsSync(wt)) {
  try {
    git(['worktree', 'remove', '--force', wt]);
  } catch {
    rmSync(wt, { recursive: true, force: true });
  }
}
git(['fetch', '--quiet', 'origin', 'main']);
try {
  git(['branch', '-D', branch], ROOT, true);
} catch {
  /* no such branch yet */
}
git(['worktree', 'add', '-b', branch, wt, 'origin/main']);

I.patchIssue(issue.path, { status: 'in-progress', branch });

// A killed run would otherwise leave the issue stuck at `in-progress` with a branch set,
// which makes it permanently unclaimable by the next run -- the board would look busy
// forever. Put it back on the way out.
let released = false;
const release = () => {
  if (released) return;
  released = true;
  try {
    I.patchIssue(issue.path, { status: 'open', branch: null });
  } catch {
    /* board gone */
  }
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    out(`\n--- ${sig}: releasing ${d.id} and leaving the worktree at ${wt}`);
    release();
    process.exit(130);
  });
}

let exitCode = 0;
let keepTree = flag('keep');
try {
  out(`--- pnpm install`);
  const inst = await run(PNPM, ['install', '--prefer-offline'], { cwd: wt, timeoutMs: 900_000 });
  if (inst.code !== 0) throw new Error(`pnpm install failed:\n${tail(inst.out + inst.err)}`);

  // tsconfig.json extends ./.svelte-kit/tsconfig.json, which only exists once svelte-kit
  // has generated it. There is no prepare script, so a fresh worktree has neither, and
  // vitest dies resolving the extends before it runs a single test.
  out(`--- svelte-kit sync`);
  const sync = await run(join(wt, 'node_modules', '.bin', 'svelte-kit'), ['sync'], {
    cwd: wt,
    timeoutMs: 300_000
  });
  if (sync.code !== 0) out(`    [warn] sync exited ${sync.code}; verification may not run`);

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
  const account = res.out.trim();
  out(`    ${mins} min, ${account.length} chars back`);

  const files = changedFiles(wt).filter((f) => !f.startsWith('docs/issues/'));
  if (files.length === 0) {
    out('--- nothing changed');
    // No review file: there is nothing to review. The account still reaches mon.
    I.patchIssue(issue.path, { status: 'open', branch: null });
    toMon({
      issue,
      cwd: ROOT,
      title: `fix ${d.id} — no change`,
      prompt:
        `The fixer for ${d.id} ran and changed nothing.\n\nWhat it reported:\n\n${account}\n\n` +
        `Say in one paragraph whether the issue is already fixed, wrongly scoped, or was not ` +
        `understood. Change nothing.`
    });
    exitCode = 0;
  } else {
    out(`--- changed ${files.length} file(s)`);
    out(`--- verifying`);
    const v = await verify(wt, files);
    for (const r of v.results) out(`    ${r.code === 0 ? 'pass' : 'FAIL'}  ${r.name}`);

    if (!v.ok) {
      const detail = v.results
        .filter((r) => r.code !== 0)
        .map((r) => `**${r.name}** exited ${r.code}\n\n\`\`\`\n${r.tail}\n\`\`\``)
        .join('\n\n');
      // A failed attempt is still worth reading, so it gets a review file marked abandoned
      // rather than vanishing into a log. The branch and worktree stay put.
      P.writePr(ROOT, {
        data: {
          id: d.id,
          issue: d.id,
          branch,
          base: 'main',
          status: 'abandoned',
          verified: 'fail',
          created: I.today(),
          updated: I.today()
        },
        body: P.renderPr({ issue, branch, files, account, verified: 'fail', failures: detail })
      });
      I.patchIssue(issue.path, { status: 'open', branch: null });
      out(`--- not green. Written up at docs/pr/${d.id}.md; worktree kept.`);
      keepTree = true;
      toMon({
        issue,
        cwd: wt,
        title: `fix ${d.id} — not green`,
        prompt: [
          `A fix attempt for ${d.id} changed ${files.length} file(s) but`,
          `could not get \`${PNPM} check\` and \`${PNPM} test:related\` green, so it was not committed.`,
          `You are running in that worktree on branch \`${branch}\`, with the changes still in place.`,
          ``,
          `What failed:`,
          ``,
          detail,
          ``,
          `What the attempt reported:`,
          ``,
          account,
          ``,
          `Say in one paragraph whether this is close to working or wants a different approach.`,
          `Do not push anything — if you are steered to carry it forward, make the changes`,
          `here and get both commands green, then say so and stop.`
        ].join('\n')
      });
      exitCode = 1;
    } else {
      out(`--- committing`);
      git(['add', '-A'], wt);
      const msg =
        `fix: ${d.title}\n\n` +
        `Raised by the audit ledger${d.rules?.length ? ` (${d.rules.join(', ')})` : ''}; ` +
        `see docs/issues/${d.id}.md.\n\n` +
        `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`;
      execFileSync('git', ['commit', '-q', '-F', '-'], { cwd: wt, input: msg });

      // Deliberately NOT pushed. The branch stays in this repo, the argument for it goes on
      // the review board next to the issue, and a person decides whether it reaches main.
      P.writePr(ROOT, {
        data: {
          id: d.id,
          issue: d.id,
          branch,
          base: 'main',
          status: 'open',
          verified: 'pass',
          created: I.today(),
          updated: I.today()
        },
        body: P.renderPr({ issue, branch, files, account, verified: 'pass' })
      });
      I.patchIssue(issue.path, { status: 'in-review', pr: d.id, branch });
      out(`--- review at docs/pr/${d.id}.md on ${branch} (local, not pushed)`);
      toMon({
        issue,
        cwd: ROOT,
        title: `fix ${d.id} — ready to review`,
        prompt: [
          `A fix for ${d.id} is committed on the local branch \`${branch}\` and written up at`,
          `docs/pr/${d.id}.md. It changed ${files.length} file(s) and \`${PNPM} check\` plus`,
          `\`${PNPM} test:related\` were green. Nothing was pushed.`,
          ``,
          `Read the diff (\`git diff main...${branch}\`) against the issue at`,
          `docs/issues/${d.id}.md and say, in one paragraph a person can read on a phone:`,
          `which remediation steps it actually did, which it skipped, and the one thing a`,
          `reviewer should look at hardest. Flag anything outside the issue's scope.`,
          `Do not merge, do not push, do not change the branch.`,
          ``,
          `What the attempt reported:`,
          ``,
          account
        ].join('\n')
      });
    }
  }
} catch (e) {
  out(`--- ${e.message}`);
  I.patchIssue(issue.path, { status: 'open', branch: null });
  toMon({
    issue,
    cwd: ROOT,
    title: `fix ${d.id} — failed`,
    prompt:
      `The fixer for ${d.id} failed before it could verify ` +
      `anything, with:\n\n${e.message}\n\nSay in one paragraph whether this is a ` +
      `harness problem or an issue problem. Change nothing.`
  });
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
