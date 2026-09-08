export function renderAttempt({ branch, files, account, verified, failures, ran, pushed }) {
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
      ? '`review.mjs` takes it from here: it re-merges this branch onto a fresh `origin/main`, ' +
        'runs the route the Verify field names, and merges only if that is green.'
      : 'The worktree was kept so the attempt can be carried forward.',
    '',
    `Verified: ${
      verified === 'pass'
        ? (ran ?? []).map((r) => `\`${r}\``).join(', ') || 'nothing ran'
        : 'did NOT pass'
    } · files changed: ${files.length}${pushed ? ` · pushed as \`${branch}\`` : ''}`,
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

  lines.push('_Written unattended by `tools/audit/fix.mjs`._');
  return lines.join('\n') + '\n';
}

export function renderReview({ branch, route, ran, ok, failures, sha, account }) {
  const lines = [
    ok
      ? `**Reviewed on the ${route} route and merged to \`main\`.**`
      : `**Reviewed on the ${route} route and sent back — it did not pass.**`,
    ''
  ];

  if (account) lines.push('## What the review measured', '', account.trim(), '');
  if (failures) lines.push('## What failed', '', failures, '');

  lines.push(
    ok
      ? `Merged as \`${sha}\`. The branch \`${branch}\` was deleted.`
      : `The card is back in Ready and \`${branch}\` still holds the attempt.`,
    '',
    `Ran: ${(ran ?? []).map((r) => `\`${r}\``).join(', ') || 'nothing'}`,
    '',
    '_Written unattended by `tools/audit/review.mjs`._'
  );
  return lines.join('\n') + '\n';
}

export function renderPlaytest({ branch, worktree, port, files, account, ran, pushed }) {
  const lines = [
    `**Committed on \`${branch}\` and left for you to play. It is not merged.**`,
    '',
    '## What it changed',
    '',
    account.trim() || '_(the attempt returned nothing)_',
    '',
    '## Play it',
    '',
    'The worktree has its own `.devport`, so this runs alongside whatever is already on 5173 ' +
      'and does not touch your checkout.',
    '',
    '```bash',
    `cd ${worktree}`,
    './dev.sh',
    '```',
    '',
    `It comes up on http://localhost:${port}.`,
    '',
    '## Then',
    '',
    'If it plays right:',
    '',
    '```bash',
    `git merge --no-ff ${branch}`,
    '```',
    '',
    `If it does not, say what is wrong on this issue and move the card back to \`Ready\`. ` +
      `The branch and the worktree stay until you do one or the other.`,
    '',
    `Verified: ${(ran ?? []).map((r) => `\`${r}\``).join(', ') || 'nothing ran'} · files changed: ${
      files.length
    }${pushed ? ` · pushed as \`${branch}\`` : ''}`,
    ''
  ];

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

  lines.push('_Written unattended by `tools/audit/fix.mjs`._');
  return lines.join('\n') + '\n';
}
