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
      ? 'The worktree was kept.'
      : pull
        ? `Pull request #${pull}.`
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

  return lines.join('\n').trimEnd() + '\n';
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
      ''
    );
  if (failures) lines.push('## What failed', '', failures, '');
  if (!ok) lines.push('The card is in Failed.', '');

  lines.push(`Ran: ${(ran ?? []).map((r) => `\`${r}\``).join(', ') || 'nothing'}`);
  return lines.join('\n') + '\n';
}

export function renderPull({ issue, step, route, account, ran, files, worktree, port }) {
  const lines = [
    step ? `Part of #${issue}\nStep: ${step}` : `Fixes #${issue}`,
    '',
    '## What changed',
    '',
    account.trim().replace(/^(#{2,5}) /gm, '#$1 ') || '_(the fixer returned no account)_',
    '',
    '## Verified',
    '',
    ...((ran ?? []).length ? ran.map((r) => `- \`${r}\` — green on the branch`) : ['- nothing ran']),
    ''
  ];

  if (route === 'playtest' && worktree)
    lines.push(
      '## Play it',
      '',
      'The worktree has its own `.devport`, so it runs beside whatever is already on 5173.',
      '',
      '```bash',
      `cd ${worktree}`,
      './dev.sh',
      '```',
      '',
      `It comes up on http://localhost:${port}.`,
      ''
    );

  if (files?.length)
    lines.push(
      `<details><summary>${files.length} file(s)</summary>`,
      '',
      ...files.map((f) => `- \`${f}\``),
      '',
      '</details>'
    );

  return lines.join('\n').trimEnd() + '\n';
}
