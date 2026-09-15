import { describe, it, expect } from 'vitest';
import { checkPullSignOff, checkPullTemplate } from '../../../../tools/audit/lib/template.mjs';

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
  '- `pnpm check` — passed'
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
    expect(errors[0]).not.toContain('"play it"');
  });
});

describe('checkPullSignOff', () => {
  it('accepts a body that says what changed and how it was verified', () => {
    expect(checkPullSignOff(templated)).toEqual([]);
  });

  it.each([
    ['a Then section', '\n\n## Then\n\nMerge it when it is right.'],
    ['a Generated with Claude Code line', '\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'],
    ['a Written unattended by line', '\n\n_Written unattended by `tools/audit/fix.mjs`._']
  ])('refuses %s', (_, tail) => {
    expect(checkPullSignOff(templated + tail)).toHaveLength(1);
  });
});

describe('the body the fixer renders', () => {
  it('passes both checks on both of its routes', async () => {
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
      expect(checkPullSignOff(body)).toEqual([]);
    }
  });
});
