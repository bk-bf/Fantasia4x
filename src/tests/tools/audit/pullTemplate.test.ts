import { describe, it, expect } from 'vitest';
import { checkPullTemplate } from '../../../../tools/audit/lib/template.mjs';

const untypedFixerModule = new URL('../../../../tools/audit/lib/prs.mjs', import.meta.url).href;

const templated = [
  'Fixes #12',
  '',
  '## What changed',
  '',
  '- `tools/audit/lib/pulls.mjs`: refuses a body that skips a section.',
  '',
  '## Verified',
  '',
  '- `pnpm check` — passed',
  '',
  '## Then',
  '',
  'Merge it when it is right.'
].join('\n');

describe('checkPullTemplate', () => {
  it('accepts a body with every section of the pull request template, Play it left out', () => {
    expect(checkPullTemplate(templated)).toEqual([]);
  });

  it('names every section a free-form body leaves out, and not Play it', () => {
    const errors = checkPullTemplate('Fixes #12\n\n- Changed a thing.\n');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('.github/pull_request_template.md');
    expect(errors[0]).toContain('"what changed"');
    expect(errors[0]).toContain('"verified"');
    expect(errors[0]).toContain('"then"');
    expect(errors[0]).not.toContain('"play it"');
  });

  it('accepts the body the fixer renders on both of its routes', async () => {
    const { renderPull } = await import(untypedFixerModule);
    for (const route of ['tests', 'playtest']) {
      const body = renderPull({
        issue: 12,
        step: null,
        route,
        account: 'Changed a thing.',
        ran: ['pnpm check'],
        files: ['tools/audit/lib/pulls.mjs'],
        worktree: '/tmp/worktree',
        port: 5174
      });
      expect(checkPullTemplate(body)).toEqual([]);
    }
  });
});
