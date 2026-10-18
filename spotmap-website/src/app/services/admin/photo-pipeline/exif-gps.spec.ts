import { TestBed } from '@angular/core/testing';
import { GPS_READER, readGps, toLngLat } from './exif-gps';
import {
  FIXTURE_GPS,
  fixtureFile,
  ORIENTED_GPS_JPEG_BASE64,
  PLAIN_JPEG_BASE64,
} from './testing/photo-fixtures';

describe('readGps', () => {
  it('reads the EXIF GPS position of a JPEG as lng/lat', async () => {
    const position = await readGps(
      fixtureFile(ORIENTED_GPS_JPEG_BASE64, 'IMG_0001.JPG', 'image/jpeg'),
    );
    // `?? NaN` keeps a null result an assertion failure rather than a TypeError.
    expect(position?.lng ?? Number.NaN).toBeCloseTo(FIXTURE_GPS.lng, 6);
    expect(position?.lat ?? Number.NaN).toBeCloseTo(FIXTURE_GPS.lat, 6);
  });

  it('returns null for a photo without GPS', async () => {
    expect(
      await readGps(fixtureFile(PLAIN_JPEG_BASE64, 'plain.jpg', 'image/jpeg')),
    ).toBeNull();
  });

  it('returns null for a file exifr cannot read', async () => {
    expect(
      await readGps(new Blob(['hello'], { type: 'text/plain' })),
    ).toBeNull();
  });

  it('is the default GPS_READER', () => {
    expect(TestBed.inject(GPS_READER)).toBe(readGps);
  });
});

describe('toLngLat', () => {
  it('maps exifr latitude/longitude to lng/lat', () => {
    expect(toLngLat({ latitude: 48.2082, longitude: 16.3738 })).toEqual({
      lng: 16.3738,
      lat: 48.2082,
    });
  });

  it('keeps a real position on the equator or the prime meridian', () => {
    expect(toLngLat({ latitude: 0, longitude: 16.3738 })).toEqual({
      lng: 16.3738,
      lat: 0,
    });
    expect(toLngLat({ latitude: 51.4779, longitude: 0 })).toEqual({
      lng: 0,
      lat: 51.4779,
    });
  });

  it('treats a missing block, 0/0 and impossible values as no guess', () => {
    expect(toLngLat(undefined)).toBeNull();
    expect(toLngLat({ latitude: 0, longitude: 0 })).toBeNull();
    expect(toLngLat({ latitude: 90.5, longitude: 16 })).toBeNull();
    expect(toLngLat({ latitude: 48, longitude: -180.5 })).toBeNull();
    expect(toLngLat({ latitude: Number.NaN, longitude: 16 })).toBeNull();
  });
});
