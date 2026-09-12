#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { checkPrivate } from './lib/private.mjs';

const what = process.argv[2] ?? 'the text';
const errors = checkPrivate(readFileSync(0, 'utf8'));
for (const e of errors) process.stderr.write(`${what} ${e}\n`);
process.exit(errors.length ? 1 : 0);
