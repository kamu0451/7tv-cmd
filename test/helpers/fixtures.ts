// Fixture access for the unit tests. test/fixtures/<provider>/ is research output, read-only here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_ROOT = path.resolve(HERE, '../fixtures');

// Every fixture body file of a provider (the .meta.json capture records are not bodies), sorted.
export function fixtureFiles(provider: string): string[] {
  return fs
    .readdirSync(path.join(FIXTURE_ROOT, provider))
    .filter((f) => f.endsWith('.json') && !f.endsWith('.meta.json'))
    .sort();
}

export function loadFixture(provider: string, file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_ROOT, provider, file), 'utf8'));
}
