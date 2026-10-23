/**
 * Tests for the pure upload planning, and the bucket walk over a fake client.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { listRemote, planUploads, remoteKeysOf } from './storage-plan.mjs';

test('remoteKeysOf names the full-size and thumbnail objects of one photo', () => {
  assert.deepEqual(remoteKeysOf('vienna/a-1-00000000.webp'), [
    'full/vienna/a-1-00000000.webp',
    'thumb/vienna/a-1-00000000.webp',
  ]);
});

test('planUploads keeps only the objects the bucket lacks, sorted', () => {
  const wanted = [
    'thumb/vienna/a.webp',
    'full/vienna/b.webp',
    'full/vienna/a.webp',
  ];
  const remote = new Set(['full/vienna/a.webp', 'full/linz/x.webp']);

  assert.deepEqual(planUploads(wanted, remote), [
    'full/vienna/b.webp',
    'thumb/vienna/a.webp',
  ]);
});

test('listRemote walks only the given cities folders and returns their object keys', async () => {
  const folders = {
    'full/vienna': [
      { name: 'a.webp', folder: false },
      { name: 'nested', folder: true },
    ],
    'full/graz': [],
    'thumb/vienna': [{ name: 'a.webp', folder: false }],
    'thumb/graz': [{ name: 'g.webp', folder: false }],
  };
  const listed = [];
  const client = {
    async listFolder(folder) {
      listed.push(folder);
      return folders[folder] ?? [];
    },
  };

  const remote = await listRemote(client, ['vienna', 'graz']);

  assert.deepEqual(
    remote,
    new Set(['full/vienna/a.webp', 'thumb/vienna/a.webp', 'thumb/graz/g.webp']),
  );
  assert.deepEqual(listed, [
    'full/vienna',
    'full/graz',
    'thumb/vienna',
    'thumb/graz',
  ]);
});
