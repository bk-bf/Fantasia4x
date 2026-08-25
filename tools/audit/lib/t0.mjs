// T0 — deterministic checks. Nothing here costs a token.
//
// The tier law: a check may only be handed to an agent if T0 and T1 cannot decide it.
// `adr-const` is the first thing that moved down. An ADR that states
// `JOB_GENERATION_INTERVAL_TICKS = 6` is making a claim a script can verify, so a script
// verifies it; the agent is left with the semantic half of the same ADR.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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

/** ADRs registered in codegraph.config.json but marked unverifiable -- the surface these
 *  T2 rules exist to cover. Reported so the gap stays visible rather than assumed closed. */
export function adrCoverage(root, rules) {
  const cfgPath = join(root, 'codegraph.config.json');
  if (!existsSync(cfgPath)) return null;
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  const all = new Map();
  for (const r of cfg.adrRules ?? []) {
    const prev = all.get(r.adr);
    all.set(r.adr, { adr: r.adr, checkable: (prev?.checkable ?? false) || r.checkable !== false });
  }
  const covered = new Set();
  for (const r of rules) {
    const m = /adr-?(\d+)/i.exec(r.authority ?? '') || /^A(\d{2})/.exec(r.id);
    if (m) covered.add(`ADR-${String(m[1]).padStart(3, '0')}`);
  }
  const rows = [...all.values()].map((a) => ({
    ...a,
    t2Rule: covered.has(a.adr)
  }));
  return {
    total: rows.length,
    graphCheckable: rows.filter((r) => r.checkable).length,
    t2Covered: rows.filter((r) => r.t2Rule).length,
    unguarded: rows.filter((r) => !r.checkable && !r.t2Rule).map((r) => r.adr)
  };
}
