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

import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

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

    appendFileSync(join(logDir, 'game.log'), safeLines.join('\n') + '\n', 'utf8');

    return new Response(null, { status: 204 });
};
