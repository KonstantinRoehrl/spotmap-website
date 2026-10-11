/**
 * Tests for atomic writes: a successful write replaces the target and leaves no temporary file
 * behind, and a failed write rethrows its error and still removes its temporary file, so a stray
 * `.tmp` never lingers beside a served dataset. Every test writes into its own temporary folder.
 */
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { writeFileAtomic } from './atomic.mjs';

/** A temporary folder, removed after the test. */
async function temporaryFolder(t) {
  const folder = await mkdtemp(join(tmpdir(), 'extract-spots-atomic-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  return folder;
}

test('replaces the target and leaves only the target behind', async (t) => {
  const folder = await temporaryFolder(t);
  const target = join(folder, 'graz.json');
  await writeFileAtomic(target, 'old');

  await writeFileAtomic(target, 'new');

  assert.equal(await readFile(target, 'utf8'), 'new');
  assert.deepEqual(await readdir(folder), ['graz.json']);
});

test('rethrows a failed rename and removes its temporary file', async (t) => {
  const folder = await temporaryFolder(t);
  const target = join(folder, 'graz.json');
  await mkdir(join(target, 'blocker'), { recursive: true });

  await assert.rejects(writeFileAtomic(target, 'data'), { code: 'EISDIR' });

  assert.deepEqual(await readdir(folder), ['graz.json']);
});
