import { TestBed } from '@angular/core/testing';
import { PHOTO_RENDITIONS, SpotPhotos } from './spot-photos.service';
import { SPOTMAP_BACKEND, UNCONFIGURED_BACKEND } from './spotmap-backend';

const BASE = 'https://ref.supabase.co/storage/v1/object/public/spot-photos';
const KEY = 'vienna/hbf-curb-99f6e5-9f98eefd.webp';

describe('SpotPhotos', () => {
  function photos(photoBaseUrl: string): SpotPhotos {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SPOTMAP_BACKEND,
          useValue: { ...UNCONFIGURED_BACKEND, photoBaseUrl },
        },
      ],
    });
    return TestBed.inject(SpotPhotos);
  }

  it('lists the renditions full first, the order uploads and deletes run in', () => {
    expect(PHOTO_RENDITIONS).toEqual(['full', 'thumb']);
  });

  it('builds a thumbnail and a full-size URL from a photo key', () => {
    const service = photos(BASE);
    expect(service.thumb(KEY)).toBe(`${BASE}/thumb/${KEY}`);
    expect(service.full(KEY)).toBe(`${BASE}/full/${KEY}`);
  });

  it('is enabled by a photo host and disabled without one', () => {
    expect(photos(BASE).enabled).toBeTrue();
    TestBed.resetTestingModule();
    expect(photos('').enabled).toBeFalse();
  });

  it('answers the cover thumbnail of a spot that has one', () => {
    expect(photos(BASE).coverThumb({ cover: KEY })).toBe(
      `${BASE}/thumb/${KEY}`,
    );
  });

  it('answers no cover thumbnail without a spot or a cover', () => {
    const service = photos(BASE);
    expect(service.coverThumb(null)).toBeNull();
    expect(service.coverThumb(undefined)).toBeNull();
    expect(service.coverThumb({ cover: null })).toBeNull();
    expect(service.coverThumb({ cover: '' })).toBeNull();
  });

  it('answers no cover thumbnail without a photo host', () => {
    expect(photos('').coverThumb({ cover: KEY })).toBeNull();
  });

  it('keeps thumbs and fulls parallel to the keys', () => {
    expect(photos(BASE).set(['b.webp', 'a.webp'])).toEqual({
      thumbs: [`${BASE}/thumb/b.webp`, `${BASE}/thumb/a.webp`],
      fulls: [`${BASE}/full/b.webp`, `${BASE}/full/a.webp`],
    });
  });

  it('answers empty sets without a photo host', () => {
    expect(photos('').set([KEY])).toEqual({ thumbs: [], fulls: [] });
  });
});
