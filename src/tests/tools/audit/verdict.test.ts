import { describe, it, expect } from 'vitest';
import { validate, MAX_EVIDENCE_CHARS } from '../../../../tools/audit/lib/verdict.mjs';

const rule = { id: 'F01', fail_requires: JSON.stringify(['the test', 'the gap']) };
const fail = (evidence: string[]) =>
  validate(
    {
      verdicts: [
        { rule_id: 'F01', status: 'fail', summary: 'the test asserts one branch of five', evidence }
      ]
    },
    { expectedRules: [rule], symbolKey: 'src/a.ts::f#0', hashes: new Map([['F01', {}]]) }
  );

describe('validate', () => {
  it('accepts a fail whose evidence items are each within the limit', () => {
    const r = fail(['x'.repeat(MAX_EVIDENCE_CHARS), 'src/a.ts:3 asserts only the hostile branch']);
    expect(r.ok).toHaveLength(1);
    expect(r.rejected).toEqual([]);
  });

  it('rejects a fail with an evidence item over the limit', () => {
    const r = fail(['x'.repeat(MAX_EVIDENCE_CHARS + 1), 'src/a.ts:3 asserts only the hostile branch']);
    expect(r.ok).toEqual([]);
    expect(r.rejected[0].reason).toBe(`1 evidence item(s) over ${MAX_EVIDENCE_CHARS} characters`);
  });
});
