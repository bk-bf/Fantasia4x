import { describe, it, expect } from 'vitest';
import {
  parseSvelteCheck,
  parseEslint,
  verdict,
  summary,
  annotation,
  note
} from '../../../../tools/audit/warnings.mjs';

const SVELTE_CHECK = [
  '1789268648646 START "/repo"',
  '1789268648700 {"type":"WARNING","filename":"src/lib/components/pawn/PawnNeeds.svelte","start":{"line":8,"character":13},"end":{"line":8,"character":22},"message":"Component has unused export property \'gameState\'.","code":"export_let_unused","source":"svelte"}',
  '1789268648701 {"type":"ERROR","filename":"/repo/src/lib/a.ts","start":{"line":0,"character":0},"end":{"line":0,"character":1},"message":"Type \'string\' is not assignable to type \'number\'.","code":2322,"source":"ts"}',
  '1789268648702 COMPLETED 20 FILES 1 ERRORS 1 WARNINGS 2 FILES_WITH_PROBLEMS'
].join('\n');

const ESLINT = JSON.stringify([
  {
    filePath: '/repo/tools/x.mjs',
    messages: [
      { ruleId: 'no-unused-vars', severity: 1, message: "'a' is defined but never used.", line: 3, column: 7 },
      { ruleId: null, severity: 2, message: 'Parsing error: Unexpected token', line: 9, column: 1 }
    ]
  },
  { filePath: '/repo/src/y.ts', messages: [] }
]);

const warning = (file: string, rule: string, message = 'm') => ({
  tool: 'svelte-check',
  severity: 'warning',
  rule,
  file,
  line: 148,
  column: 1,
  message
});

describe('parseSvelteCheck', () => {
  it('reads each diagnostic with one-based positions and a path relative to the checkout', () => {
    expect(parseSvelteCheck(SVELTE_CHECK, '/repo')).toEqual([
      {
        tool: 'svelte-check',
        severity: 'warning',
        rule: 'export_let_unused',
        file: 'src/lib/components/pawn/PawnNeeds.svelte',
        line: 9,
        column: 14,
        message: "Component has unused export property 'gameState'."
      },
      {
        tool: 'svelte-check',
        severity: 'error',
        rule: '2322',
        file: 'src/lib/a.ts',
        line: 1,
        column: 1,
        message: "Type 'string' is not assignable to type 'number'."
      }
    ]);
  });
});

describe('parseEslint', () => {
  it('reads warnings and errors, naming a message with no rule a parse error', () => {
    expect(parseEslint(ESLINT, '/repo')).toEqual([
      {
        tool: 'eslint',
        severity: 'warning',
        rule: 'no-unused-vars',
        file: 'tools/x.mjs',
        line: 3,
        column: 7,
        message: "'a' is defined but never used."
      },
      {
        tool: 'eslint',
        severity: 'error',
        rule: 'parse',
        file: 'tools/x.mjs',
        line: 9,
        column: 1,
        message: 'Parsing error: Unexpected token'
      }
    ]);
  });
});

describe('verdict', () => {
  const two = [warning('a.svelte', 'r'), warning('b.svelte', 'r')];

  it('passes at the budget', () => {
    expect(verdict('svelte-check', two, 2)).toEqual({ ok: true, line: 'svelte-check: 2 warnings, at its budget of 2' });
  });

  it('fails a warning count over the budget', () => {
    expect(verdict('svelte-check', two, 1).ok).toBe(false);
  });

  it('passes under the budget and says to lower it', () => {
    expect(verdict('svelte-check', two, 5).line).toContain('lower svelte-check in tools/audit/warning-budget.json to 2');
  });

  it('fails on any error', () => {
    expect(verdict('eslint', [{ ...warning('a', 'parse'), severity: 'error' }], 10).ok).toBe(false);
  });
});

describe('summary', () => {
  it('lists the touched files first, then every warning by rule, with markup escaped', () => {
    const found = [
      warning('src/Card.svelte', 'a11y_no_static_element_interactions', '`<div>` with a click handler must have an ARIA role'),
      warning('src/Log.svelte', 'a11y_no_static_element_interactions'),
      warning('src/Table.svelte', 'state_referenced_locally')
    ];
    const text = summary('svelte-check', found, 3, new Set(['src/Card.svelte']));
    expect(text.indexOf('In files this change touches')).toBeLessThan(text.indexOf('<details>'));
    expect(text).toContain('- `src/Card.svelte:148` warning `a11y_no_static_element_interactions`: `&lt;div&gt;` with a click handler');
    expect(text).toContain('<summary>warning <code>a11y_no_static_element_interactions</code>: 2</summary>');
    expect(text).toContain('<summary>warning <code>state_referenced_locally</code>: 1</summary>');
  });
});

describe('annotation', () => {
  it('writes a workflow command with the separators in its properties escaped', () => {
    expect(annotation({ ...warning('src/a,b.svelte', 'r:x'), message: 'one\ntwo' })).toBe(
      '::warning file=src/a%2Cb.svelte,line=148,col=1,title=svelte-check r%3Ax::one'
    );
  });
});

describe('note', () => {
  it('keeps the counts, the rules and what to annotate: errors anywhere, warnings in touched files', () => {
    const found = [warning('src/a.svelte', 'r'), warning('src/b.svelte', 'r'), { ...warning('src/c.ts', '2322'), severity: 'error' }];
    const n = note('svelte-check', found, 2, new Set(['src/a.svelte']));
    expect(n).toMatchObject({ tool: 'svelte-check', budget: 2, errors: 1, warnings: 2 });
    expect(n.rules).toEqual([
      { rule: '2322', severity: 'error', count: 1 },
      { rule: 'r', severity: 'warning', count: 2 }
    ]);
    expect(n.annotate.map((a: { file: string }) => a.file)).toEqual(['src/a.svelte', 'src/c.ts']);
  });
});
