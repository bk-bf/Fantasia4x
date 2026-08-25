// Phase 2: confirmed findings -> issue files.
//
// One finding is not one issue. A rule firing forty times is one class of defect, and the
// board's unit of work is the class -- that is what a fixer can close in a single PR. So
// findings group by (rule, module group), and the issue carries every citation.

import { readIssue, writeIssue, patchIssue, today, ISSUES_DIR } from './issues.mjs';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// Family defaults; an individual rule may override with its own `kind`/`severity`.
const FAMILY_KIND = {
  contract: 'drift',
  boundary: 'boundary',
  'silent-failure': 'correctness',
  units: 'correctness',
  'hot-path': 'performance',
  tests: 'test-gap',
  reachability: 'correctness',
  data: 'data',
  'single-source': 'drift'
};
const FAMILY_SEVERITY = {
  contract: 'high',
  boundary: 'medium',
  'silent-failure': 'high',
  units: 'high',
  'hot-path': 'medium',
  tests: 'low',
  reachability: 'low',
  data: 'medium',
  'single-source': 'high'
};

const MAX_EVIDENCE = 20;

/** Two path segments is the coherence unit: `game/services`, `components/UI`. A rule firing
 *  across unrelated trees becomes several issues rather than one unreviewable PR. */
function groupOf(file) {
  const parts = file
    .replace(/^src\/lib\//, '')
    .replace(/^src\//, '')
    .split('/');
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/') || 'root';
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function groupFindings(db) {
  const rows = db
    .prepare(
      `
    SELECT f.id, f.symbol_key, f.rule_id, f.summary, f.evidence, f.state,
           s.file, s.start_line, s.name, s.kind AS symbol_kind,
           r.family, r.title AS rule_title, r.authority
      FROM finding f
      JOIN symbol s ON s.key = f.symbol_key
      JOIN rule r ON r.id = f.rule_id
     WHERE f.state = 'open'
     ORDER BY f.rule_id, s.file, s.start_line`
    )
    .all();

  const groups = new Map();
  for (const r of rows) {
    const g = groupOf(r.file);
    const key = `${r.rule_id}|${g}`;
    if (!groups.has(key)) {
      groups.set(key, {
        rule_id: r.rule_id,
        family: r.family,
        rule_title: r.rule_title,
        authority: r.authority,
        group: g,
        findings: []
      });
    }
    groups.get(key).findings.push(r);
  }
  return [...groups.values()];
}

function renderBody(g) {
  const n = g.findings.length;
  const shown = g.findings.slice(0, MAX_EVIDENCE);
  const rest = n - shown.length;

  const lines = [];
  lines.push(`# ${titleFor(g)}`);
  lines.push('');
  lines.push(
    `> **Related:** [issues/README](README.md) · [tools/audit](../../tools/audit/README.md)` +
      (g.authority ? ` · [rule source](../../${g.authority.split('#')[0]})` : '')
  );
  lines.push('');

  lines.push('## What breaks');
  lines.push('');
  lines.push(
    `Rule \`${g.rule_id}\` — ${g.rule_title} — holds in ${n} ` +
      `place${n === 1 ? '' : 's'} under \`${g.group}\`. Each one is listed below with the ` +
      `evidence the audit required before it would record a fail.`
  );
  lines.push('');
  if (shown.length) {
    lines.push(`The clearest case: ${shown[0].summary}`);
    lines.push('');
  }

  lines.push('## Evidence');
  lines.push('');
  for (const f of shown) {
    const rel = `../../${f.file}`;
    lines.push(`- [\`${f.file}:${f.start_line}\`](${rel}#L${f.start_line}) — ${f.summary}`);
    for (const e of safeJson(f.evidence)) lines.push(`  - ${e}`);
  }
  if (rest > 0) {
    lines.push('');
    lines.push(
      `…and ${rest} more under the same rule. \`node tools/audit/audit.mjs findings\` lists them all.`
    );
  }
  lines.push('');

  lines.push('## Why nothing caught it');
  lines.push('');
  lines.push(
    `Nothing below the judgment tier can decide this one: it is why \`${g.rule_id}\` ` +
      `exists at T2 rather than as a lint rule or a test. ` +
      (g.authority ? `The invariant is stated in \`${g.authority}\`. ` : '') +
      `If the fix makes the class mechanically checkable, add that check and demote the rule ` +
      `— \`node tools/audit/audit.mjs demote\` tracks which rules have earned it.`
  );
  lines.push('');

  lines.push('## Remediation');
  lines.push('');
  lines.push(`- [ ] Confirm each citation above still holds; drop any whose evidence does not.`);
  lines.push(`- [ ] Fix every remaining site under \`${g.group}\` — this is one class, one PR.`);
  lines.push(
    `- [ ] Add the check that would have caught it, or record why it stays a judgment call.`
  );
  lines.push(`- [ ] \`pnpm check\` and \`pnpm test:related\` on the changed files are green.`);
  lines.push('');

  lines.push('## Out of scope');
  lines.push('');
  lines.push(
    `Sites outside \`${g.group}\`, and any other rule's findings — they are their own ` +
      `issues. Widening this PR past the citations above makes it unreviewable.`
  );
  lines.push('');
  return lines.join('\n');
}

const safeJson = (s) => {
  try {
    return JSON.parse(s ?? '[]');
  } catch {
    return [];
  }
};

function titleFor(g) {
  const t = g.rule_title ?? g.rule_id;
  return `${t.charAt(0).toUpperCase()}${t.slice(1)} — ${g.group}`;
}

export function idFor(g) {
  return slug(`${g.rule_id}-${g.group}`);
}

/** Write or refresh one issue file. Never flips `ready`, never rewrites a body a person has
 *  edited by hand — an audit-origin issue is refreshed, a human-origin one is left alone. */
export function upsertIssue(root, g, rulesById) {
  const id = idFor(g);
  const path = join(ISSUES_DIR(root), `${id}.md`);
  const rule = rulesById.get(g.rule_id) ?? {};
  const kind = rule.kind ?? FAMILY_KIND[g.family] ?? 'correctness';
  const severity = rule.severity ?? FAMILY_SEVERITY[g.family] ?? 'medium';
  const files = [...new Set(g.findings.map((f) => f.file))];
  const symbols = [...new Set(g.findings.map((f) => f.symbol_key))];

  if (existsSync(path)) {
    const existing = readIssue(path);
    if (existing.data.origin === 'human') return { path, action: 'skipped-human' };
    if (existing.data.status === 'closed') return { path, action: 'skipped-closed' };
    const before = existing.body;
    const body = renderBody(g);
    const changed = before.trim() !== body.trim();
    patchIssue(path, {
      title: titleFor(g),
      kind,
      severity,
      files,
      symbols,
      rules: [g.rule_id],
      updated: today()
    });
    if (changed) {
      const cur = readIssue(path);
      writeIssue(root, { data: cur.data, body });
    }
    return { path, action: changed ? 'updated' : 'unchanged', id };
  }

  writeIssue(root, {
    data: {
      id,
      title: titleFor(g),
      status: 'open',
      kind,
      severity,
      ready: false,
      origin: 'audit',
      rules: [g.rule_id],
      files,
      symbols,
      created: today(),
      updated: today()
    },
    body: renderBody(g)
  });
  return { path, action: 'created', id };
}
