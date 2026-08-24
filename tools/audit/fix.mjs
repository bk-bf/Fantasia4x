#!/usr/bin/env node
// Phase 3: take one ready issue, fix it in a worktree, open a PR.
//
//   node tools/audit/fix.mjs --next            the oldest ready issue
//   node tools/audit/fix.mjs --issue <slug>    a named one
//   node tools/audit/fix.mjs --next --dry-run  pick and print, change nothing
//   node tools/audit/fix.mjs --next --keep     leave the worktree for inspection
//
// The gate is `ready: true` in the issue's frontmatter, and only a person sets it. An issue
// the audit raised is never picked up by the fixer that raised it.
//
// Nothing is pushed unless `pnpm check` and the related tests are green. A run that cannot
// get there pushes nothing and says why on the GitHub issue, so a failed attempt leaves a
// record rather than a half-finished branch.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as I from './lib/issues.mjs';
import * as GH from './lib/github.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.AUDIT_ROOT || join(HERE, '..', '..');
const CLAUDE = process.env.AUDIT_CLAUDE || 'claude';
const MODEL = process.env.AUDIT_FIX_MODEL || 'sonnet';
const PNPM = process.env.AUDIT_PNPM || 'pnpm';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const flag = (n) => process.argv.includes(`--${n}`);
const out = (s) => process.stdout.write(s + '\n');

function run(cmd, args, { cwd = ROOT, input, timeoutMs = 1_800_000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let o = '', e = '', settled = false;
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    const done = (r) => { if (!settled) { settled = true; clearTimeout(t); resolve(r); } };
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('error', (err) => done({ code: -1, out: o, err: `${e}spawn ${cmd}: ${err.message}` }));
    p.on('close', (code) => done({ code, out: o, err: e }));
    p.stdin.on('error', () => {});
    if (input !== undefined) { p.stdin.write(input); p.stdin.end(); }
  });
}

const git = (args, cwd = ROOT) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();

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

function fail(msg) { out(`ABORT: ${msg}`); process.exit(1); }

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
- Do **not** run \`git commit\`, \`git push\`, or any \`gh\` command. The harness commits, pushes
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

# Issue ${d.id} (GitHub #${d.github})

${issue.body}
`;
}

// --- verification ------------------------------------------------------------

function changedFiles(cwd) {
  const s = git(['status', '--porcelain'], cwd);
  return s.split('\n').filter(Boolean).map((l) => l.slice(3).trim()).filter(Boolean);
}

async function verify(cwd, files) {
  const results = [];
  const check = await run(PNPM, ['check'], { cwd, timeoutMs: 900_000 });
  results.push({ name: `${PNPM} check`, code: check.code, tail: tail(check.out + check.err) });

  const src = files.filter((f) => /^src\/.*\.(ts|svelte)$/.test(f) && !/\.test\.ts$/.test(f));
  if (src.length) {
    const t = await run(PNPM, ['test:related', ...src], { cwd, timeoutMs: 1_800_000 });
    results.push({ name: `${PNPM} test:related`, code: t.code, tail: tail(t.out + t.err) });
  } else {
    results.push({ name: `${PNPM} test:related`, code: 0, tail: 'no source files changed' });
  }
  return { ok: results.every((r) => r.code === 0), results };
}

const tail = (s, n = 40) => s.trim().split('\n').slice(-n).join('\n');

// --- main --------------------------------------------------------------------

const issue = pick();
const d = issue.data;
out(`issue ${d.id} — ${d.title}`);

if (d.ready !== true) fail(`${d.id} is not ready: true`);
if (d.status !== 'open') fail(`${d.id} is ${d.status}, not open`);
if (d.pr) fail(`${d.id} already has PR #${d.pr}`);
if (!d.github) fail(`${d.id} has no GitHub issue — run \`audit publish --id ${d.id}\` first`);
const errs = I.validate(issue);
if (errs.length) fail(`${d.id} is invalid: ${errs.join('; ')}`);

const branch = `fix/${d.id}`;
const wt = join(ROOT, '.claude', 'worktrees', `fix-${d.id}`);

if (flag('dry-run')) {
  out(`would work ${d.id} on ${branch} in ${wt}`);
  out(`  ${(issue.body.match(/^\s*- \[ \]/gm) ?? []).length} open remediation step(s)`);
  process.exit(0);
}

if (!GH.available(ROOT)) fail('gh is not authenticated here');

out(`--- worktree ${wt}`);
if (existsSync(wt)) { try { git(['worktree', 'remove', '--force', wt]); } catch { rmSync(wt, { recursive: true, force: true }); } }
git(['fetch', '--quiet', 'origin', 'main']);
try { git(['branch', '-D', branch]); } catch { /* no such branch yet */ }
git(['worktree', 'add', '-b', branch, wt, 'origin/main']);

I.patchIssue(issue.path, { status: 'in-progress', branch });

let exitCode = 0;
try {
  out(`--- pnpm install`);
  const inst = await run(PNPM, ['install', '--prefer-offline'], { cwd: wt, timeoutMs: 900_000 });
  if (inst.code !== 0) throw new Error(`pnpm install failed:\n${tail(inst.out + inst.err)}`);

  out(`--- ${CLAUDE} (${MODEL})`);
  const t0 = Date.now();
  const res = await run(CLAUDE, [
    '--print', '--model', MODEL, '--permission-mode', 'acceptEdits'
  ], { cwd: wt, input: buildPrompt(issue), timeoutMs: 3_600_000 });
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  if (res.code !== 0) throw new Error(`the model exited ${res.code}:\n${tail(res.err)}`);
  const account = res.out.trim();
  out(`    ${mins} min, ${account.length} chars back`);

  const files = changedFiles(wt).filter((f) => !f.startsWith('docs/issues/'));
  if (files.length === 0) {
    out('--- nothing changed');
    GH.commentIssue(ROOT, d.github,
      `The fixer ran and changed nothing.\n\n${account}\n\n_No PR opened._`);
    I.patchIssue(issue.path, { status: 'open', branch: null });
    exitCode = 0;
  } else {
    out(`--- changed ${files.length} file(s)`);
    out(`--- verifying`);
    const v = await verify(wt, files);
    for (const r of v.results) out(`    ${r.code === 0 ? 'pass' : 'FAIL'}  ${r.name}`);

    if (!v.ok) {
      const detail = v.results.filter((r) => r.code !== 0)
        .map((r) => `**${r.name}** exited ${r.code}\n\n\`\`\`\n${r.tail}\n\`\`\``).join('\n\n');
      GH.commentIssue(ROOT, d.github,
        `The fixer produced a change but could not get it green, so nothing was pushed.\n\n` +
        `${detail}\n\n---\n\n${account}`);
      I.patchIssue(issue.path, { status: 'open', branch: null });
      out('--- not green; nothing pushed. The account is on the issue.');
      exitCode = 1;
    } else {
      out(`--- committing`);
      git(['add', '-A'], wt);
      const msg = `fix: ${d.title}\n\nCloses #${d.github}\n\n` +
        `Raised by the audit ledger${d.rules?.length ? ` (${d.rules.join(', ')})` : ''}; ` +
        `see docs/issues/${d.id}.md.\n\n` +
        `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`;
      execFileSync('git', ['commit', '-q', '-F', '-'], { cwd: wt, input: msg });
      git(['push', '-q', '-u', 'origin', branch], wt);

      const body = [
        `Closes #${d.github}`, '',
        account, '',
        '---', '',
        `| | |`, `|---|---|`,
        `| issue | [\`docs/issues/${d.id}.md\`](docs/issues/${d.id}.md) |`,
        `| severity | ${d.severity} |`,
        `| raised by | ${d.origin === 'audit' ? `the audit (${(d.rules ?? []).join(', ')})` : 'a person'} |`,
        `| verified | \`${PNPM} check\`, \`${PNPM} test:related\` |`, '',
        `Opened unattended by \`tools/audit/fix.mjs\`. Review it as you would any other PR.`
      ].join('\n');

      const pr = GH.createPr(ROOT, { title: `fix: ${d.title}`, body, base: 'main', head: branch });
      if (pr.ok) {
        I.patchIssue(issue.path, { status: 'in-review', pr: pr.number, branch });
        out(`--- PR #${pr.number}  ${pr.url}`);
      } else {
        I.patchIssue(issue.path, { status: 'open', branch });
        out(`--- push succeeded but the PR did not open: ${pr.err}`);
        exitCode = 1;
      }
    }
  }
} catch (e) {
  out(`--- ${e.message}`);
  if (d.github) {
    GH.commentIssue(ROOT, d.github, `The fixer failed before it could verify anything.\n\n\`\`\`\n${e.message}\n\`\`\``);
  }
  I.patchIssue(issue.path, { status: 'open', branch: null });
  exitCode = 1;
} finally {
  if (flag('keep')) {
    out(`--- worktree kept at ${wt}`);
  } else {
    try { git(['worktree', 'remove', '--force', wt]); } catch { rmSync(wt, { recursive: true, force: true }); }
    out('--- worktree removed');
  }
}

process.exit(exitCode);
