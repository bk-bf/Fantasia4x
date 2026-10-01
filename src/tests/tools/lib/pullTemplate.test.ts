import { describe, it, expect } from 'vitest';
import { checkSignOff, checkPullTemplate } from '../../../../tools/lib/template.mjs';

const templated = [
  'Fixes #12',
  '',
  '## What changed',
  '',
  '- `tools/lib/pulls.mjs`: refuses a body that skips a section.',
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

describe('checkSignOff', () => {
  it('accepts a body that says what changed and how it was verified', () => {
    expect(checkSignOff(templated)).toEqual([]);
  });

  it.each([
    ['a Then section', '\n\n## Then\n\nMerge it when it is right.'],
    ['a Generated with Claude Code line', '\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)'],
    ['a Written unattended by line', '\n\n_Written unattended by `tools/audit/fix.mjs`._']
  ])('refuses %s', (_, tail) => {
    expect(checkSignOff(templated + tail)).toHaveLength(1);
  });
});
