/**
 * GET /api/debug-stream?source=all|pawns|entities|activity|game|perf
 *
 * Server-Sent Events stream that tails the `.debug/*.log` files written by
 * gameLogger and the other log routes. On connect it replays a tail of the
 * selected file(s), then pushes each newly-appended line as it lands. Powers
 * the in-game Debug Log viewer; dev-only (403 in production builds).
 *
 * Each appended line is emitted as one SSE `data:` frame. Partial trailing
 * writes are buffered until their newline arrives, and file rotation (the
 * size-capped reset in /api/debug-log) is detected by a shrinking size.
 */

import { existsSync, statSync, openSync, readSync, closeSync, watch, readFileSync } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

const LOG_DIR = '.debug';

/** Logical source name → log filename. */
const SOURCES: Record<string, string> = {
  pawns: 'pawns.log',
  entities: 'entities.log',
  activity: 'activity.log',
  game: 'game.log',
  perf: 'perf.log'
};

export const GET: RequestHandler = async ({ url }) => {
  if (!import.meta.env.DEV) {
    return new Response('not available in production', { status: 403 });
  }

  const source = url.searchParams.get('source') ?? 'all';
  const files = source === 'all' ? Object.values(SOURCES) : [SOURCES[source]].filter(Boolean);
  if (files.length === 0) {
    return new Response('unknown source', { status: 400 });
  }

  const dir = join(process.cwd(), LOG_DIR);
  const encoder = new TextEncoder();
  const offsets = new Map<string, number>(); // byte position already streamed
  const leftovers = new Map<string, string>(); // partial trailing line per file
  let watcher: FSWatcher | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (line: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${line}\n\n`));
        } catch {
          /* stream closed mid-flight */
        }
      };

      // Replay a tail of each file, then mark its end as our start offset.
      const INITIAL = source === 'all' ? 150 : 400;
      for (const f of files) {
        const full = join(dir, f);
        if (!existsSync(full)) {
          offsets.set(f, 0);
          continue;
        }
        try {
          const lines = readFileSync(full, 'utf8').split('\n').filter(Boolean);
          for (const l of lines.slice(-INITIAL)) send(l);
          offsets.set(f, statSync(full).size);
        } catch {
          offsets.set(f, 0);
        }
      }

      // Read bytes appended since we last drained this file and emit whole lines.
      const drain = (f: string) => {
        const full = join(dir, f);
        let size: number;
        try {
          size = statSync(full).size;
        } catch {
          return;
        }
        let off = offsets.get(f) ?? 0;
        if (size < off) {
          // File was rotated/truncated — restart from the top.
          off = 0;
          leftovers.set(f, '');
        }
        if (size <= off) return;

        const len = size - off;
        const buf = Buffer.allocUnsafe(len);
        const fd = openSync(full, 'r');
        try {
          readSync(fd, buf, 0, len, off);
        } finally {
          closeSync(fd);
        }
        offsets.set(f, size);

        const text = (leftovers.get(f) ?? '') + buf.toString('utf8');
        const parts = text.split('\n');
        leftovers.set(f, parts.pop() ?? ''); // keep any unterminated tail
        for (const l of parts) if (l) send(l);
      };

      try {
        watcher = watch(dir, (_evt, filename) => {
          if (!filename) {
            for (const f of files) drain(f);
          } else if (files.includes(filename.toString())) {
            drain(filename.toString());
          }
        });
      } catch {
        /* .debug dir may not exist yet; nothing to watch */
      }

      // Keep-alive comment so proxies/browsers don't drop an idle stream.
      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          /* closed */
        }
      }, 20000);
    },

    cancel() {
      watcher?.close();
      if (ping) clearInterval(ping);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
};
