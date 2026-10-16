/**
 * Tests for the pure upload and prune planning, and the bucket walk over a fake client.
 */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  listRemote,
  md5Of,
  planPrune,
  planUploads,
  remoteKeysOf,
} from './storage-plan.mjs';

test('remoteKeysOf names the full-size and thumbnail objects of one photo', () => {
  assert.deepEqual(remoteKeysOf('vienna/a-1-00000000.webp'), [
    'full/vienna/a-1-00000000.webp',
    'thumb/vienna/a-1-00000000.webp',
  ]);
});

test('md5Of hashes the file bytes as lower-case hex', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'sync-supabase-md5-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'a.webp');
  await writeFile(path, 'bytes');

  assert.equal(
    await md5Of(path),
    createHash('md5').update('bytes').digest('hex'),
  );
});

test('planUploads keeps missing and changed objects, skips identical ones', () => {
  const wanted = new Map([
    ['full/vienna/a.webp', 'aaa'],
    ['full/vienna/b.webp', 'bbb'],
    ['thumb/vienna/a.webp', 'ccc'],
    ['thumb/vienna/b.webp', null],
  ]);
  const remote = new Map([
    ['full/vienna/a.webp', 'aaa'],
    ['full/vienna/b.webp', 'old'],
    ['thumb/vienna/b.webp', 'ddd'],
  ]);

  assert.deepEqual(planUploads(wanted, remote), [
    'full/vienna/b.webp',
    'thumb/vienna/a.webp',
    'thumb/vienna/b.webp',
  ]);
});

test('planPrune lists the remote objects nothing wants', () => {
  const wanted = new Map([['full/vienna/a.webp', 'aaa']]);
  const remote = new Map([
    ['thumb/linz/z.webp', 'x'],
    ['full/vienna/a.webp', 'aaa'],
    ['full/vienna/gone.webp', 'y'],
  ]);

  assert.deepEqual(planPrune(wanted, remote), [
    'full/vienna/gone.webp',
    'thumb/linz/z.webp',
  ]);
});

test('listRemote walks every city folder, including ones no longer registered', async () => {
  const folders = {
    full: [
      { name: 'vienna', folder: true, eTag: null },
      { name: 'linz', folder: true, eTag: null },
    ],
    'full/vienna': [{ name: 'a.webp', folder: false, eTag: 'e1' }],
    'full/linz': [{ name: 'old.webp', folder: false, eTag: 'e2' }],
    thumb: [{ name: 'stray.webp', folder: false, eTag: 'e3' }],
    'thumb/vienna': [],
    'full/graz': [],
    'thumb/graz': [],
  };
  const listed = [];
  const client = {
    async listFolder(folder) {
      listed.push(folder);
      return folders[folder] ?? [];
    },
  };

  const remote = await listRemote(client, ['vienna', 'graz']);

  assert.deepEqual([...remote].sort(), [
    ['full/linz/old.webp', 'e2'],
    ['full/vienna/a.webp', 'e1'],
    ['thumb/stray.webp', 'e3'],
  ]);
  assert.ok(
    listed.includes('full/linz'),
    'an unregistered city folder is walked',
  );
  assert.ok(
    listed.includes('thumb/graz'),
    'a registered city is walked even when empty',
  );
});
