import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, UrlSegment } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  isMapPagePath,
  isSpotPath,
  matchMapPage,
  SPOT_ID_PARAM,
} from './map-page-path';

/** A stand-in for the map page that exposes its route, so a spec can read the spot id. */
@Component({ template: '' })
class StubMapPageComponent {
  readonly route = inject(ActivatedRoute);
}

/** The segments the router hands a matcher for `path`. */
function segments(...paths: string[]): UrlSegment[] {
  return paths.map((path) => new UrlSegment(path, {}));
}

describe('map page paths', () => {
  it('recognises a spot link, with or without a query or fragment', () => {
    for (const path of [
      '/spot/hbf-curb-99f6e5',
      '/spot/a?from=share',
      '/spot/a#top',
    ]) {
      expect(isSpotPath(path)).withContext(path).toBeTrue();
    }
  });

  it('does not take anything else for a spot link', () => {
    for (const path of [
      '/spot',
      '/spot/',
      '/spot/a/b',
      '/map',
      '/spots/a',
      '',
    ]) {
      expect(isSpotPath(path)).withContext(path).toBeFalse();
    }
  });

  it('counts /map and every spot link as the map page', () => {
    for (const path of ['/map', '/map?x=1', '/map#y', '/spot/a']) {
      expect(isMapPagePath(path)).withContext(path).toBeTrue();
    }
    for (const path of ['/home', '/about', '/admin', '/mapx', '/map/a', '/']) {
      expect(isMapPagePath(path)).withContext(path).toBeFalse();
    }
  });

  it('matches /map and /spot/<id>, handing the id over as a positional param', () => {
    const map = segments('map');
    expect(matchMapPage(map)).toEqual({ consumed: map });
    const spot = segments('spot', 'abc');
    const match = matchMapPage(spot);
    expect(match?.consumed).toEqual(spot);
    expect(match?.posParams?.[SPOT_ID_PARAM]?.path).toBe('abc');
  });

  it('matches nothing else', () => {
    for (const paths of [
      [],
      ['spot'],
      ['spot', 'a', 'b'],
      ['home'],
      ['map', 'a'],
    ]) {
      expect(matchMapPage(segments(...paths)))
        .withContext(paths.join('/'))
        .toBeNull();
    }
  });

  it('keeps one page instance between /map and /spot/<id>, so the map is never rebuilt', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { matcher: matchMapPage, component: StubMapPageComponent },
        ]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const onMap = await harness.navigateByUrl('/map', StubMapPageComponent);
    expect(onMap.route.snapshot.paramMap.get(SPOT_ID_PARAM)).toBeNull();

    const onSpot = await harness.navigateByUrl(
      '/spot/abc',
      StubMapPageComponent,
    );
    expect(onSpot).toBe(onMap);
    expect(onSpot.route.snapshot.paramMap.get(SPOT_ID_PARAM)).toBe('abc');

    const switched = await harness.navigateByUrl(
      '/spot/def',
      StubMapPageComponent,
    );
    expect(switched).toBe(onMap);
    expect(switched.route.snapshot.paramMap.get(SPOT_ID_PARAM)).toBe('def');

    const back = await harness.navigateByUrl('/map', StubMapPageComponent);
    expect(back).toBe(onMap);
    expect(back.route.snapshot.paramMap.get(SPOT_ID_PARAM)).toBeNull();
  });
});
