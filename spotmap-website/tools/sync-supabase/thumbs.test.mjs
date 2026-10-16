/**
 * Tests for the thumbnail tree under data/thumbs/: which thumbnails to (re)derive and which to
 * delete, and applying that plan. Every test works in its own temporary folders.
 */
import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyThumbnails, planThumbnails } from './thumbs.mjs';

/** Temporary photo and thumbnail folders with `vienna/` in each. */
async function folders(t) {
  const root = await mkdtemp(join(tmpdir(), 'sync-supabase-thumbs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const spotsDir = join(root, 'spots');
  const thumbsDir = join(root, 'thumbs');
  await mkdir(join(spotsDir, 'vienna'), { recursive: true });
  await mkdir(join(thumbsDir, 'vienna'), { recursive: true });
  return { spotsDir, thumbsDir };
}

/** Writes `path` and sets its modification time to `seconds` since the epoch. */
async function fileAt(path, seconds) {
  await writeFile(path, 'x');
  await utimes(path, seconds, seconds);
}

test('planThumbnails derives missing and outdated thumbnails and skips fresh ones', async (t) => {
  const { spotsDir, thumbsDir } = await folders(t);
  for (const name of ['fresh', 'old', 'missing']) {
    await fileAt(join(spotsDir, 'vienna', `${name}.webp`), 2000);
  }
  await fileAt(join(thumbsDir, 'vienna', 'fresh.webp'), 3000);
  await fileAt(join(thumbsDir, 'vienna', 'old.webp'), 1000);

  const plan = await planThumbnails({
    spotsDir,
    thumbsDir,
    keys: ['vienna/fresh.webp', 'vienna/old.webp', 'vienna/missing.webp'],
  });

  assert.deepEqual(plan.stale, ['vienna/old.webp', 'vienna/missing.webp']);
  assert.deepEqual(plan.orphans, []);
});

test('planThumbnails lists thumbnails no photo references, in any city folder', async (t) => {
  const { spotsDir, thumbsDir } = await folders(t);
  await fileAt(join(spotsDir, 'vienna', 'kept.webp'), 1000);
  await fileAt(join(thumbsDir, 'vienna', 'kept.webp'), 2000);
  await fileAt(join(thumbsDir, 'vienna', 'gone.webp'), 2000);
  await mkdir(join(thumbsDir, 'linz'));
  await fileAt(join(thumbsDir, 'linz', 'old.webp'), 2000);
  await writeFile(join(thumbsDir, '.DS_Store'), 'x');

  const plan = await planThumbnails({
    spotsDir,
    thumbsDir,
    keys: ['vienna/kept.webp'],
  });

  assert.deepEqual(plan.stale, []);
  assert.deepEqual(plan.orphans, ['linz/old.webp', 'vienna/gone.webp']);
});

test('planThumbnails treats a missing thumbnail folder as empty', async (t) => {
  const { spotsDir, thumbsDir } = await folders(t);
  await rm(thumbsDir, { recursive: true });
  await fileAt(join(spotsDir, 'vienna', 'a.webp'), 1000);

  const plan = await planThumbnails({
    spotsDir,
    thumbsDir,
    keys: ['vienna/a.webp'],
  });

  assert.deepEqual(plan, { stale: ['vienna/a.webp'], orphans: [] });
});

test('applyThumbnails derives into new city folders and deletes orphans', async (t) => {
  const { spotsDir, thumbsDir } = await folders(t);
  await mkdir(join(spotsDir, 'graz'));
  await fileAt(join(spotsDir, 'graz', 'new.webp'), 1000);
  await fileAt(join(thumbsDir, 'vienna', 'gone.webp'), 1000);
  const derived = [];

  const result = await applyThumbnails({
    spotsDir,
    thumbsDir,
    plan: { stale: ['graz/new.webp'], orphans: ['vienna/gone.webp'] },
    derive: async (source, out) => {
      derived.push([source, out]);
      await writeFile(out, 'thumb');
    },
  });

  assert.deepEqual(result, { derived: 1, deleted: 1 });
  assert.deepEqual(derived, [
    [join(spotsDir, 'graz', 'new.webp'), join(thumbsDir, 'graz', 'new.webp')],
  ]);
  assert.ok(existsSync(join(thumbsDir, 'graz', 'new.webp')));
  assert.equal(existsSync(join(thumbsDir, 'vienna', 'gone.webp')), false);
});
