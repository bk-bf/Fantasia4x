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
      : 'The card is in Failed. Move it to Ready to have the fixer try again; the next attempt is ' +
        'pushed to this pull request, and the fixer reads what is written here before it starts.',
    '',
    `Ran: ${(ran ?? []).map((r) => `\`${r}\``).join(', ') || 'nothing'}`,
    '',
    '_Written unattended by `tools/audit/review.mjs`._'
  );
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
    '',
    route === 'playtest'
      ? 'The reviewer skips a playtest pull request, because whether it plays right is yours to ' +
        'judge. CI still runs on it.'
      : `\`review.mjs\` re-merges this onto a fresh \`dev\`, runs the ${route} route again and sets ` +
        '`audit/review` on the latest commit. CI runs on it too.',
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

  lines.push(
    '## Then',
    '',
    'Merge it when it is right. If it is not, say what is wrong here and move the card back to ' +
      '`Ready`; the fixer reads this pull request before its next attempt.',
    ''
  );

  if (files?.length)
    lines.push(
      `<details><summary>${files.length} file(s)</summary>`,
      '',
      ...files.map((f) => `- \`${f}\``),
      '',
      '</details>',
      ''
    );

  lines.push('_Written unattended by `tools/audit/fix.mjs`._');
  return lines.join('\n') + '\n';
}
