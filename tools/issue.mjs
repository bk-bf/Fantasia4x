#!/usr/bin/env node
// The sanctioned way to write a GitHub issue in this repo. `gh issue create|edit` and
// `gh label create` are denied, because a body written by hand drifts: relative links that
// mean nothing in an issue, an issue URL inside backticks that never becomes a link, and a
// label invented one letter away from the one that already exists.
//
//   node tools/issue.mjs create --title T --type fix --area sim --size S --body-file - [--label L]... [--parent N]
//   node tools/issue.mjs edit <n> [--title T] [--body-file -] [--add-label L] [--remove-label L] [--type T] [--area A] [--size S] [--parent N]
//   node tools/issue.mjs blocked-by <n> <blocker>    # mark <n> as blocked by <blocker>
//   node tools/issue.mjs comment <n> --body-file -
//   node tools/issue.mjs close <n> --commit <sha>
//   node tools/issue.mjs labels            # what the schema allows
//   node tools/issue.mjs sync-labels [--prune]  # create what is missing, name or delete the strays
//   node tools/issue.mjs lint --body-file - [--label L]...
//   node tools/issue.mjs pr --head <branch> --title T --body-file -
//   node tools/issue.mjs pr-edit <n> --body-file -

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  check,
  allowedLabels,
  checkRequired,
  checkTemplate,
  checkLabels,
  checkBody,
  checkKind,
  labelGroup
} from './audit/lib/schema.mjs';
import { checkPrivate } from './audit/lib/private.mjs';
import { linkify, issueRef, indexedSha, blobUrl, resolveRepoPath } from './audit/lib/links.mjs';
import {
  moveLane,
  setSelect,
  addToBoard,
  itemFor,
  boardItems,
  fields,
  invalidate
} from './audit/lib/board.mjs';
import { createPull, editPull } from './audit/lib/pulls.mjs';

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

const TYPES = ['feat', 'fix', 'refactor', 'perf', 'test', 'tooling', 'docs', 'chore', 'decision'];
const SEVERITY_PRIORITY = { critical: 'P0', high: 'P1', medium: 'P2', low: 'P3' };

const boardOption = (field, value, flag) => {
  const options = fields().find((f) => f.name === field)?.options.map((o) => o.name) ?? [];
  if (!value) die(`--${flag} is required — one of: ${options.join(', ')}`);
  const hit = options.find((o) => o.toLowerCase() === String(value).toLowerCase());
  if (!hit) die(`unknown --${flag} "${value}" — one of: ${options.join(', ')}`);
  return hit;
};

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function waitForCard(n) {
  for (let i = 0; i < 6 && !itemFor(n); i++) {
    pause(5000);
    invalidate();
  }
}

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
  return (body ?? '')
    .split(/(<!--[\s\S]*?-->)/)
    .map((part, i) => (i % 2 ? part : repairProse(part, sha)))
    .join('');
}

function repairProse(text, sha) {
  let out = unnest(issueRef(text));
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

const guard = (labels, body, { allowReady = false, template = false, workType } = {}) => {
  const errors = check({ labels, body, allowReady, template, workType });
  if (errors.length) die(`refused:\n  - ${errors.join('\n  - ')}`);
};

const allIssues = () =>
  JSON.parse(gh(['issue', 'list', '--state', 'all', '--limit', '300', '--json', 'number,title,body']));

const REPO_API = '/repos/bk-bf/Fantasia4x';

const issueRecord = (n) => {
  let it;
  try {
    it = JSON.parse(gh(['api', `${REPO_API}/issues/${n}`]));
  } catch {
    die(`no issue #${n}`);
  }
  if (it.pull_request) die(`#${n} is a pull request, not an issue`);
  return it;
};

const issueId = (n) => issueRecord(n).id;

const linkParent = (n, parent) =>
  gh(['api', '-X', 'POST', `${REPO_API}/issues/${parent}/sub_issues`, '-F', `sub_issue_id=${issueId(n)}`]);

const MERGED_LANES = new Set(['on dev', 'done']);

const boardGaps = (card) => {
  const gaps = [];
  if (!card.status) gaps.push('no Status — the card is on the board in no lane');
  if (!card['work type']) gaps.push('no Work type on the board');
  if (!card.verify) gaps.push('no Verify route on the board');
  if (!card.area) gaps.push('no Area on the board');
  if (!card.size) gaps.push('no Size on the board');
  const sev = (card.labels ?? []).find((l) => SEVERITY_PRIORITY[l]);
  if (sev && card.priority !== SEVERITY_PRIORITY[sev]) {
    gaps.push(
      `Priority is ${card.priority ?? 'unset'} but the severity is ${sev}, which is ` +
        `${SEVERITY_PRIORITY[sev]} — Priority is derived, not set by hand`
    );
  }
  return gaps;
};



if (cmd === 'check-labels') {
  let bad = 0;
  const cards = new Map(
    boardItems()
      .filter((i) => i.content?.number)
      .map((i) => [String(i.content.number), i])
  );
  for (const it of JSON.parse(
    gh(['issue', 'list', '--state', 'open', '--limit', '300', '--json', 'number,title,labels,body'])
  )) {
    const names = it.labels.map((l) => l.name);
    const workType = cards.get(String(it.number))?.['work type'];
    const problems = [
      ...checkRequired(names),
      ...checkTemplate(it.body, names, workType),
      ...checkKind(names, workType)
    ];
    if (!problems.length) continue;
    bad += 1;
    process.stdout.write(`#${it.number}  ${it.title.slice(0, 52)}\n`);
    for (const e of problems) process.stdout.write(`      ${e}\n`);
  }
  let untyped = 0;
  const report = (n, title, gaps, lane) => {
    if (!gaps.length) return;
    untyped += 1;
    process.stdout.write(`#${n}  ${title.slice(0, 52)}${lane ? `  (${lane})` : ''}\n`);
    for (const g of gaps) process.stdout.write(`      ${g}\n`);
  };
  const open = new Set();
  for (const it of JSON.parse(
    gh(['issue', 'list', '--state', 'open', '--limit', '300', '--json', 'number,title'])
  )) {
    const key = String(it.number);
    open.add(key);
    report(it.number, it.title, cards.has(key) ? boardGaps(cards.get(key)) : ['not on the board']);
  }
  for (const [key, card] of cards) {
    if (open.has(key) || !MERGED_LANES.has((card.status ?? '').toLowerCase())) continue;
    report(key, card.title ?? '', boardGaps(card), card.status);
  }
  process.stdout.write(
    `\n${bad} open issue(s) incompletely classified, ${untyped} with a gap on the board\n`
  );
  if (bad || untyped) process.exit(1);
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
  const errors = check({
    labels: all('label'),
    body,
    template: !argv.includes('--no-template'),
    workType: arg('type') ?? 'fix'
  });
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
  const prune = argv.includes('--prune');
  for (const l of have) {
    if (allowed.has(l) || DEFAULT.has(l)) continue;
    const used = JSON.parse(
      gh(['issue', 'list', '--state', 'all', '--limit', '300', '--label', l, '--json', 'number'])
    ).length;
    if (prune && used === 0) {
      gh(['label', 'delete', l, '--yes']);
      process.stdout.write(`deleted  ${l}\n`);
      continue;
    }
    process.stdout.write(
      `stray    ${l}  (not in the schema, on ${used} issue(s)` +
        `${used === 0 ? ' — --prune deletes it' : ' — retag those first'})\n`
    );
  }
} else if (cmd === 'create') {
  const title = arg('title') ?? die('--title is required');
  const privateTitle = checkPrivate(title);
  if (privateTitle.length) die(`refused:\n  - title ${privateTitle.join('\n  - title ')}`);
  const labels = all('label');
  const type = arg('type');
  if (!type) die(`--type is required — one of: ${TYPES.join(', ')}`);
  if (!TYPES.includes(type)) die(`unknown --type "${type}" — one of: ${TYPES.join(', ')}`);
  const area = boardOption('Area', arg('area'), 'area');
  const size = boardOption('Size', arg('size'), 'size');
  if (type === 'feat' && !labels.some((l) => labelGroup('kind').includes(l))) labels.push('feature');
  const body = prepare(readBody());
  guard(labels, body, { template: true, workType: type });
  const parent = arg('parent');
  if (parent) issueId(parent);
  const args = ['issue', 'create', '--title', title, '--body-file', '-'];
  for (const l of labels) args.push('--label', l);
  const url = gh(args, body).trim();
  process.stdout.write(url + '\n');
  const n = url.split('/').pop();
  // Adding the item is not enough: an item with no Status has no lane, and board-sync only
  // backfills Backlog for issues it adds itself. It also derives the verify label from the
  // Verify field, so leaving that empty strips the label this issue was just created with.
  const VERIFY_FIELD = {
    'verify tests': 'tests',
    'verify headless': 'headless',
    'needs playtest': 'playtest'
  };
  const verify = labels.map((l) => VERIFY_FIELD[l]).find(Boolean);
  try {
    addToBoard(n);
    waitForCard(n);
    setSelect(n, 'Status', 'Backlog');
    setSelect(n, 'Work type', type);
    setSelect(n, 'Area', area);
    setSelect(n, 'Size', size);
    const priority = labels.map((l) => SEVERITY_PRIORITY[l]).find(Boolean);
    if (priority) setSelect(n, 'Priority', priority);
    if (verify) setSelect(n, 'Verify', verify);
  } catch (e) {
    process.stderr.write(`note: created #${n} but could not set its fields: ${e.message}\n`);
  }
  if (parent) {
    try {
      linkParent(n, parent);
      process.stdout.write(`#${n} is a sub-issue of #${parent}\n`);
    } catch (e) {
      process.stderr.write(`note: created #${n} but could not make it a sub-issue of #${parent}: ${e.message}\n`);
    }
  }
} else if (cmd === 'edit') {
  const n = argv[1] ?? die('which issue?');
  const parent = arg('parent');
  if (parent) issueId(parent);
  const area = arg('area') && boardOption('Area', arg('area'), 'area');
  const size = arg('size') && boardOption('Size', arg('size'), 'size');
  const add = all('add-label');
  const body = arg('body-file') ? prepare(readBody()) : null;
  const type = arg('type');
  if (type && !TYPES.includes(type)) die(`unknown --type "${type}" — one of: ${TYPES.join(', ')}`);
  // Refuse what this edit introduces, not what it inherits. A body that already cites a file
  // somebody deleted cannot be ticked, relabelled or corrected while the old citation is held
  // against it, which locks the issue instead of protecting it.
  const current = JSON.parse(gh(['issue', 'view', n, '--json', 'body,labels']));
  const removed = new Set(all('remove-label'));
  const resulting = [...new Set([...current.labels.map((l) => l.name), ...add])].filter(
    (l) => !removed.has(l)
  );
  const workType = type ?? itemFor(n)?.['work type'];
  const inherited =
    body === null ? [] : check({ labels: [], body: current.body ?? '', allowReady: true });
  const introduced = [
    ...checkLabels(add, { allowReady: true }),
    ...(arg('title') ? checkPrivate(arg('title')).map((e) => `title ${e}`) : []),
    ...checkBody(body ?? ''),
    ...(body !== null
      ? [...checkTemplate(body, resulting, workType), ...checkRequired(resulting)]
      : []),
    ...(add.length || removed.size || type ? checkKind(resulting, workType) : [])
  ].filter((e) => !inherited.includes(e));
  if (introduced.length) die(`refused:\n  - ${introduced.join('\n  - ')}`);
  const changes = [];
  if (arg('title')) changes.push('--title', arg('title'));
  if (body !== null) changes.push('--body-file', '-');
  for (const l of add) changes.push('--add-label', l);
  for (const l of all('remove-label')) changes.push('--remove-label', l);
  if (!changes.length && !parent && !type && !area && !size) die('nothing to edit');
  if (changes.length) process.stdout.write(gh(['issue', 'edit', n, ...changes], body ?? undefined));
  if (parent) {
    linkParent(n, parent);
    process.stdout.write(`#${n} is a sub-issue of #${parent}\n`);
  }
  for (const [field, value] of [['Work type', type], ['Area', area], ['Size', size]]) {
    if (!value) continue;
    try {
      setSelect(n, field, value);
    } catch (e) {
      die(e.message);
    }
    process.stdout.write(`#${n} ${field} is ${value}\n`);
  }
} else if (cmd === 'blocked-by') {
  const [n, blocker] = argv.slice(1, 3);
  if (!n || !blocker) die('usage: blocked-by <issue> <blocker>');
  const q =
    'mutation($i:ID!,$b:ID!){ addBlockedBy(input:{issueId:$i,blockingIssueId:$b}){ clientMutationId } }';
  try {
    gh(['api', 'graphql', '-f', `query=${q}`, '-f', `i=${issueRecord(n).node_id}`, '-f', `b=${issueRecord(blocker).node_id}`]);
  } catch (e) {
    die(e.message);
  }
  process.stdout.write(`#${n} is blocked by #${blocker}\n`);
} else if (cmd === 'pr') {
  const head = arg('head') ?? die('which branch? --head <branch>');
  const title = arg('title') ?? die('--title is required');
  try {
    const pull = createPull({ branch: head, title, body: readBody() });
    process.stdout.write(`${pull?.url ?? ''}\n`);
  } catch (e) {
    die(e.message);
  }
} else if (cmd === 'pr-edit') {
  const n = argv[1] ?? die('which pull request?');
  try {
    editPull(n, readBody());
  } catch (e) {
    die(e.message);
  }
  process.stdout.write(`#${n} description rewritten\n`);
} else if (cmd === 'comment') {
  const n = argv[1] ?? die('which issue?');
  const body = prepare(readBody());
  const privateWords = checkPrivate(body);
  if (privateWords.length) die(`refused:\n  - ${privateWords.join('\n  - ')}`);
  // A comment is a record of what a run did, not a specification. Refusing to post one because
  // the text it is reporting names something that no longer exists loses the whole record, so
  // the same problems are reported and the comment still goes up.
  const problems = check({ labels: [], body, allowReady: true });
  for (const e of problems) process.stderr.write(`note: ${e}\n`);
  process.stdout.write(gh(['issue', 'comment', n, '--body-file', '-'], body));
} else if (cmd === 'prune-comments') {
  // The reviewer used to repeat the fixer's write-up on every clean pass. A comment that only
  // says a branch merged says nothing the close does not; one carrying a headless measurement
  // or a reach past the cited files is the only record of it and is left alone.
  const apply = argv.includes('--apply');
  const KEEP = /## What the review measured|## It reached past/;
  let hit = 0;
  for (const it of JSON.parse(
    gh(['issue', 'list', '--state', 'all', '--limit', '300', '--json', 'number'])
  )) {
    const cs = JSON.parse(gh(['issue', 'view', String(it.number), '--json', 'comments'])).comments;
    for (const c of cs) {
      if (!/^\*\*Reviewed on the \w+ route and merged to/.test(c.body)) continue;
      if (KEEP.test(c.body)) continue;
      const id = (c.url.match(/issuecomment-(\d+)/) ?? [])[1];
      if (!id) continue;
      hit += 1;
      process.stdout.write(`#${it.number}  ${id}  ${c.body.split('\n')[0].slice(0, 62)}\n`);
      if (apply) gh(['api', '-X', 'DELETE', `/repos/bk-bf/Fantasia4x/issues/comments/${id}`]);
    }
  }
  process.stdout.write(`\n${hit} duplicate review comment(s)${apply ? ' deleted' : ''}\n`);
} else if (cmd === 'close') {
  const n = argv[1] ?? die('which issue?');
  const sha = arg('commit');
  if (!sha) die('--commit <sha> is required: a closed issue names what closed it');
  process.stdout.write(
    gh(['issue', 'close', n, '--reason', 'completed', '--comment', `Fixed in ${sha}.`])
  );
} else {
  const head = readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1);
  die(head.slice(0, head.findIndex((l) => !l.startsWith('//'))).join('\n').replace(/^\/\/ ?/gm, ''));
}
