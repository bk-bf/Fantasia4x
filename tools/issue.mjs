#!/usr/bin/env node
// The sanctioned way to write a GitHub issue in this repo. `gh issue create|edit` and
// `gh label create` are denied, because a body written by hand drifts: relative links that
// mean nothing in an issue, an issue URL inside backticks that never becomes a link, and a
// label invented one letter away from the one that already exists.
//
//   node tools/issue.mjs create --title T --body-file - [--label L]...
//   node tools/issue.mjs edit <n> [--title T] [--body-file -] [--add-label L] [--remove-label L]
//   node tools/issue.mjs comment <n> --body-file -
//   node tools/issue.mjs close <n> --commit <sha>
//   node tools/issue.mjs labels            # what the schema allows
//   node tools/issue.mjs sync-labels       # create what is missing, name the strays
//   node tools/issue.mjs lint --body-file - [--label L]...

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { check, allowedLabels, checkRequired, checkTemplate } from './audit/lib/schema.mjs';
import { linkify, issueRef, indexedSha, blobUrl, resolveRepoPath } from './audit/lib/links.mjs';
import { moveLane } from './audit/lib/board.mjs';

process.stdout.on('error', (e) => {
  if (e.code === 'EPIPE') process.exit(0);
  throw e;
});

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? d : argv[i + 1];
};
const all = (n) => argv.reduce((a, v, i) => (v === `--${n}` ? [...a, argv[i + 1]] : a), []);
const die = (m) => {
  process.stderr.write(`${m}\n`);
  process.exit(1);
};

const gh = (args, input) =>
  execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'inherit'] });

const readBody = () => {
  const f = arg('body-file');
  if (f === '-') return readFileSync(0, 'utf8');
  if (f) return readFileSync(f, 'utf8');
  return arg('body', '');
};

const EXT = /\.(ts|tsx|js|mjs|cjs|svelte|json|md|sh|py|rs|css|html)$/;

/** Every way a citation reaches an issue body, and whether it points at something real. */
function scanBody(body, sha) {
  const found = [];
  const text = body ?? '';

  for (const m of text.matchAll(/\[([^\]]*)\]\((?!https?:|#)([^)]+)\)/g)) {
    const [, label, target] = m;
    const [path, anchor] = target.split('#');
    const real = resolveRepoPath(path, sha);
    found.push({ kind: 'relative-link', whole: m[0], label, path, anchor, real });
  }

  // a code span inside a link label is already linked; only a bare one is a missing link
  const linkSpans = [];
  for (const m of text.matchAll(/\[[^\]]*\]\([^)]*\)/g)) linkSpans.push([m.index, m.index + m[0].length]);
  const linked = (i) => linkSpans.some(([a, b]) => i >= a && i < b);

  for (const m of text.matchAll(/`([A-Za-z0-9._/-]+\.[A-Za-z]{1,8})(?::(\d+))?`/g)) {
    if (!EXT.test(m[1]) || linked(m.index)) continue;
    found.push({ kind: 'code-span-path', whole: m[0], path: m[1], line: m[2], real: resolveRepoPath(m[1], sha) });
  }

  for (const m of text.matchAll(
    /https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/([0-9a-f]{7,40})\/([^)#\s]+)(?:#L(\d+))?/g
  )) {
    found.push({ kind: 'blob', whole: m[0], sha: m[1], path: m[2], line: m[3], real: resolveRepoPath(m[2], m[1]) });
  }
  return found;
}

/** `[[`x`](a)](b)` — a label that is itself a link. Keep the inner one; it is the specific
 *  citation, and the outer was added by converting a code span that was already inside a link. */
function unnest(text) {
  let out = text ?? '';
  for (let i = 0; i < 5; i++) {
    const next = out.replace(/\[(\[[^\]]*\]\([^)]*\))\]\([^)]*\)/g, '$1');
    if (next === out) break;
    out = next;
  }
  return out;
}

function repair(body, sha) {
  let out = unnest(issueRef(body ?? ''));
  for (const f of scanBody(out, sha)) {
    if (!f.real) continue;
    if (f.kind === 'relative-link') {
      const line = (f.anchor ?? '').match(/^L(\d+)$/)?.[1];
      out = out.split(f.whole).join(`[${f.label}](${blobUrl(f.real, line, sha)})`);
    } else if (f.kind === 'code-span-path') {
      out = out.split(f.whole).join(`[\`${f.path}${f.line ? ':' + f.line : ''}\`](${blobUrl(f.real, f.line, sha)})`);
    }
  }
  return unnest(linkify(out, sha));
}

/** Repair what can be repaired, then refuse what cannot. Same treatment as fix-links, so a
 *  body written by hand and a body rewritten in bulk end up in the same shape. */
const prepare = (raw) => repair(raw ?? '', indexedSha(null));

const guard = (labels, body, { allowReady = false, template = false } = {}) => {
  const errors = check({ labels, body, allowReady, template });
  if (errors.length) die(`refused:\n  - ${errors.join('\n  - ')}`);
};

const allIssues = () =>
  JSON.parse(gh(['issue', 'list', '--state', 'all', '--limit', '300', '--json', 'number,title,body']));



if (cmd === 'check-labels') {
  let bad = 0;
  for (const it of JSON.parse(
    gh(['issue', 'list', '--state', 'open', '--limit', '300', '--json', 'number,title,labels,body'])
  )) {
    const names = it.labels.map((l) => l.name);
    const problems = [...checkRequired(names), ...checkTemplate(it.body, names)];
    if (!problems.length) continue;
    bad += 1;
    process.stdout.write(`#${it.number}  ${it.title.slice(0, 52)}\n`);
    for (const e of problems) process.stdout.write(`      ${e}\n`);
  }
  process.stdout.write(`\n${bad} open issue(s) incompletely classified\n`);
  if (bad) process.exit(1);
} else if (cmd === 'lane') {
  const n = argv[1] ?? die('which issue?');
  const to = argv.slice(2).join(' ') || '';
  try {
    const r = moveLane(n, to);
    process.stdout.write(`#${n}  ${r.from} -> ${r.to}${r.moved ? '' : ' (already there)'}\n`);
  } catch (e) {
    die(e.message);
  }
} else if (cmd === 'check-links' || cmd === 'fix-links') {
  const sha = indexedSha(null);
  const fix = cmd === 'fix-links';
  let bad = 0;
  let fixed = 0;
  let dead = 0;
  for (const it of allIssues()) {
    // a resolving blob link is the goal, not a problem; everything else is work left to do
    const problems = scanBody(it.body, sha).filter((f) => f.kind !== 'blob' || !f.real);
    const unresolvable = problems.filter((f) => !f.real);
    const next = repair(it.body, sha);
    const drifted = next !== (it.body ?? '');

    if (problems.length) {
      bad += 1;
      process.stdout.write(
        `#${it.number}  ${problems.length} reference(s), ${unresolvable.length} unresolvable\n`
      );
      for (const u of unresolvable.slice(0, 4)) {
        dead += 1;
        process.stdout.write(`      dead: ${u.kind} ${u.path}\n`);
      }
    } else if (drifted) {
      // valid markdown can still be wrong: a nested link parses fine and reads as noise
      process.stdout.write(`#${it.number}  body is not in canonical form\n`);
    }

    if (fix && drifted) {
      gh(['issue', 'edit', String(it.number), '--body-file', '-'], next);
      fixed += 1;
    }
    if (!fix && drifted) bad = Math.max(bad, 1);
  }
  process.stdout.write(`\n${bad} issue(s) with unlinked or broken references` +
    (fix ? `, ${fixed} rewritten` : '') + `, ${dead} citation(s) point at nothing\n`);
  if (!fix && bad) process.exit(1);
} else if (cmd === 'labels') {
  for (const l of [...allowedLabels()].sort()) process.stdout.write(`${l}\n`);
} else if (cmd === 'lint') {
  const body = prepare(readBody());
  const errors = check({ labels: all('label'), body, template: !argv.includes('--no-template') });
  if (errors.length) die(`refused:\n  - ${errors.join('\n  - ')}`);
  process.stdout.write('ok\n');
} else if (cmd === 'sync-labels') {
  const allowed = allowedLabels();
  const have = new Set(JSON.parse(gh(['label', 'list', '--limit', '300', '--json', 'name'])).map((l) => l.name));
  const DEFAULT = new Set(['bug', 'documentation', 'duplicate', 'enhancement', 'good first issue',
                           'help wanted', 'invalid', 'question', 'wontfix']);
  for (const l of allowed) {
    if (have.has(l)) continue;
    gh(['label', 'create', l, '--color', 'ededed', '--force']);
    process.stdout.write(`created  ${l}\n`);
  }
  for (const l of have) {
    if (allowed.has(l) || DEFAULT.has(l)) continue;
    process.stdout.write(`stray    ${l}  (not in the schema — delete it or add it to labels.json)\n`);
  }
} else if (cmd === 'create') {
  const title = arg('title') ?? die('--title is required');
  const labels = all('label');
  const body = prepare(readBody());
  guard(labels, body, { template: true });
  const args = ['issue', 'create', '--title', title, '--body-file', '-'];
  for (const l of labels) args.push('--label', l);
  process.stdout.write(gh(args, body));
} else if (cmd === 'edit') {
  const n = argv[1] ?? die('which issue?');
  const add = all('add-label');
  const body = arg('body-file') ? prepare(readBody()) : null;
  guard(add, body ?? '', { allowReady: true, template: body !== null });
  const args = ['issue', 'edit', n];
  if (arg('title')) args.push('--title', arg('title'));
  if (body !== null) args.push('--body-file', '-');
  for (const l of add) args.push('--add-label', l);
  for (const l of all('remove-label')) args.push('--remove-label', l);
  process.stdout.write(gh(args, body ?? undefined));
} else if (cmd === 'comment') {
  const n = argv[1] ?? die('which issue?');
  const body = prepare(readBody());
  guard([], body, { allowReady: true });
  process.stdout.write(gh(['issue', 'comment', n, '--body-file', '-'], body));
} else if (cmd === 'close') {
  const n = argv[1] ?? die('which issue?');
  const sha = arg('commit');
  if (!sha) die('--commit <sha> is required: a closed issue names what closed it');
  process.stdout.write(
    gh(['issue', 'close', n, '--reason', 'completed', '--comment', `Fixed in ${sha}.`])
  );
} else {
  die(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 15).join('\n').replace(/^\/\/ ?/gm, ''));
}
