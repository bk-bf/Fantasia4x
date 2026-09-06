export function renderAttempt({ branch, files, account, verified, failures, ran }) {
  const lines = [
    verified === 'pass'
      ? `**Fix attempt on \`${branch}\` — committed, and every command below passed.**`
      : `**Fix attempt on \`${branch}\` — could not be made green, left uncommitted.**`,
    '',
    '## What it reports doing',
    '',
    account.trim() || '_(the attempt returned nothing)_',
    ''
  ];

  if (failures) lines.push('## What failed', '', failures, '');

  lines.push(
    '## Review it',
    '',
    '```bash',
    `git diff main...${branch}`,
    `git log --oneline main..${branch}`,
    '```',
    '',
    verified === 'pass'
      ? ['```bash', `git merge --no-ff ${branch}`, `git branch -D ${branch}`, '```'].join('\n')
      : 'The worktree was kept so the attempt can be carried forward — `mon steer` runs in it.',
    '',
    `Verified: ${
      verified === 'pass'
        ? (ran ?? []).map((r) => `\`${r}\``).join(', ') || 'nothing ran'
        : 'did NOT pass'
    } · files changed: ${files.length}`,
    ''
  );

  if (files.length) {
    lines.push(
      '<details><summary>files</summary>',
      '',
      ...files.map((f) => `- \`${f}\``),
      '',
      '</details>',
      ''
    );
  }

  lines.push('_Written unattended by `tools/audit/fix.mjs`. The branch is local; nothing was pushed._');
  return lines.join('\n') + '\n';
}
