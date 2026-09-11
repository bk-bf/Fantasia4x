// Phase 2: confirmed findings -> issue files.
//
// One finding is not one issue. A rule firing forty times is one class of defect, and the
// board's unit of work is the class -- that is what a fixer can close in a single PR. So
// findings group by (rule, module group), and the issue carries every citation.

import { readIssue, writeIssue, patchIssue, today, listIssues } from './gh.mjs';
import { planGeneration } from './generations.mjs';
import { subareaFor } from './subarea.mjs';
import { blobUrl, linkify, authorityLink, issueRef, stripLinks } from './links.mjs';
import { open, findingsForIssue } from './ledger.mjs';

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

const FAMILY_VERIFY = {
  contract: 'tests',
  boundary: 'tests',
  'silent-failure': 'tests',
  units: 'tests',
  'hot-path': 'headless',
  tests: 'tests',
  reachability: 'tests',
  data: 'playtest',
  'single-source': 'tests'
};

const FAMILY_TYPE = {
  contract: 'refactor',
  boundary: 'fix',
  'silent-failure': 'fix',
  units: 'fix',
  'hot-path': 'perf',
  tests: 'test',
  reachability: 'refactor',
  data: 'fix',
  'single-source': 'refactor'
};

const BODY_LIMIT = 60000;

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
    SELECT f.id, f.symbol_key, f.rule_id, f.summary, f.evidence, f.state, f.issue_number,
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

function renderBody(g, sha, follows, budget) {
  const n = g.findings.length;
  const authority = authorityLink(g.authority);
  const head = [
    `# ${titleFor(g)}`,
    '',
    `> **Related:** [\`tools/audit\`](${blobUrl('tools/audit/README.md', null, sha)})` +
      (authority ? ` · rule source ${authority}` : '') +
      (follows.length ? ` · follows ${follows.map((i) => `#${i}`).join(', ')}` : ''),
    '',
    '## What breaks',
    '',
    `Rule \`${g.rule_id}\` — ${g.rule_title} — holds in ${n} ` +
      `place${n === 1 ? '' : 's'} under \`${g.group}\`. Each one is listed below with the ` +
      `audit's one-sentence account of it.`,
    '',
    '## Evidence',
    ''
  ];
  const tail = [
    '',
    '## Why nothing caught it',
    '',
    `Nothing below the judgment tier can decide this one: it is why \`${g.rule_id}\` ` +
      `exists at T2 rather than as a lint rule or a test. ` +
      (authority ? `The invariant is stated in ${authority}. ` : '') +
      `If the fix makes the class mechanically checkable, add that check and demote the rule ` +
      `— \`node tools/audit/audit.mjs demote\` tracks which rules have earned it.`,
    '',
    '## Remediation',
    '',
    `- [ ] Confirm each citation above still holds; drop any whose evidence does not.`,
    `- [ ] Fix every remaining site under \`${g.group}\` — this is one class, one PR.`,
    `- [ ] Add the check that would have caught it, or record why it stays a judgment call.`,
    `- [ ] \`pnpm check\` and \`pnpm test:related\` on the changed files are green.`,
    '',
    '## Out of scope',
    '',
    `Sites outside \`${g.group}\`, and any other rule's findings — they are their own ` +
      `issues. Widening this PR past the citations above makes it unreviewable.`,
    ''
  ];
  const more = (rest) => [
    '',
    `…and ${rest} more under the same rule. \`node tools/audit/audit.mjs findings\` lists them all.`
  ];

  let room = budget - [...head, ...more(n), ...tail].join('\n').length;
  const sites = [];
  for (const f of g.findings) {
    const at = blobUrl(f.file, f.start_line, sha);
    const line = `- [\`${f.file}:${f.start_line}\`](${at}) — ${linkify(issueRef(f.summary), sha)}`;
    if (line.length + 1 > room) break;
    sites.push(line);
    room -= line.length + 1;
  }
  const rest = n - sites.length;
  return [...head, ...sites, ...(rest > 0 ? more(rest) : []), ...tail].join('\n');
}

function titleFor(g) {
  const t = g.rule_title ?? g.rule_id;
  return `${t.charAt(0).toUpperCase()}${t.slice(1)} — ${g.group}`;
}

export function renderNewFindings(g, fresh) {
  const name = g.rule_title ?? g.rule_id;
  const lines = [
    `The audit has found ${fresh.length} more ${fresh.length === 1 ? 'occurrence' : 'occurrences'} of ${name} in \`${g.group}\` since this issue was triaged.`,
    '',
    'They are not in the body above, because the body is not rewritten once a card has left `Backlog`.',
    ''
  ];
  for (const f of fresh) {
    lines.push(`- \`${f.file}:${f.start_line}\` — ${(f.summary ?? '').trim()}`);
  }
  lines.push('');
  lines.push(
    'If any of these is a different failure mode rather than more of the same, it wants its own issue.'
  );
  return lines.join('\n');
}

export function ledgerEvidence(issueNumber) {
  const findings = findingsForIssue(open(), issueNumber);
  if (findings.length === 0) return '';
  const lines = [
    '',
    '---',
    '',
    '# Evidence from the audit ledger',
    '',
    `The issue lists each site with a one-sentence summary. This is the evidence the audit ` +
      `recorded for all ${findings.length} of them, including any the issue body does not list.`,
    ''
  ];
  for (const f of findings) {
    lines.push(`- \`${f.file}:${f.start_line}\` — ${(f.summary ?? '').trim()}`);
    for (const e of JSON.parse(f.evidence ?? '[]')) {
      lines.push(`  - ${String(e).replace(/\s*\n\s*/g, ' ')}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

const AREA_FOR_SUBAREA = {
  components: 'ui', webgl: 'ui', routes: 'ui', stores: 'ui', actions: 'ui', audio: 'ui',
  database: 'data',
  tools: 'tooling', dev: 'tooling', debug: 'tooling', headless: 'tooling', server: 'tooling'
};

export const areaFor = (subarea, rule = {}) => rule.area ?? AREA_FOR_SUBAREA[subarea] ?? 'sim';

export const sizeFor = (files) => (files.length <= 2 ? 'S' : files.length <= 6 ? 'M' : 'L');

export function idFor(g, rulesById) {
  const name = rulesById?.get(g.rule_id)?.name ?? g.rule_id;
  return slug(`${name}-${g.group}`);
}

/** Write or refresh one issue file. Never flips `ready`, never rewrites a body a person has
 *  edited by hand — an audit-origin issue is refreshed, a human-origin one is left alone. */
export function upsertIssue(root, g, rulesById, sha, force = false) {
  const plan = planGeneration(idFor(g, rulesById), listIssues(root), g.findings);
  const settled = [...plan.settled].map(([path, findings]) => ({ path, findings }));
  if (plan.own.length === 0) {
    const last = plan.closed.at(-1);
    return { path: last.path, action: 'skipped-closed', id: last.data.id, links: settled };
  }
  const id = plan.id;
  const own = { ...g, findings: plan.own };
  const follows = plan.closed.map((i) => i.path);
  const result = (path, action) => ({
    path,
    action,
    id,
    links: [...settled, { path, findings: plan.own }]
  });
  const rule = rulesById.get(g.rule_id) ?? {};
  const kind = rule.kind ?? FAMILY_KIND[g.family] ?? 'correctness';
  const severity = rule.severity ?? FAMILY_SEVERITY[g.family] ?? 'medium';
  const verify = rule.verify ?? FAMILY_VERIFY[g.family] ?? 'tests';
  const files = [...new Set(own.findings.map((f) => f.file))];
  const symbols = [...new Set(own.findings.map((f) => f.symbol_key))];
  const budget = BODY_LIMIT - JSON.stringify({ files, symbols }).length;
  const subarea = subareaFor(files);
  const type = rule.type ?? FAMILY_TYPE[g.family] ?? 'fix';
  const area = areaFor(subarea, rule);
  const size = sizeFor(files);

  if (plan.current) {
    const path = plan.current.path;
    const existing = readIssue(path);
    if (existing.data.origin === 'human') return result(path, 'skipped-human');
    if (existing.data.ready === true && !force) return result(path, 'skipped-approved');
    const before = existing.body;
    const body = renderBody(own, sha, follows, budget);
    const changed = force || stripLinks(before).trim() !== stripLinks(body).trim();
    patchIssue(path, {
      title: titleFor(g),
      kind,
      severity,
      verify: existing.data.verify ?? verify,
      subarea: existing.data.subarea ?? subarea,
      files,
      symbols,
      rules: [g.rule_id],
      updated: today()
    });
    if (changed) {
      const cur = readIssue(path);
      writeIssue(root, { data: cur.data, body });
    }
    return result(path, changed ? 'updated' : 'unchanged');
  }

  writeIssue(root, {
    data: {
      id,
      title: titleFor(g),
      status: 'open',
      kind,
      severity,
      verify,
      subarea,
      type,
      area,
      size,
      ready: false,
      origin: 'audit',
      rules: [g.rule_id],
      files,
      symbols,
      created: today(),
      updated: today()
    },
    body: renderBody(own, sha, follows, budget)
  });
  const created = listIssues(root).find((i) => i.data.id === id);
  return result(created ? created.path : id, 'created');
}
