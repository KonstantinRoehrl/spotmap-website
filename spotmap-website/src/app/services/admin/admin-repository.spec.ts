import { TestBed } from '@angular/core/testing';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminSpot } from '../../models/admin/admin-spot';
import { AdminSession } from './admin-session';
import {
  AdminRepository,
  AdminRepositoryError,
  PHOTO_BUCKET,
} from './admin-repository';
import type { ProcessedPhoto } from './photo-pipeline/photo-pipeline';

/** What the fake returns for one RPC: PostgREST's `{ data, error, status }`. */
interface RpcReply {
  data?: unknown;
  error?: { code: string; message: string };
  status?: number;
}

/**
 * A hand-written stand-in for the supabase-js client. It records every call in order, as one
 * line each in {@link log}, and returns whatever a test scripted.
 */
class FakeSupabase {
  readonly log: string[] = [];
  readonly rpcArgs = new Map<string, unknown>();
  readonly uploadOptions: unknown[] = [];
  readonly buckets = new Set<string>();
  rpcReplies: Record<string, RpcReply> = {};
  citiesReply: RpcReply = { data: [{ slug: 'barcelona' }, { slug: 'vienna' }] };
  /** Storage errors by object path; a path absent here uploads fine. */
  uploadErrors: Record<string, object> = {};
  removeError: object | null = null;

  rpc(fn: string, args: unknown) {
    this.log.push(`rpc ${fn}`);
    this.rpcArgs.set(fn, args);
    const reply = this.rpcReplies[fn] ?? { data: null };
    return Promise.resolve({
      data: reply.error ? null : (reply.data ?? null),
      error: reply.error ?? null,
      status: reply.status ?? (reply.error ? 400 : 200),
    });
  }

  from(table: string) {
    return {
      select: (columns: string) => ({
        order: (column: string) => {
          this.log.push(`from ${table} select ${columns} order ${column}`);
          const reply = this.citiesReply;
          return Promise.resolve({
            data: reply.error ? null : reply.data,
            error: reply.error ?? null,
            status: reply.status ?? (reply.error ? 400 : 200),
          });
        },
      }),
    };
  }

  readonly storage = {
    from: (bucket: string) => {
      this.buckets.add(bucket);
      return {
        upload: (path: string, _body: Blob, options: unknown) => {
          this.log.push(`upload ${path}`);
          this.uploadOptions.push(options);
          const error = this.uploadErrors[path] ?? null;
          return Promise.resolve({ data: error ? null : { path }, error });
        },
        remove: (paths: string[]) => {
          this.log.push(`remove ${paths.join(' ')}`);
          return Promise.resolve({
            data: this.removeError ? null : [],
            error: this.removeError,
          });
        },
      };
    },
  };
}

const SPOT: AdminSpot = {
  id: 'hbf-curb-99f6e5',
  city: 'vienna',
  name: 'Hbf Curb',
  status: 'active',
  lng: 16.3785491,
  lat: 48.1840844,
  notes: null,
  photos: ['vienna/hbf-curb-99f6e5-11111111.webp'],
  deletedAt: null,
  updatedAt: '2026-10-18T10:00:00+00:00',
};

/** A processed photo whose renditions are tiny placeholder blobs. */
function processed(hash8: string): ProcessedPhoto {
  return {
    sourceName: `IMG_${hash8}.JPG`,
    gps: null,
    full: new Blob([`full ${hash8}`], { type: 'image/webp' }),
    thumb: new Blob([`thumb ${hash8}`], { type: 'image/webp' }),
    hash8,
    width: 1400,
    height: 1050,
  };
}

describe('AdminRepository', () => {
  let fake: FakeSupabase;
  let repository: AdminRepository;

  beforeEach(() => {
    fake = new FakeSupabase();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AdminSession,
          useValue: {
            client: () => Promise.resolve(fake as unknown as SupabaseClient),
          },
        },
      ],
    });
    repository = TestBed.inject(AdminRepository);
  });

  it('names the public bucket', () => {
    expect(PHOTO_BUCKET).toBe('spot-photos');
  });

  it('lists the city slugs in order', async () => {
    expect(await repository.listCities()).toEqual(['barcelona', 'vienna']);
    expect(fake.log).toEqual(['from cities select slug order slug']);
  });

  describe('calls each RPC with its argument names', () => {
    const cases: [
      string,
      (r: AdminRepository) => Promise<unknown>,
      string,
      object,
    ][] = [
      [
        'listSpots',
        (r) => r.listSpots('vienna'),
        'admin_list_spots',
        { p_city: 'vienna' },
      ],
      [
        'listSpots (all cities)',
        (r) => r.listSpots(null),
        'admin_list_spots',
        { p_city: null },
      ],
      ['getSpot', (r) => r.getSpot('a-1'), 'admin_get_spot', { p_id: 'a-1' }],
      [
        'nearbySpots',
        (r) => r.nearbySpots({ lng: 16.37, lat: 48.2 }, 'Hbf Curb'),
        'admin_nearby_spots',
        { p_lng: 16.37, p_lat: 48.2, p_name: 'Hbf Curb' },
      ],
      [
        'cityCentre',
        (r) => r.cityCentre('vienna'),
        'admin_city_centre',
        { p_city: 'vienna' },
      ],
      [
        'imageryToken',
        (r) => r.imageryToken('esri_api_key'),
        'admin_get_setting',
        { p_key: 'esri_api_key' },
      ],
      [
        'createCity',
        (r) => r.createCity('graz'),
        'admin_create_city',
        { p_slug: 'graz' },
      ],
      [
        'reorderPhotos',
        (r) => r.reorderPhotos('a-1', ['vienna/b.webp', 'vienna/a.webp']),
        'admin_reorder_photos',
        { p_spot_id: 'a-1', p_keys: ['vienna/b.webp', 'vienna/a.webp'] },
      ],
      [
        'deleteSpot',
        (r) => r.deleteSpot('a-1'),
        'admin_delete_spot',
        { p_id: 'a-1' },
      ],
      [
        'restoreSpot',
        (r) => r.restoreSpot('a-1'),
        'admin_restore_spot',
        { p_id: 'a-1' },
      ],
    ];
    for (const [label, call, fn, args] of cases) {
      it(label, async () => {
        await call(repository);
        expect(fake.log).toEqual([`rpc ${fn}`]);
        expect(fake.rpcArgs.get(fn)).toEqual(args);
      });
    }
  });

  it('returns what the RPC returns', async () => {
    fake.rpcReplies['admin_get_spot'] = { data: SPOT };
    fake.rpcReplies['admin_city_centre'] = { data: { lng: 16.37, lat: 48.2 } };
    fake.rpcReplies['admin_get_setting'] = { data: 'tok' };
    expect(await repository.getSpot(SPOT.id)).toEqual(SPOT);
    expect(await repository.cityCentre('vienna')).toEqual({
      lng: 16.37,
      lat: 48.2,
    });
    expect(await repository.imageryToken('esri_api_key')).toBe('tok');
  });

  it('sends a patch with only the given keys and the position as lng/lat', async () => {
    await repository.updateSpot('a-1', {
      name: 'Renamed',
      notes: '  ', // blank notes are sent as null
      position: { lng: 16.4, lat: 48.21 },
    });
    expect(fake.rpcArgs.get('admin_update_spot')).toEqual({
      p_id: 'a-1',
      p_patch: { name: 'Renamed', notes: null, lng: 16.4, lat: 48.21 },
    });
  });

  describe('createSpotWithPhotos', () => {
    const fields = {
      city: 'vienna',
      name: 'Hbf Curb',
      status: 'active' as const,
      notes: 'Wax it first',
      position: { lng: 16.3785491, lat: 48.1840844 },
    };

    beforeEach(() => {
      fake.rpcReplies['admin_next_spot_id'] = { data: 'hbf-curb-99f6e5-2' };
      fake.rpcReplies['admin_create_spot'] = { data: SPOT };
    });

    it('takes the final id, uploads both renditions of every photo, then creates the spot', async () => {
      const spot = await repository.createSpotWithPhotos(fields, [
        processed('aaaaaaaa'),
        processed('bbbbbbbb'),
      ]);

      expect(spot).toEqual(SPOT);
      expect(fake.rpcArgs.get('admin_next_spot_id')).toEqual({
        p_base: 'hbf-curb-99f6e5',
      });
      expect(fake.log).toEqual([
        'rpc admin_next_spot_id',
        'upload full/vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp',
        'upload thumb/vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp',
        'upload full/vienna/hbf-curb-99f6e5-2-bbbbbbbb.webp',
        'upload thumb/vienna/hbf-curb-99f6e5-2-bbbbbbbb.webp',
        'rpc admin_create_spot',
      ]);
      expect([...fake.buckets]).toEqual(['spot-photos']);
      expect(fake.uploadOptions[0]).toEqual({
        contentType: 'image/webp',
        cacheControl: '604800',
        upsert: false,
      });
      expect(fake.rpcArgs.get('admin_create_spot')).toEqual({
        p_spot: {
          id: 'hbf-curb-99f6e5-2',
          city: 'vienna',
          name: 'Hbf Curb',
          status: 'active',
          lng: 16.3785491,
          lat: 48.1840844,
          notes: 'Wax it first',
          photos: [
            'vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp',
            'vienna/hbf-curb-99f6e5-2-bbbbbbbb.webp',
          ],
        },
      });
    });

    it('uploads and keys a photo picked twice only once, keeping the batch order', async () => {
      await repository.createSpotWithPhotos(fields, [
        processed('aaaaaaaa'),
        processed('bbbbbbbb'),
        processed('aaaaaaaa'),
      ]);
      expect(
        fake.log.filter((line) => line.startsWith('upload full/')),
      ).toEqual([
        'upload full/vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp',
        'upload full/vienna/hbf-curb-99f6e5-2-bbbbbbbb.webp',
      ]);
      expect(
        (
          fake.rpcArgs.get('admin_create_spot') as {
            p_spot: { photos: string[] };
          }
        ).p_spot.photos,
      ).toEqual([
        'vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp',
        'vienna/hbf-curb-99f6e5-2-bbbbbbbb.webp',
      ]);
    });

    it('counts an object that already exists as uploaded', async () => {
      fake.uploadErrors['full/vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp'] = {
        name: 'StorageApiError',
        message: 'The resource already exists',
        status: 400,
        statusCode: '409',
      };
      await expectAsync(
        repository.createSpotWithPhotos(fields, [processed('aaaaaaaa')]),
      ).toBeResolvedTo(SPOT);
    });

    it('deletes only the objects it created when the RPC fails', async () => {
      fake.uploadErrors['full/vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp'] = {
        name: 'StorageApiError',
        message: 'The resource already exists',
        status: 409,
        statusCode: '409',
      };
      fake.rpcReplies['admin_create_spot'] = {
        error: { code: '23505', message: 'spot id taken: hbf-curb-99f6e5-2' },
        status: 409,
      };

      await expectAsync(
        repository.createSpotWithPhotos(fields, [processed('aaaaaaaa')]),
      ).toBeRejectedWith(jasmine.objectContaining({ kind: 'conflict' }));
      expect(fake.log[fake.log.length - 1]).toBe(
        'remove thumb/vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp',
      );
    });

    it('stops at a failed upload, cleans up and never calls the create RPC', async () => {
      fake.uploadErrors['full/vienna/hbf-curb-99f6e5-2-bbbbbbbb.webp'] = {
        name: 'StorageApiError',
        message: 'new row violates row-level security policy',
        status: 403,
        statusCode: '403',
      };

      await expectAsync(
        repository.createSpotWithPhotos(fields, [
          processed('aaaaaaaa'),
          processed('bbbbbbbb'),
        ]),
      ).toBeRejectedWith(jasmine.objectContaining({ kind: 'forbidden' }));
      expect(fake.log).not.toContain('rpc admin_create_spot');
      expect(fake.log[fake.log.length - 1]).toBe(
        'remove full/vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp thumb/vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp',
      );
    });

    it('reports a dropped connection during upload as network', async () => {
      fake.uploadErrors['full/vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp'] = {
        name: 'StorageUnknownError',
        message: 'Failed to fetch',
        originalError: new TypeError('Failed to fetch'),
      };
      await expectAsync(
        repository.createSpotWithPhotos(fields, [processed('aaaaaaaa')]),
      ).toBeRejectedWith(jasmine.objectContaining({ kind: 'network' }));
    });

    it('keeps the original error when the cleanup also fails', async () => {
      const warn = spyOn(console, 'warn');
      fake.removeError = {
        name: 'StorageApiError',
        message: 'denied',
        status: 403,
      };
      fake.rpcReplies['admin_create_spot'] = {
        error: { code: 'P0001', message: 'admin_create_spot: name is blank' },
        status: 400,
      };
      await expectAsync(
        repository.createSpotWithPhotos(fields, [processed('aaaaaaaa')]),
      ).toBeRejectedWith(jasmine.objectContaining({ kind: 'invalid' }));
      expect(warn).toHaveBeenCalled();
    });

    describe('when the create RPC fails without a verdict', () => {
      const keys = ['vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp'];
      const lostResponse: RpcReply = {
        error: { code: '', message: 'TypeError: Failed to fetch' },
        status: 0,
      };
      const absent: RpcReply = {
        error: { code: 'P0001', message: 'admin_get_spot: no spot' },
        status: 400,
      };

      beforeEach(() => {
        fake.rpcReplies['admin_create_spot'] = lostResponse;
      });

      it('returns the spot and deletes nothing when the read-back finds it committed', async () => {
        fake.rpcReplies['admin_get_spot'] = {
          data: { ...SPOT, id: 'hbf-curb-99f6e5-2', photos: keys },
        };
        const spot = await repository.createSpotWithPhotos(fields, [
          processed('aaaaaaaa'),
        ]);
        expect(spot.id).toBe('hbf-curb-99f6e5-2');
        expect(fake.rpcArgs.get('admin_get_spot')).toEqual({
          p_id: 'hbf-curb-99f6e5-2',
        });
        expect(fake.log.filter((line) => line.startsWith('remove'))).toEqual(
          [],
        );
      });

      it('deletes the objects and rethrows when the read-back finds no spot', async () => {
        fake.rpcReplies['admin_get_spot'] = absent;
        await expectAsync(
          repository.createSpotWithPhotos(fields, [processed('aaaaaaaa')]),
        ).toBeRejectedWith(
          jasmine.objectContaining({
            kind: 'network',
            pendingSpotId: undefined,
          }),
        );
        expect(fake.log[fake.log.length - 1]).toBe(
          'remove full/vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp thumb/vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp',
        );
      });

      it('keeps the objects and names the pending id when the read-back also fails', async () => {
        fake.rpcReplies['admin_get_spot'] = lostResponse;
        await expectAsync(
          repository.createSpotWithPhotos(fields, [processed('aaaaaaaa')]),
        ).toBeRejectedWith(
          jasmine.objectContaining({
            kind: 'network',
            pendingSpotId: 'hbf-curb-99f6e5-2',
          }),
        );
        expect(fake.log.filter((line) => line.startsWith('remove'))).toEqual(
          [],
        );
      });

      it('reads back a server fault too, since its outcome is just as unknown', async () => {
        fake.rpcReplies['admin_create_spot'] = {
          error: { code: 'XX000', message: 'bad gateway' },
          status: 502,
        };
        fake.rpcReplies['admin_get_spot'] = {
          data: { ...SPOT, id: 'hbf-curb-99f6e5-2', photos: keys },
        };
        await expectAsync(
          repository.createSpotWithPhotos(fields, [processed('aaaaaaaa')]),
        ).toBeResolved();
        expect(fake.log.filter((line) => line.startsWith('remove'))).toEqual(
          [],
        );
      });

      it('never reads back a definite rejection', async () => {
        fake.rpcReplies['admin_create_spot'] = {
          error: { code: '42501', message: 'admin only' },
          status: 403,
        };
        await expectAsync(
          repository.createSpotWithPhotos(fields, [processed('aaaaaaaa')]),
        ).toBeRejectedWith(jasmine.objectContaining({ kind: 'forbidden' }));
        expect(fake.log).not.toContain('rpc admin_get_spot');
      });
    });

    describe('when resumed with the id of an earlier unresolved attempt', () => {
      const resumeId = 'hbf-curb-99f6e5-2';

      it('returns the spot without uploading or creating when it already landed', async () => {
        fake.rpcReplies['admin_get_spot'] = {
          data: {
            ...SPOT,
            id: resumeId,
            photos: ['vienna/hbf-curb-99f6e5-2-aaaaaaaa.webp'],
          },
        };
        const spot = await repository.createSpotWithPhotos(
          fields,
          [processed('aaaaaaaa')],
          resumeId,
        );
        expect(spot.id).toBe(resumeId);
        expect(fake.log).toEqual(['rpc admin_get_spot']);
      });

      it('creates the spot under the same id, without asking for a new one, when it is absent', async () => {
        fake.rpcReplies['admin_get_spot'] = {
          error: { code: 'P0001', message: 'admin_get_spot: no spot' },
          status: 400,
        };
        await repository.createSpotWithPhotos(
          fields,
          [processed('aaaaaaaa')],
          resumeId,
        );
        expect(fake.log).not.toContain('rpc admin_next_spot_id');
        expect(fake.log[fake.log.length - 1]).toBe('rpc admin_create_spot');
        expect(
          (fake.rpcArgs.get('admin_create_spot') as { p_spot: { id: string } })
            .p_spot.id,
        ).toBe(resumeId);
      });

      it('uploads nothing and stays pending when the read cannot tell', async () => {
        fake.rpcReplies['admin_get_spot'] = {
          error: { code: '', message: 'TypeError: Failed to fetch' },
          status: 0,
        };
        await expectAsync(
          repository.createSpotWithPhotos(
            fields,
            [processed('aaaaaaaa')],
            resumeId,
          ),
        ).toBeRejectedWith(
          jasmine.objectContaining({
            kind: 'network',
            pendingSpotId: resumeId,
          }),
        );
        expect(fake.log).toEqual(['rpc admin_get_spot']);
      });
    });
  });

  describe('attachPhotos', () => {
    it('uploads under the spot’s city and id, then appends the keys', async () => {
      fake.rpcReplies['admin_add_photos'] = { data: SPOT };
      expect(
        await repository.attachPhotos(SPOT, [processed('cccccccc')]),
      ).toEqual(SPOT);
      expect(fake.log).toEqual([
        'upload full/vienna/hbf-curb-99f6e5-cccccccc.webp',
        'upload thumb/vienna/hbf-curb-99f6e5-cccccccc.webp',
        'rpc admin_add_photos',
      ]);
      expect(fake.rpcArgs.get('admin_add_photos')).toEqual({
        p_spot_id: 'hbf-curb-99f6e5',
        p_keys: ['vienna/hbf-curb-99f6e5-cccccccc.webp'],
      });
    });

    it('skips photos repeated in the batch or already on the spot', async () => {
      fake.rpcReplies['admin_add_photos'] = { data: SPOT };
      // SPOT already holds vienna/hbf-curb-99f6e5-11111111.webp.
      await repository.attachPhotos(SPOT, [
        processed('11111111'),
        processed('cccccccc'),
        processed('cccccccc'),
      ]);
      expect(fake.log).toEqual([
        'upload full/vienna/hbf-curb-99f6e5-cccccccc.webp',
        'upload thumb/vienna/hbf-curb-99f6e5-cccccccc.webp',
        'rpc admin_add_photos',
      ]);
      expect(fake.rpcArgs.get('admin_add_photos')).toEqual({
        p_spot_id: 'hbf-curb-99f6e5',
        p_keys: ['vienna/hbf-curb-99f6e5-cccccccc.webp'],
      });
    });

    it('deletes the objects it created when the RPC fails', async () => {
      fake.rpcReplies['admin_add_photos'] = {
        error: { code: '42501', message: 'admin only' },
        status: 403,
      };
      await expectAsync(
        repository.attachPhotos(SPOT, [processed('cccccccc')]),
      ).toBeRejectedWith(jasmine.objectContaining({ kind: 'forbidden' }));
      expect(fake.log[fake.log.length - 1]).toBe(
        'remove full/vienna/hbf-curb-99f6e5-cccccccc.webp thumb/vienna/hbf-curb-99f6e5-cccccccc.webp',
      );
    });

    describe('when the RPC fails without a verdict', () => {
      const key = 'vienna/hbf-curb-99f6e5-cccccccc.webp';

      beforeEach(() => {
        fake.rpcReplies['admin_add_photos'] = {
          error: { code: '', message: 'TypeError: Failed to fetch' },
          status: 0,
        };
      });

      it('returns the spot read back and deletes nothing when the keys landed', async () => {
        const landed = { ...SPOT, photos: [...SPOT.photos, key] };
        fake.rpcReplies['admin_get_spot'] = { data: landed };
        expect(
          await repository.attachPhotos(SPOT, [processed('cccccccc')]),
        ).toEqual(landed);
        expect(fake.log.filter((line) => line.startsWith('remove'))).toEqual(
          [],
        );
      });

      it('deletes the objects and rethrows when the keys did not land', async () => {
        fake.rpcReplies['admin_get_spot'] = { data: SPOT };
        await expectAsync(
          repository.attachPhotos(SPOT, [processed('cccccccc')]),
        ).toBeRejectedWith(jasmine.objectContaining({ kind: 'network' }));
        expect(fake.log[fake.log.length - 1]).toBe(
          `remove full/${key} thumb/${key}`,
        );
      });

      it('keeps the objects when the read-back also fails', async () => {
        fake.rpcReplies['admin_get_spot'] = fake.rpcReplies['admin_add_photos'];
        await expectAsync(
          repository.attachPhotos(SPOT, [processed('cccccccc')]),
        ).toBeRejectedWith(jasmine.objectContaining({ kind: 'network' }));
        expect(fake.log.filter((line) => line.startsWith('remove'))).toEqual(
          [],
        );
      });
    });
  });

  describe('removePhoto', () => {
    const key = 'vienna/hbf-curb-99f6e5-11111111.webp';

    it('removes the row first, then both objects', async () => {
      fake.rpcReplies['admin_remove_photo'] = { data: { ...SPOT, photos: [] } };
      const spot = await repository.removePhoto(SPOT, key);
      expect(spot.photos).toEqual([]);
      expect(fake.rpcArgs.get('admin_remove_photo')).toEqual({
        p_spot_id: 'hbf-curb-99f6e5',
        p_key: key,
      });
      expect(fake.log).toEqual([
        'rpc admin_remove_photo',
        `remove full/${key} thumb/${key}`,
      ]);
    });

    it('only warns when the object delete fails', async () => {
      const warn = spyOn(console, 'warn');
      fake.rpcReplies['admin_remove_photo'] = { data: { ...SPOT, photos: [] } };
      fake.removeError = {
        name: 'StorageApiError',
        message: 'denied',
        status: 403,
      };
      expect((await repository.removePhoto(SPOT, key)).photos).toEqual([]);
      expect(warn).toHaveBeenCalled();
    });

    it('deletes no object when the RPC fails', async () => {
      fake.rpcReplies['admin_remove_photo'] = {
        error: { code: 'P0001', message: 'admin_remove_photo: no photo' },
        status: 400,
      };
      await expectAsync(repository.removePhoto(SPOT, key)).toBeRejectedWith(
        jasmine.objectContaining({ kind: 'invalid' }),
      );
      expect(fake.log).toEqual(['rpc admin_remove_photo']);
    });
  });

  describe('maps failures to typed errors', () => {
    const cases: [string, RpcReply, string][] = [
      [
        '42501 (admin only)',
        { error: { code: '42501', message: 'admin only' }, status: 403 },
        'forbidden',
      ],
      [
        'an expired session',
        { error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 },
        'forbidden',
      ],
      [
        '23505 (id taken)',
        {
          error: { code: '23505', message: 'spot id taken: a-1' },
          status: 409,
        },
        'conflict',
      ],
      [
        'P0001 (validation)',
        {
          error: { code: 'P0001', message: 'admin_get_spot: no spot a-1' },
          status: 400,
        },
        'invalid',
      ],
      [
        '22P02 (bad enum value)',
        {
          error: { code: '22P02', message: 'invalid input value' },
          status: 400,
        },
        'invalid',
      ],
      [
        'no response at all',
        {
          error: { code: '', message: 'TypeError: Failed to fetch' },
          status: 0,
        },
        'network',
      ],
      [
        'a server fault',
        { error: { code: 'XX000', message: 'internal error' }, status: 500 },
        'unknown',
      ],
    ];
    for (const [label, reply, kind] of cases) {
      it(`${label} → ${kind}`, async () => {
        fake.rpcReplies['admin_get_spot'] = reply;
        const error = await repository.getSpot('a-1').then(
          () => null,
          (e: unknown) => e,
        );
        expect(error).toEqual(jasmine.any(AdminRepositoryError));
        expect((error as AdminRepositoryError).kind).toBe(kind);
        expect((error as AdminRepositoryError).message).toContain(
          reply.error!.message,
        );
      });
    }

    it('a failed city query → its kind', async () => {
      fake.citiesReply = {
        error: { code: '42501', message: 'denied' },
        status: 403,
      };
      await expectAsync(repository.listCities()).toBeRejectedWith(
        jasmine.objectContaining({ kind: 'forbidden' }),
      );
    });

    it('a client that cannot be loaded → network', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: AdminSession,
            useValue: {
              client: () =>
                Promise.reject(
                  new TypeError('Failed to fetch dynamically imported module'),
                ),
            },
          },
        ],
      });
      await expectAsync(
        TestBed.inject(AdminRepository).listCities(),
      ).toBeRejectedWith(jasmine.objectContaining({ kind: 'network' }));
    });
  });
});
