import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';

/** @type {Record<string, string>} */
const HOSTS = {
  ubuntuserver: 'ubuntuserver',
  'cachyos-x8664': 'laptop',
  'cachyos-x8664-desktop': 'desktop'
};

const SHA256 = /^[0-9a-f]{64}$/;

/** @param {NodeJS.ProcessEnv} [env] */
export function spoolDir(env = process.env) {
  if (env.F4X_LEDGER_SPOOL) return env.F4X_LEDGER_SPOOL;
  const data = env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(data, 'fantasia4x', 'ledger-spool');
}

/** @param {NodeJS.ProcessEnv} [env] @param {string} [host] */
export function machineName(env = process.env, host = hostname()) {
  if (env.F4X_MACHINE) return env.F4X_MACHINE;
  if (HOSTS[host]) return HOSTS[host];
  if (env.GITHUB_ACTIONS === 'true') return 'github';
  return host;
}

/** @param {NodeJS.ProcessEnv} [env] */
export function launchedBy(env = process.env) {
  const ci = env.GITHUB_ACTIONS === 'true';
  const session = env.CLAUDE_CODE_SESSION_ID || null;
  const thread = env.T3CODE_THREAD_ID || null;
  const num = (/** @type {string | undefined} */ v) => (v && /^\d+$/.test(v) ? Number(v) : null);
  return {
    who: ci ? 'ci' : session || thread ? 'agent' : 'owner',
    session,
    thread,
    ciRunId: ci ? num(env.GITHUB_RUN_ID) : null,
    ciJob: ci ? env.GITHUB_JOB || null : null,
    ciAttempt: ci ? num(env.GITHUB_RUN_ATTEMPT) : null
  };
}

/** @param {Date} date */
function stamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** @param {string} [machine] @param {Date | string} [date] */
export function newId(machine = machineName(), date = new Date()) {
  return `${stamp(new Date(date))}-${machine}-${randomBytes(3).toString('hex')}`;
}

/** @param {string} dir @param {string[]} args */
function git(dir, args) {
  try {
    return execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
}

export function gitInfo(dir = process.cwd()) {
  const commit = git(dir, ['rev-parse', 'HEAD']);
  if (!commit) return { branch: null, commit: null, dirty: null, refs: null };
  const refs = git(dir, [
    'for-each-ref',
    '--points-at',
    'HEAD',
    '--format=%(refname:short)',
    'refs/remotes'
  ])
    .split('\n')
    .filter(Boolean)
    .join(',');
  return {
    branch: git(dir, ['symbolic-ref', '--short', '-q', 'HEAD']) || null,
    commit,
    dirty: git(dir, ['status', '--porcelain', '--untracked-files=no']).split('\n').filter(Boolean)
      .length,
    refs
  };
}

/** @param {string | Buffer} data */
export function sha256Of(data) {
  return createHash('sha256').update(data).digest('hex');
}

/** @param {string} root @param {string} sha */
export function blobPath(root, sha) {
  if (!SHA256.test(sha)) throw new Error(`not a sha256: ${sha}`);
  return join(root, 'blobs', sha.slice(0, 2), sha);
}

/** @param {string} path */
function tempName(path) {
  return `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
}

/** @param {string} root @param {Buffer | string} bufferOrPath */
export function writeBlobAt(root, bufferOrPath) {
  const data = typeof bufferOrPath === 'string' ? readFileSync(bufferOrPath) : bufferOrPath;
  const sha = sha256Of(data);
  const path = blobPath(root, sha);
  if (existsSync(path)) return sha;
  mkdirSync(dirname(path), { recursive: true });
  const tmp = tempName(path);
  if (typeof bufferOrPath === 'string') copyFileSync(bufferOrPath, tmp);
  else writeFileSync(tmp, data);
  if (sha256Of(readFileSync(tmp)) !== sha) {
    rmSync(tmp, { force: true });
    throw new Error(`blob changed while copied: ${bufferOrPath}`);
  }
  renameSync(tmp, path);
  return sha;
}

/** @param {string} path @param {string} text */
export function writeOnce(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = tempName(path);
  writeFileSync(tmp, text);
  try {
    linkSync(tmp, path);
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EEXIST') throw new Error(`refusing to overwrite ${path}`);
    throw err;
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** @param {string} role @param {string} name @param {string} sha @param {string} root */
export function fileRef(role, name, sha, root) {
  return { role, name, sha256: sha, bytes: statSync(blobPath(root, sha)).size };
}

/** @param {Buffer | string} bufferOrPath @param {string} [dir] */
export function writeBlob(bufferOrPath, dir = spoolDir()) {
  return writeBlobAt(dir, bufferOrPath);
}

/** @param {Record<string, unknown> & { id?: string, machine?: string, at?: string, recordedAt?: string }} entry @param {string} [dir] */
export function writeEntry(entry, dir = spoolDir()) {
  const filled = {
    v: 1,
    ...entry,
    id: entry.id || newId(entry.machine || machineName(), entry.at || new Date()),
    recordedAt: entry.recordedAt || new Date().toISOString()
  };
  writeOnce(join(dir, 'entries', `${filled.id}.json`), JSON.stringify(filled, null, 2) + '\n');
  return filled.id;
}
