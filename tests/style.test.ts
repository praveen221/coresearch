import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('..', import.meta.url).pathname;

void test('stylesheets contain no comments', () => {
  const sheets = readdirSync(join(root, 'src'), { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.css'));
  assert.ok(sheets.length > 0);
  for (const sheet of sheets) assert.doesNotMatch(readFileSync(join(root, 'src', sheet), 'utf8'), /\/\*/, sheet);
});
