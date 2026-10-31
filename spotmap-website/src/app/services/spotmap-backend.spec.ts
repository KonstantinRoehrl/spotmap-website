import { TestBed } from '@angular/core/testing';
import { environment as development } from '../../environments/environment';
import { environment as production } from '../../environments/environment.prod';
import {
  PHOTO_BUCKET_PATH,
  SPOTMAP_BACKEND,
  SpotmapBackend,
  UNCONFIGURED_BACKEND,
} from './spotmap-backend';

describe('spotmap backend config', () => {
  it('is unconfigured wherever nothing provides it, so specs keep the snapshot-only path', () => {
    expect(UNCONFIGURED_BACKEND).toEqual({
      apiUrl: '',
      publishableKey: '',
      photoBaseUrl: '',
    });
    expect(TestBed.inject(SPOTMAP_BACKEND)).toBe(UNCONFIGURED_BACKEND);
  });

  for (const [name, { backend }] of [
    ['development', development],
    ['production', production],
  ] as [string, { backend: SpotmapBackend }][]) {
    it(`derives the ${name} photo base from its API URL, or leaves both empty`, () => {
      expect(backend.photoBaseUrl).toBe(
        backend.apiUrl ? `${backend.apiUrl}${PHOTO_BUCKET_PATH}` : '',
      );
      expect(backend.apiUrl === '').toBe(backend.publishableKey === '');
    });
  }

  it('points development at the local Supabase stack', () => {
    expect(development.backend.apiUrl).toBe('http://127.0.0.1:54321');
    expect(development.backend.publishableKey).toMatch(/^sb_publishable_/);
  });
});
