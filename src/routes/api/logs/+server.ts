/**
 * DELETE /api/logs
 *
 * Clears all .debug/*.log files (dev-only).
 */

import { readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

const LOG_DIR = '.debug';

export const DELETE: RequestHandler = async () => {
	if (!import.meta.env.DEV) {
		return new Response('not available in production', { status: 403 });
	}

	if (!existsSync(LOG_DIR)) {
		return new Response('no logs to clear', { status: 200 });
	}

	let cleared = 0;
	for (const file of readdirSync(LOG_DIR)) {
		if (file.endsWith('.log')) {
			unlinkSync(join(LOG_DIR, file));
			cleared++;
		}
	}

	return new Response(`cleared ${cleared} log files`, { status: 200 });
};
