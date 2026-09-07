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
import { check, allowedLabels } from './audit/lib/schema.mjs';
import { linkify, issueRef, indexedSha } from './audit/lib/links.mjs';

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

/** Repair what can be repaired, then refuse what cannot. */
const prepare = (raw) => {
  const sha = indexedSha(null);
  const body = linkify(issueRef(raw ?? ''), sha);
  return body;
};

const guard = (labels, body, { allowReady = false } = {}) => {
  const errors = check({ labels, body, allowReady });
  if (errors.length) die(`refused:\n  - ${errors.join('\n  - ')}`);
};

if (cmd === 'labels') {
  for (const l of [...allowedLabels()].sort()) process.stdout.write(`${l}\n`);
} else if (cmd === 'lint') {
  const body = prepare(readBody());
  const errors = check({ labels: all('label'), body });
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
  guard(labels, body);
  const args = ['issue', 'create', '--title', title, '--body-file', '-'];
  for (const l of labels) args.push('--label', l);
  process.stdout.write(gh(args, body));
} else if (cmd === 'edit') {
  const n = argv[1] ?? die('which issue?');
  const add = all('add-label');
  const body = arg('body-file') ? prepare(readBody()) : null;
  guard(add, body ?? '', { allowReady: true });
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
