/**
 * POST /api/log — the unified logging file mirror (dev-only).
 *
 * Receives batched, already-formatted log lines tagged with a `category` and appends each to
 * `.debug/<category>.log` (e.g. combat.log, perf.log, ai.log). The client batches + debounces on the
 * MAIN thread (see stores/Log.ts `flushMirror`), so file I/O never touches the sim worker / TPS.
 * This is the agent-fetch path: `grep .debug/combat.log`, etc.
 *
 * Returns 204 with no side effects in production.
 */
import { appendFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

/** Rotate (clear) a category file once it grows past this size. Bounded by design — the verbose
 *  firehose is gated off by default — so this is a backstop, not the old 100 MB regime. */
const MAX_LOG_BYTES = 16 * 1024 * 1024; // 16 MB per category file

/** Only kebab/lowercase category names map to a file — never user-controlled path segments. */
const CATEGORY_RE = /^[a-z][a-z0-9_]*$/;

function appendToLog(logFile: string, lines: string[]): void {
  if (lines.length === 0) return;
  const payload = lines.join('\n') + '\n';
  let size = 0;
  try {
    size = statSync(logFile).size;
  } catch {
    size = 0;
  }
  if (size >= MAX_LOG_BYTES) {
    const banner = `=== log reset at ${new Date().toISOString()} (exceeded ${MAX_LOG_BYTES} bytes) ===\n`;
    writeFileSync(logFile, banner + payload, 'utf8');
  } else {
    appendFileSync(logFile, payload, 'utf8');
  }
}

export const POST: RequestHandler = async ({ request }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 204 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }
  const entries = (body as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return new Response('bad request', { status: 400 });

  // Group sanitised lines by destination category file.
  const buckets = new Map<string, string[]>();
  for (const e of entries) {
    if (typeof e !== 'object' || e === null) continue;
    const cat = (e as { category?: unknown }).category;
    const line = (e as { line?: unknown }).line;
    if (typeof cat !== 'string' || !CATEGORY_RE.test(cat)) continue;
    if (typeof line !== 'string' || line.length === 0 || line.length > 2048) continue;
    const safe = line.replace(/[\r\n]/g, '↵');
    let bucket = buckets.get(cat);
    if (!bucket) buckets.set(cat, (bucket = []));
    bucket.push(safe);
  }
  if (buckets.size === 0) return new Response(null, { status: 204 });

  const logDir = join(process.cwd(), '.debug');
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  for (const [cat, lines] of buckets) appendToLog(join(logDir, `${cat}.log`), lines);

  return new Response(null, { status: 204 });
};
