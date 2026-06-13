/**
 * POST /api/activity-log
 * GET  /api/activity-log
 *
 * POST receives batched activity log entries from the client and appends
 * them to .debug/activity.log.
 *
 * GET returns the current contents of .debug/activity.log (plain text).
 *
 * Dev-only: returns 204 with no side effects in production builds.
 */

import {
  appendFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

const MAX_LOG_BYTES = 50 * 1024 * 1024; // 50 MB
const LOG_DIR = '.debug';
const LOG_FILE = join(LOG_DIR, 'activity.log');

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function formatEntry(entry: unknown): string {
  if (typeof entry !== 'object' || entry === null) return String(entry);
  const e = entry as Record<string, unknown>;
  const turn = typeof e.turn === 'number' ? `[T${String(e.turn).padStart(4, '0')}]` : '[T----]';
  const type = typeof e.type === 'string' ? `[${e.type.toUpperCase()}]` : '[UNKNOWN]';
  const actor = typeof e.actor === 'string' ? e.actor : '?';
  const action = typeof e.action === 'string' ? e.action : '';
  const target = typeof e.target === 'string' ? ` → ${e.target}` : '';
  const result = typeof e.result === 'string' && e.result.length > 0 ? ` | ${e.result}` : '';
  const severity = typeof e.severity === 'string' ? `(${e.severity})` : '';
  // Use the entry's own timestamp (set client-side) so logs align with gameLogger.
  const ts = typeof e.timestamp === 'string' ? e.timestamp : new Date().toISOString();
  return `${ts} ${turn} ${type} ${severity} ${actor}: ${action}${target}${result}`;
}

function appendToLog(entries: unknown[]): void {
  if (entries.length === 0) return;
  ensureLogDir();
  const payload = entries.map(formatEntry).join('\n') + '\n';
  let size = 0;
  try {
    size = statSync(LOG_FILE).size;
  } catch {
    size = 0;
  }
  if (size >= MAX_LOG_BYTES) {
    const banner = `=== log reset at ${new Date().toISOString()} (exceeded ${MAX_LOG_BYTES} bytes) ===\n`;
    writeFileSync(LOG_FILE, banner + payload, 'utf8');
  } else {
    appendFileSync(LOG_FILE, payload, 'utf8');
  }
}

export const POST: RequestHandler = async ({ request }) => {
  if (!import.meta.env.DEV) {
    return new Response(null, { status: 204 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray((body as Record<string, unknown>).entries)
  ) {
    return new Response('bad request', { status: 400 });
  }

  const rawEntries: unknown[] = (body as Record<string, unknown[]>).entries;
  const safeEntries = rawEntries.filter(
    (e): e is Record<string, unknown> =>
      typeof e === 'object' && e !== null && typeof (e as Record<string, unknown>).turn === 'number'
  );

  if (safeEntries.length === 0) {
    return new Response('no valid entries', { status: 400 });
  }

  appendToLog(safeEntries);
  return new Response(null, { status: 204 });
};

export const GET: RequestHandler = async () => {
  if (!import.meta.env.DEV) {
    return new Response('not available in production', { status: 403 });
  }

  ensureLogDir();
  let contents = '';
  try {
    contents = readFileSync(LOG_FILE, 'utf8');
  } catch {
    return new Response('// activity.log is empty', { status: 200 });
  }

  return new Response(contents, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache'
    }
  });
};
