import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_LOG_BYTES = 16 * 1024 * 1024;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function logStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export const logDir = (): string => join(process.cwd(), '.debug');

export function rotatedName(logFile: string, at: Date, taken: (path: string) => boolean): string {
  const base = `${logFile}.${at
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')}`;
  let name = base;
  for (let n = 1; taken(name); n++) name = `${base}-${n}`;
  return name;
}

export function appendToLog(logFile: string, lines: string[], maxBytes = MAX_LOG_BYTES): void {
  if (lines.length === 0) return;
  const payload = lines.join('\n') + '\n';
  let size = 0;
  try {
    size = statSync(logFile).size;
  } catch {
    size = 0;
  }
  if (size >= maxBytes) renameSync(logFile, rotatedName(logFile, new Date(), existsSync));
  appendFileSync(logFile, payload, 'utf8');
}
