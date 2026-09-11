export function renderAttempt({ branch, files, account, verified, failures, ran, pushed, pull }) {
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
    verified !== 'pass'
      ? 'The worktree was kept so the attempt can be carried forward.'
      : pull
        ? `Pull request #${pull}. \`review.mjs\` re-merges it onto a fresh \`origin/dev\`, runs the ` +
          'route the Verify field names and posts its result there, and CI runs on it too. ' +
          'Merging it is yours.'
        : `\`${branch}\` could not be pushed, so no pull request was opened.`,
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

export function renderReview({ route, ran, ok, failures, account, outside }) {
  const lines = [
    ok
      ? `**Reviewed on the ${route} route and passed.**`
      : `**Reviewed on the ${route} route and sent back — it did not pass.**`,
    ''
  ];

  if (account) lines.push('## What the review measured', '', account.trim(), '');
  if (outside?.length)
    lines.push(
      '## It reached past the files this issue cites',
      '',
      ...outside.map((f) => `- \`${f}\``),
      '',
      'That is often the right fix — removing a restated roster means editing whatever declares ' +
        'the set. It is named here so it is visible before you merge it, not because it is wrong.',
      ''
    );
  if (failures) lines.push('## What failed', '', failures, '');

  lines.push(
    ok
      ? 'Merging this pull request is yours.'
      : 'The card is back in Ready. The next attempt is pushed to this pull request, and the ' +
        'fixer reads what is written here before it starts.',
    '',
    `Ran: ${(ran ?? []).map((r) => `\`${r}\``).join(', ') || 'nothing'}`,
    '',
    '_Written unattended by `tools/audit/review.mjs`._'
  );
  return lines.join('\n') + '\n';
}

export function renderPlaytest({ branch, worktree, port, files, account, ran, pushed, pull }) {
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
    pull
      ? `If it plays right, merge pull request #${pull}. If it does not, say what is wrong on ` +
        'the pull request and move the card back to `Ready`; the fixer reads the pull request ' +
        'before its next attempt.'
      : `\`${branch}\` could not be pushed, so there is no pull request yet.`,
    '',
    'The branch and the worktree stay until it is merged or worked again.',
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
