// The prompt is fixed. Same structure every batch, every night, every model: the symbol
// slice, its immediate neighbours' signatures, the rules that triggered, and the excerpt
// of the document each rule derives from. Nothing else -- no AGENTS.md, no repo wandering.
//
// Identical inputs are what make verdicts comparable across runs, so swapping the model
// is a measurable experiment rather than a reset.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const AUTHORITY_LINES = 60;

function authorityExcerpt(root, ref, cache) {
  if (!ref) return null;
  if (cache.has(ref)) return cache.get(ref);
  const [path, anchor] = ref.split('#');
  const abs = join(root, path);
  if (!existsSync(abs)) {
    cache.set(ref, null);
    return null;
  }
  const text = readFileSync(abs, 'utf8');
  let excerpt;
  if (anchor) {
    const needle = anchor.replace(/-/g, '[ -]');
    const re = new RegExp(`^#{1,6}\\s*.*${needle}.*$`, 'im');
    const m = re.exec(text);
    if (m) {
      const start = m.index;
      const rest = text.slice(start + m[0].length);
      const next = rest.search(/^#{1,4}\s/m);
      excerpt = (m[0] + rest.slice(0, next === -1 ? 4000 : next)).split('\n').slice(0, AUTHORITY_LINES).join('\n');
    }
  }
  // With no anchor, only a short document is worth quoting whole; dumping the head of a
  // 100k spec is noise the model has to read past on every batch.
  if (!excerpt) {
    const lines = text.split('\n');
    excerpt = lines.length <= 200 ? lines.slice(0, AUTHORITY_LINES).join('\n') : null;
  }
  cache.set(ref, excerpt);
  return excerpt;
}

const neighbourLine = (s) =>
  `  ${s.kind} ${s.class_name ? s.class_name + '.' : ''}${s.name}  ${(s.signature ?? '').slice(0, 120)}`;

export function buildPrompt({ root, symbol, rules, callers, callees, slice }) {
  const cache = new Map();
  const lines = [];

  lines.push('# Audit one symbol against a fixed rule list');
  lines.push('');
  lines.push('You are auditing exactly ONE symbol. Answer only the rules listed below.');
  lines.push('Do not read other files. Do not comment on anything the rules do not ask about.');
  lines.push('');
  lines.push('## Symbol');
  lines.push('');
  lines.push(`- key: ${symbol.key}`);
  lines.push(`- file: ${symbol.file} lines ${symbol.start_line}-${symbol.end_line}`);
  lines.push(`- kind: ${symbol.kind}  layer: ${symbol.layer ?? 'n/a'}  exported: ${!!symbol.exported}  covered by a test: ${!!symbol.tested}`);
  lines.push('');
  lines.push('```' + (symbol.lang === 'jsonc' ? 'jsonc' : symbol.lang === 'svelte' ? 'svelte' : 'ts'));
  lines.push(slice);
  lines.push('```');
  lines.push('');

  if (callers.length || callees.length) {
    lines.push('## Neighbours (signatures only — do not audit these)');
    lines.push('');
    if (callers.length) {
      lines.push(`Callers (${callers.length}):`);
      lines.push(...callers.slice(0, 25).map(neighbourLine));
      if (callers.length > 25) lines.push(`  ...and ${callers.length - 25} more`);
    }
    if (callees.length) {
      lines.push(`Callees (${callees.length}):`);
      lines.push(...callees.slice(0, 25).map(neighbourLine));
      if (callees.length > 25) lines.push(`  ...and ${callees.length - 25} more`);
    }
    lines.push('');
  }

  lines.push('## Rules');
  lines.push('');
  for (const r of rules) {
    lines.push(`### ${r.id} — ${r.title}`);
    lines.push('');
    lines.push(`**Question.** ${r.question}`);
    lines.push('');
    lines.push('**A `fail` must supply all of:**');
    for (const x of JSON.parse(r.fail_requires)) lines.push(`- ${x}`);
    const naf = JSON.parse(r.not_a_finding);
    if (naf.length) {
      lines.push('');
      lines.push('**Not a finding:**');
      for (const x of naf) lines.push(`- ${x}`);
    }
    const ex = authorityExcerpt(root, r.authority, cache);
    if (ex) {
      lines.push('');
      lines.push(`**Source of this rule** (${r.authority}):`);
      lines.push('');
      lines.push('> ' + ex.split('\n').join('\n> '));
    }
    lines.push('');
  }

  lines.push('## Answer');
  lines.push('');
  lines.push('Return ONE JSON object and nothing else:');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    verdicts: [
      {
        rule_id: '<the rule id>',
        status: 'pass | fail | n/a | undecidable',
        summary: '<one sentence; required for fail, otherwise optional>',
        evidence: ['<one entry per fail_requires item, in order>'],
        na_clause: '<required when status is n/a: which trigger condition you believe does not hold>',
        missing: '<required when status is undecidable: exactly what you would have needed>'
      }
    ]
  }, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('Rules for answering:');
  lines.push('- One entry per rule listed above. No extras, no omissions.');
  lines.push('- `pass` is the default. Use it when the rule simply does not fire on this code.');
  lines.push('- `fail` requires every item in that rule\'s fail_requires list, filled in with concrete file:line and values. No evidence means no fail.');
  lines.push('- `n/a` is for a rule that should never have been handed to you; name the trigger condition that does not hold. It is checked against the harness, so a wrong `n/a` is visible.');
  lines.push('- `undecidable` when the answer needs something outside this slice. Name it exactly. Guessing is worse than `undecidable`.');
  lines.push('- Do not soften a fail into an undecidable, and do not inflate a pass into a fail to look thorough.');

  return lines.join('\n');
}
