#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TABLE = 'src/lib/audio/bedLoudness.json';
const BED_DIR = 'static/audio/ambient';

function integratedLufs(file) {
  const run = spawnSync(
    'ffmpeg',
    ['-nostats', '-hide_banner', '-i', file, '-af', 'ebur128', '-f', 'null', '-'],
    { encoding: 'utf8' }
  );
  if (run.error) throw new Error(`ffmpeg did not start: ${run.error.message}`);
  const summary = run.stderr.slice(run.stderr.lastIndexOf('Summary:'));
  const match = /I:\s+(-?\d+(?:\.\d+)?) LUFS/.exec(summary);
  if (run.status !== 0 || !match)
    throw new Error(`no integrated loudness for ${file}\n${run.stderr.slice(-400)}`);
  return Number(match[1]);
}

const beds = Object.keys(JSON.parse(readFileSync(TABLE, 'utf8')));
const measured = Object.fromEntries(
  beds.map((bed) => [bed, integratedLufs(join(BED_DIR, `${bed}.ogg`))])
);
const text = `${JSON.stringify(measured, null, 2)}\n`;
if (process.argv.includes('--write')) writeFileSync(TABLE, text);
process.stdout.write(text);
