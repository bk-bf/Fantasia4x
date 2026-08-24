// Rule loading and validation. Rules are data files; the loader refuses malformed ones
// rather than letting a typo silently narrow coverage.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_DIR } from './ledger.mjs';

export const RULES_DIR = join(TOOL_DIR, 'rules');

export function stripJsonc(text) {
  let out = '';
  let inStr = false, esc = false, inLine = false, inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"') inStr = true;
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

const REQUIRED = ['id', 'family', 'title', 'question', 'trigger'];
const TIERS = new Set(['T0', 'T1', 'T2']);
const STATUSES = new Set(['active', 'draft', 'demoted']);

export function loadRules(dir = RULES_DIR) {
  const rules = [];
  const errors = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonc') || x.endsWith('.json'))) {
    let parsed;
    try {
      parsed = JSON.parse(stripJsonc(readFileSync(join(dir, f), 'utf8')));
    } catch (e) {
      errors.push(`${f}: ${e.message}`);
      continue;
    }
    for (const r of parsed) {
      for (const k of REQUIRED) if (!r[k]) errors.push(`${f}: rule ${r.id ?? '?'} missing ${k}`);
      if (r.tier && !TIERS.has(r.tier)) errors.push(`${f}: rule ${r.id} bad tier ${r.tier}`);
      if (r.status && !STATUSES.has(r.status)) errors.push(`${f}: rule ${r.id} bad status ${r.status}`);
      if (!Array.isArray(r.fail_requires) || r.fail_requires.length === 0) {
        errors.push(`${f}: rule ${r.id} needs a non-empty fail_requires -- a fail with no evidence contract is unfalsifiable`);
      }
      rules.push({ tier: 'T2', status: 'active', demotable: true, ...r, _file: f });
    }
  }
  const ids = rules.map((r) => r.id);
  const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dupes.length) errors.push(`duplicate rule ids: ${[...new Set(dupes)].join(', ')}`);
  return { rules, errors };
}
