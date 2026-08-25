// GitHub projection, through `gh`. Every call is idempotent on the issue file's `github:`
// field: with a number it edits, without one it creates and hands the number back.

import { execFileSync } from 'node:child_process';

export function gh(args, { cwd, input } = {}) {
  try {
    return {
      ok: true,
      out: execFileSync('gh', args, {
        cwd,
        input,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024
      }).trim()
    };
  } catch (e) {
    return { ok: false, out: '', err: `${e.stderr || e.message}`.trim() };
  }
}

export function available(cwd) {
  const r = gh(['auth', 'status'], { cwd });
  return r.ok;
}

/** Labels the board uses. Creating one that exists is not an error worth reporting. */
export function ensureLabels(cwd, labels) {
  const colours = {
    'kind:drift': 'c5def5',
    'kind:correctness': 'd73a4a',
    'kind:performance': 'fbca04',
    'kind:boundary': 'bfd4f2',
    'kind:data': '0e8a16',
    'kind:test-gap': 'd4c5f9',
    'severity:critical': 'b60205',
    'severity:high': 'd93f0b',
    'severity:medium': 'fbca04',
    'severity:low': 'c2e0c6',
    'origin:audit': 'ededed',
    'origin:human': 'ffffff'
  };
  const made = [];
  for (const l of new Set(labels)) {
    const r = gh(['label', 'create', l, '--color', colours[l] ?? 'ededed', '--force'], { cwd });
    if (r.ok) made.push(l);
  }
  return made;
}

export function createIssue(cwd, { title, body, labels }) {
  const args = ['issue', 'create', '--title', title, '--body-file', '-'];
  for (const l of labels) args.push('--label', l);
  const r = gh(args, { cwd, input: body });
  if (!r.ok) return r;
  const num = /\/issues\/(\d+)\s*$/.exec(r.out)?.[1];
  return num
    ? { ok: true, number: Number(num), url: r.out }
    : { ok: false, err: `no issue number in: ${r.out}` };
}

export function editIssue(cwd, number, { title, body, labels }) {
  const args = ['issue', 'edit', String(number), '--title', title, '--body-file', '-'];
  for (const l of labels) args.push('--add-label', l);
  return gh(args, { cwd, input: body });
}

export function commentIssue(cwd, number, body) {
  return gh(['issue', 'comment', String(number), '--body-file', '-'], { cwd, input: body });
}

export function closeIssue(cwd, number, reason) {
  return gh(['issue', 'close', String(number), '--comment', reason], { cwd });
}

export function issueState(cwd, number) {
  const r = gh(['issue', 'view', String(number), '--json', 'state,title'], { cwd });
  if (!r.ok) return null;
  try {
    return JSON.parse(r.out);
  } catch {
    return null;
  }
}

export function createPr(cwd, { title, body, base = 'main', head, draft = false }) {
  const args = [
    'pr',
    'create',
    '--title',
    title,
    '--body-file',
    '-',
    '--base',
    base,
    '--head',
    head
  ];
  if (draft) args.push('--draft');
  const r = gh(args, { cwd, input: body });
  if (!r.ok) return r;
  const num = /\/pull\/(\d+)\s*$/.exec(r.out)?.[1];
  return num
    ? { ok: true, number: Number(num), url: r.out }
    : { ok: false, err: `no PR number in: ${r.out}` };
}
