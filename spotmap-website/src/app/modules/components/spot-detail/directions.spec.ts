import { directionsUrl } from './directions';

describe('directionsUrl', () => {
  it('asks Google Maps for a route to the spot’s coordinates, latitude first', () => {
    expect(directionsUrl([16.3785491, 48.1840844])).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=48.1840844%2C16.3785491',
    );
  });
});
