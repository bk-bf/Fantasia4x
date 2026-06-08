/**
 * POST /api/debug-log
 *
 * Receives batched log lines from the client-side gameLogger and routes
 * each line to a tag-specific file under .debug/:
 *
 *   .debug/entities.log  — ENTITY-*, MOB-SNAP, HUNT-UNREACHABLE
 *   .debug/pawns.log     — PAWN-TICK, NEED-CHECK, STATE-CHG, JOB-EVT, MAP-SNAP
 *   .debug/game.log      — everything else (catch-all)
 *
 * Dev-only: returns 204 with no side effects in production builds.
 *
 * Security notes:
 *  - Each line is validated to be a plain string < 2 KB.
 *  - Embedded newlines are replaced with ↵ to prevent log-injection.
 *  - No user-controlled data influences the file path.
 */

import { appendFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

/** Clear a log file once it grows past this size (bytes). */
const MAX_LOG_BYTES = 100 * 1024 * 1024; // 100 MB per file

/** Extract the bracketed tag from a log line, e.g. "[ENTITY-STATE]" → "ENTITY-STATE".
 *  Skips the turn-number token [T0000] which appears before the real tag. */
function extractTag(line: string): string {
    for (const m of line.matchAll(/\[([A-Z][A-Z0-9_-]*)\]/g)) {
        if (!/^T\d+$/.test(m[1])) return m[1];
    }
    return '';
}

/** Decide which log file a line belongs to based on its tag. */
function fileForTag(tag: string): string {
    if (
        tag.startsWith('ENTITY-') ||
        tag === 'MOB-SNAP' ||
        tag === 'HUNT-UNREACHABLE'
    ) return 'entities.log';

    if (
        tag === 'PAWN-TICK' ||
        tag === 'NEED-CHECK' ||
        tag === 'STATE-CHG' ||
        tag === 'JOB-EVT' ||
        tag === 'MAP-SNAP'
    ) return 'pawns.log';

    if (tag === 'PERF') return 'perf.log';

    return 'game.log';
}

/** Append lines to a size-capped log file, rotating (clearing) if it exceeds MAX_LOG_BYTES. */
function appendToLog(logFile: string, lines: string[]): void {
    if (lines.length === 0) return;
    const payload = lines.join('\n') + '\n';
    let size = 0;
    try { size = statSync(logFile).size; } catch { size = 0; }
    if (size >= MAX_LOG_BYTES) {
        const banner = `=== log reset at ${new Date().toISOString()} (exceeded ${MAX_LOG_BYTES} bytes) ===\n`;
        writeFileSync(logFile, banner + payload, 'utf8');
    } else {
        appendFileSync(logFile, payload, 'utf8');
    }
}

export const POST: RequestHandler = async ({ request }) => {
    // No-op outside development so the route can safely be left in the build.
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
        !Array.isArray((body as Record<string, unknown>).lines)
    ) {
        return new Response('bad request', { status: 400 });
    }

    const rawLines: unknown[] = (body as Record<string, unknown[]>).lines;

    // Validate: strings only, max 2 KB each, flatten embedded newlines.
    const safeLines = rawLines
        .filter((l): l is string => typeof l === 'string' && l.length > 0 && l.length < 2048)
        .map((l) => l.replace(/[\r\n]/g, '↵'));

    if (safeLines.length === 0) {
        return new Response(null, { status: 204 });
    }

    const logDir = join(process.cwd(), '.debug');
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

    // Group lines by destination file
    const buckets = new Map<string, string[]>();
    for (const line of safeLines) {
        const dest = fileForTag(extractTag(line));
        let bucket = buckets.get(dest);
        if (!bucket) { bucket = []; buckets.set(dest, bucket); }
        bucket.push(line);
    }

    for (const [filename, lines] of buckets) {
        appendToLog(join(logDir, filename), lines);
    }

    return new Response(null, { status: 204 });
};
