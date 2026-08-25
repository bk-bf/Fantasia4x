// The review board: docs/pr/*.md, one file per fix attempt.
//
// A pull request is two things — a branch, and a document arguing for it. Git provides the
// first natively; only the second needed a forge. So the branch stays a plain local branch
// and the argument lands here, next to the issue it answers. Nothing leaves the machine, and
// `git diff main...<branch>` is the diff view.
//
// The frontmatter reader/writer is the issue board's — same shape, same field-level patching,
// so a hand-edited body survives the loop touching `status:`.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter, serializeFrontmatter, today } from './issues.mjs';

export const PRS_DIR = (root) => join(root, 'docs', 'pr');

/** open = waiting on a person · merged = taken · abandoned = the attempt did not get green. */
export const PR_STATUSES = ['open', 'merged', 'abandoned'];

export function readPr(path) {
  const text = readFileSync(path, 'utf8');
  const { data, body } = parseFrontmatter(text);
  return { path, data, body };
}

export function listPrs(root) {
  const dir = PRS_DIR(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .map((f) => readPr(join(dir, f)));
}

export function writePr(root, { data, body }) {
  const dir = PRS_DIR(root);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${data.id}.md`);
  writeFileSync(path, serializeFrontmatter(data) + body);
  return path;
}

export function patchPr(path, patch) {
  const { data, body } = readPr(path);
  writeFileSync(path, serializeFrontmatter({ ...data, ...patch, updated: today() }) + body);
}

/**
 * The document a reviewer reads. `account` is the model's own report of what it did; the
 * table underneath is what the harness observed, so the two can be compared rather than
 * having to be trusted together.
 */
export function renderPr({ issue, branch, files, account, verified, failures }) {
  const d = issue.data;
  const lines = [
    `# fix: ${d.title}`,
    '',
    `> **Related:** [issue](../issues/${d.id}.md) · [pr/README](README.md) · [issues/README](../issues/README.md)`,
    '',
    verified === 'pass'
      ? `\`${branch}\` is committed and green. Nothing has been pushed anywhere.`
      : `\`${branch}\` has the changes but could not be made green, so it was left uncommitted for you to look at.`,
    '',
    '## What it reports doing',
    '',
    account.trim() || '_(the attempt returned nothing)_',
    ''
  ];

  if (failures) {
    lines.push('## What failed', '', failures, '');
  }

  lines.push(
    '## Review it',
    '',
    '```bash',
    `git diff main...${branch}          # the whole change`,
    `git log --oneline main..${branch}  # what it committed`,
    '```',
    '',
    verified === 'pass'
      ? [
          'Take it, or drop it:',
          '',
          '```bash',
          `git merge --no-ff ${branch}     # take it`,
          `git branch -D ${branch}          # drop it`,
          '```'
        ].join('\n')
      : `The worktree was kept so the attempt can be carried forward — \`mon steer\` runs in it.`,
    '',
    '## Facts',
    '',
    '| | |',
    '|---|---|',
    `| issue | [\`docs/issues/${d.id}.md\`](../issues/${d.id}.md) |`,
    `| severity | ${d.severity} |`,
    `| raised by | ${d.origin === 'audit' ? `the audit (${(d.rules ?? []).join(', ') || 'no rule'})` : 'a person'} |`,
    `| files changed | ${files.length} |`,
    `| verified | ${verified === 'pass' ? '`check` + `test:related` green' : 'did NOT pass'} |`,
    '',
    files.length
      ? [
          '<details><summary>files</summary>',
          '',
          ...files.map((f) => `- \`${f}\``),
          '',
          '</details>'
        ].join('\n')
      : '',
    '',
    '_Written unattended by `tools/audit/fix.mjs`. The branch is local; nothing was pushed._'
  );
  return lines.join('\n') + '\n';
}
