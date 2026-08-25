// T0 — deterministic checks. Nothing here costs a token.
//
// The tier law: a check may only be handed to an agent if T0 and T1 cannot decide it.
// `adr-const` is the first thing that moved down. An ADR that states
// `JOB_GENERATION_INTERVAL_TICKS = 6` is making a claim a script can verify, so a script
// verifies it; the agent is left with the semantic half of the same ADR.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkFiles } from './extract.mjs';

const ADR_HEADING = /^#{2,4}\s*(ADR-\d+)\b.*$/gim;

/** Constants an ADR declares in its Decision section, as { adr, name, value }. */
export function declaredConstants(root, doc = 'docs/game/DECISIONS.md') {
  const path = join(root, doc);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');

  const heads = [...text.matchAll(ADR_HEADING)].map((m) => ({ adr: m[1], at: m.index }));
  const out = [];
  for (let i = 0; i < heads.length; i++) {
    const body = text.slice(heads[i].at, heads[i + 1]?.at ?? text.length);
    // Only the Decision section makes binding claims; Context recites history.
    const dec = body.match(/####\s*Decision([\s\S]*?)(?=\n####\s|\n---|$)/);
    const scope = dec ? dec[1] : body;
    for (const m of scope.matchAll(/`?\b([A-Z][A-Z0-9_]{4,})\b`?\s*=\s*`?(-?\d+(?:\.\d+)?)`?/g)) {
      out.push({ adr: heads[i].adr, name: m[1], value: m[2] });
    }
  }
  return out;
}

/** Compare each declared constant against its definition in the source. */
export function adrConstDrift(root) {
  const declared = declaredConstants(root);
  if (declared.length === 0) return { declared: 0, findings: [] };

  const names = new Set(declared.map((d) => d.name));
  const defs = new Map(); // name -> [{ file, line, value }]
  for (const abs of walkFiles(join(root, 'src'), ['.ts'])) {
    const text = readFileSync(abs, 'utf8');
    for (const name of names) {
      if (!text.includes(name)) continue;
      const re = new RegExp(
        `\\b(?:const|let|readonly|static)\\s+${name}\\s*(?::[^=]+)?=\\s*(-?\\d+(?:\\.\\d+)?)`,
        'g'
      );
      let m;
      while ((m = re.exec(text)) !== null) {
        const line = text.slice(0, m.index).split('\n').length;
        if (!defs.has(name)) defs.set(name, []);
        defs.get(name).push({ file: abs.slice(root.length + 1), line, value: m[1] });
      }
    }
  }

  const findings = [];
  for (const d of declared) {
    const found = defs.get(d.name);
    if (!found || found.length === 0) {
      findings.push({
        ...d,
        kind: 'undefined-in-source',
        detail: 'the ADR declares it; no source file defines it'
      });
      continue;
    }
    for (const f of found) {
      if (Number(f.value) !== Number(d.value)) {
        findings.push({
          ...d,
          kind: 'value-drift',
          detail: `${d.adr} says ${d.value}, ${f.file}:${f.line} says ${f.value}`
        });
      }
    }
  }
  return { declared: declared.length, findings };
}

/** Every ADR the decisions doc declares, and whether a T2 rule covers it. The doc is the
 *  register -- an ADR exists because it is written there, so the gap is measured against
 *  that rather than against a second list somewhere else that can fall behind it. */
export function adrCoverage(root, rules, doc = 'docs/game/DECISIONS.md') {
  const path = join(root, doc);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  const declared = [...new Set([...text.matchAll(ADR_HEADING)].map((m) => m[1]))];
  if (declared.length === 0) return null;

  const covered = new Set();
  for (const r of rules) {
    const m = /adr-?(\d+)/i.exec(r.authority ?? '') || /^A(\d{2})/.exec(r.id);
    if (m) covered.add(`ADR-${String(m[1]).padStart(3, '0')}`);
  }
  // Headings are written ADR-001 or ADR-1; compare on the padded form.
  const pad = (a) => `ADR-${a.slice(4).padStart(3, '0')}`;
  const rows = declared.map((adr) => ({ adr, t2Rule: covered.has(pad(adr)) }));
  return {
    total: rows.length,
    t2Covered: rows.filter((r) => r.t2Rule).length,
    unguarded: rows.filter((r) => !r.t2Rule).map((r) => r.adr)
  };
}

/** Drop comments, so prose naming a function is not read as a call to it. */
const stripComments = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Architecture seams, checked by reading the code rather than a map of it.
 *
 * A chokepoint is only a chokepoint while nothing routes around it, and routing around one
 * is invisible in review: the new call site looks like every other call site. Each rule
 * names a function (or a module) and the exact symbols allowed to reach it; every other
 * symbol whose body calls it is a finding. Symbol bodies come from the same AST spans the
 * ledger is built from, so "which function is this call inside" is exact.
 */
export function seamViolations(root, symbols) {
  const rulePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'seams.jsonc');
  if (!existsSync(rulePath)) return { rules: 0, findings: [] };
  const rules = JSON.parse(stripComments(readFileSync(rulePath, 'utf8')));
  const findings = [];

  for (const r of rules) {
    const allow = new Set(r.allow ?? []);
    if (r.kind === 'module') {
      const re = new RegExp(`from\\s*['"\`][^'"\`]*${r.target}['"\`]`);
      for (const abs of walkFiles(join(root, 'src'), ['.ts', '.svelte'])) {
        const file = abs.slice(root.length + 1);
        if (allow.has(file) || file.endsWith(`${r.target}.ts`)) continue;
        if (re.test(stripComments(readFileSync(abs, 'utf8'))))
          findings.push({ adr: r.adr, where: file, detail: r.msg });
      }
      continue;
    }
    const re = new RegExp(`(?:\\.|\\b)${r.target}\\s*\\(`);
    for (const s of symbols) {
      const id = `${s.file}::${s.className ? s.className + '.' : ''}${s.name}`;
      if (allow.has(id) || s.name === r.target) continue;
      if (re.test(stripComments(s.text ?? ''))) {
        findings.push({ adr: r.adr, where: `${id}  ${s.file}:${s.startLine}`, detail: r.msg });
      }
    }
  }
  return { rules: rules.length, findings };
}
