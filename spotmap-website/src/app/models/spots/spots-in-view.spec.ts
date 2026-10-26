import { firstValueFrom } from 'rxjs';
import { SpotListCollection, SpotListFeature } from './spot';
import {
  compareSpotNames,
  LoadedSpotsInView,
  ViewBounds,
} from './spots-in-view';

/** A list-shape spot named `name` at `[lng, lat]`. */
function spot(
  id: string,
  name: string,
  lng: number,
  lat: number,
): SpotListFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: { id, name, status: 'active', cover: null, photoCount: 0 },
  };
}

/** The box around central Vienna the specs look at. */
const VIEW: ViewBounds = { west: 16.3, south: 48.1, east: 16.5, north: 48.3 };

describe('spots in view', () => {
  it('orders by name, ignoring case and accents, then by id so ties stay stable', () => {
    const spots = [
      spot('z', 'zebra', 0, 0),
      spot('c', 'Apfel', 0, 0),
      spot('a', 'äpfel', 0, 0),
      spot('m', 'Mitte', 0, 0),
    ];
    expect(
      [...spots].sort(compareSpotNames).map((s) => s.properties.id),
    ).toEqual(['a', 'c', 'm', 'z']);
  });

  it('answers only the spots inside the view, A–Z', async () => {
    const collection: SpotListCollection = {
      type: 'FeatureCollection',
      features: [
        spot('k', 'Karlsplatz', 16.37, 48.2),
        spot('far', 'Far Away', 17.1, 48.2),
        spot('b', 'Bahnhof', 16.38, 48.18),
      ],
    };
    const inView = new LoadedSpotsInView(collection);
    expect(
      (await firstValueFrom(inView.spotsIn(VIEW))).map((s) => s.properties.id),
    ).toEqual(['b', 'k']);
  });

  it('counts a spot on the edge of the view as inside it', async () => {
    const inView = new LoadedSpotsInView({
      type: 'FeatureCollection',
      features: [spot('edge', 'Edge', VIEW.west, VIEW.north)],
    });
    expect((await firstValueFrom(inView.spotsIn(VIEW))).length).toBe(1);
  });

  it('answers an empty list for a view with no spots in it', async () => {
    const inView = new LoadedSpotsInView({
      type: 'FeatureCollection',
      features: [spot('far', 'Far Away', 17.1, 48.2)],
    });
    expect(await firstValueFrom(inView.spotsIn(VIEW))).toEqual([]);
  });

  it('answers synchronously and leaves the collection’s own order alone', () => {
    const collection: SpotListCollection = {
      type: 'FeatureCollection',
      features: [
        spot('k', 'Karlsplatz', 16.37, 48.2),
        spot('b', 'Bahnhof', 16.38, 48.18),
      ],
    };
    let answered: readonly SpotListFeature[] | undefined;
    new LoadedSpotsInView(collection)
      .spotsIn(VIEW)
      .subscribe((spots) => (answered = spots));
    expect(answered?.map((s) => s.properties.id)).toEqual(['b', 'k']);
    expect(collection.features.map((s) => s.properties.id)).toEqual(['k', 'b']);
  });
});
