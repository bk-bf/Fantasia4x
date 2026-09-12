#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import { linkOf } from '../lib/pulls.mjs';

const TTL_MS = 5 * 60 * 1000;
const MAX_LINES = 8;
const CACHE_DIR = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'fantasia4x-inflight');
const CITATION = /github\.com\/[^/]+\/[^/]+\/blob\/[0-9a-f]{7,40}\/([^)#\s?]+)/g;

const mode = process.argv[2];
const event = (() => {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
})();
const root = process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd();

const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });

const emit = (output) => {
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
};

function snapshot() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, 'snapshot.json');
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, 'utf8'));
    if (Date.now() - cached.at < TTL_MS) return cached;
  }
  const pulls = JSON.parse(
    run('gh', ['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,headRefName,body,files'])
  ).map((p) => ({
    number: p.number,
    title: p.title,
    branch: p.headRefName,
    issue: linkOf(p)?.issue ?? null,
    files: (p.files ?? []).map((f) => f.path)
  }));
  const issues = JSON.parse(
    run('gh', ['issue', 'list', '--state', 'open', '--limit', '300', '--json', 'number,title,body'])
  ).map((i) => ({
    number: i.number,
    title: i.title,
    files: [...new Set([...(i.body ?? '').matchAll(CITATION)].map((m) => decodeURIComponent(m[1])))]
  }));
  const fresh = { at: Date.now(), pulls, issues };
  writeFileSync(file, JSON.stringify(fresh));
  return fresh;
}

function ownWork(cwd) {
  let branch = '';
  try {
    branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd).trim();
  } catch {
    return { branch, issue: null };
  }
  return { branch, issue: Number(/-(\d+)$/.exec(branch)?.[1]) || null };
}

function acknowledged(session, path) {
  const file = join(CACHE_DIR, `ack-${session || 'unknown'}.json`);
  const seen = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  if (seen.includes(path)) return true;
  writeFileSync(file, JSON.stringify([...seen, path]));
  return false;
}

function onPrompt() {
  let snap;
  try {
    snap = snapshot();
  } catch (e) {
    emit({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `Open pull requests could not be read (${String(e.message).split('\n')[0]}); check \`gh pr list\` before building.`
      }
    });
  }
  if (!snap.pulls.length) process.exit(0);
  const here = ownWork(root).branch;
  const lines = snap.pulls.map(
    (p) =>
      `- #${p.number} ${p.branch}${p.issue ? ` (for #${p.issue})` : ''}: ${p.title} [${p.files.length} files]` +
      (p.branch === here ? ' (checked out here)' : '')
  );
  emit({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: [
        'Open pull requests in this repository. Before building or investigating, check whether the task overlaps one of them or an open issue:',
        ...lines
      ].join('\n')
    }
  });
}

function onEdit() {
  const target = event.tool_input?.file_path || event.tool_input?.notebook_path;
  if (!target) process.exit(0);
  const abs = resolve(event.cwd || root, target);
  const dir = existsSync(dirname(abs)) ? dirname(abs) : root;
  let top;
  try {
    top = run('git', ['rev-parse', '--show-toplevel'], dir).trim();
  } catch {
    process.exit(0);
  }
  const path = relative(top, abs);
  if (path.startsWith('..')) process.exit(0);

  let snap;
  try {
    snap = snapshot();
  } catch {
    process.exit(0);
  }
  const mine = ownWork(dir);
  const pulls = snap.pulls.filter(
    (p) => p.branch !== mine.branch && p.issue !== mine.issue && p.files.includes(path)
  );
  const covered = new Set(pulls.map((p) => p.issue));
  const issues = snap.issues.filter(
    (i) => i.number !== mine.issue && !covered.has(i.number) && i.files.includes(path)
  );
  if (!pulls.length && !issues.length) process.exit(0);
  if (acknowledged(event.session_id, path)) process.exit(0);

  const found = [
    ...pulls.map(
      (p) => `  pull request #${p.number} (${p.branch}${p.issue ? `, for #${p.issue}` : ''}) changes it: ${p.title}`
    ),
    ...issues.map((i) => `  issue #${i.number} cites it: ${i.title}`)
  ];
  const shown = found.slice(0, MAX_LINES);
  if (found.length > shown.length) shown.push(`  and ${found.length - shown.length} more`);
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: [
        `${path} is part of work already open on GitHub:`,
        ...shown,
        'Read them before editing. If this edit belongs to that work, make it on that branch.',
        'If it is separate, make the edit again; this file is not flagged again in this session.'
      ].join('\n')
    }
  });
}

if (mode === 'prompt') onPrompt();
else if (mode === 'edit') onEdit();
