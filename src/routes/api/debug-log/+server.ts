/**
 * POST /api/debug-log
 *
 * Receives batched log lines from the client-side gameLogger and appends
 * them to .debug/game.log at the project root.
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

/** Clear the log file once it grows past this size (bytes). */
const MAX_LOG_BYTES = 500 * 1024 * 1024; // 500 MB

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

    const logFile = join(logDir, 'game.log');
    const payload = safeLines.join('\n') + '\n';

    // Size-capped rotation: if the file has grown past MAX_LOG_BYTES, clear it
    // (overwrite) instead of appending. Keeps full per-turn granularity while
    // bounding disk use — even at 60 ticks/s the file simply resets when full.
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

    return new Response(null, { status: 204 });
};
