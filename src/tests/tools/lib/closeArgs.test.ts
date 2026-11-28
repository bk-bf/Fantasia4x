import { describe, it, expect } from 'vitest';
import { closeArgs } from '../../../../tools/lib/close.mjs';
import { restPlan } from '../../../../tools/lib/gh-run.mjs';

describe('pnpm issue close', () => {
  it('closes as completed naming the commit', () => {
    expect(closeArgs('4', 'abc123')).toEqual(['issue', 'close', '4', '--reason', 'completed', '--comment', 'Fixed in abc123.']);
  });

  it('closes as not planned with the reason as its comment', () => {
    expect(closeArgs('22', '', true, ' Superseded by the rework. ')).toEqual([
      'issue', 'close', '22', '--reason', 'not planned', '--comment', 'Superseded by the rework.'
    ]);
  });

  it('refuses a commit and not planned together', () => {
    expect(closeArgs('4', 'abc', true, 'x')).toMatch(/exclusive/);
  });

  it('refuses not planned without a one-line reason', () => {
    expect(closeArgs('4', '', true)).toMatch(/--reason/);
    expect(closeArgs('4', '', true, '  ')).toMatch(/--reason/);
    expect(closeArgs('4', '', true, 'a\nb')).toMatch(/one line/);
  });

  it('refuses a completed close without a commit', () => {
    expect(closeArgs('4')).toMatch(/--commit/);
  });

  it('reaches GitHub as state_reason not_planned over REST', () => {
    const calls: unknown[] = [];
    const io = { repo: () => 'bk-bf/Fantasia4x', api: (...a: unknown[]) => (calls.push(a), {}), pages: () => [], readFile: () => '' };
    const args = closeArgs('22', '', true, 'dropped');
    if (typeof args === 'string') throw new Error(args);
    restPlan(args, undefined, io)!();
    expect(calls).toEqual([
      ['POST', 'repos/bk-bf/Fantasia4x/issues/22/comments', { body: 'dropped' }],
      ['PATCH', 'repos/bk-bf/Fantasia4x/issues/22', { state: 'closed', state_reason: 'not_planned' }]
    ]);
  });
});
