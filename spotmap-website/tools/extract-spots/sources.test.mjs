/**
 * Keeps the tool's map registry (data/spots/sources.json) in step with the app's own city list.
 *
 * The registry names each My Maps map once, under a slug, and each city by the slug of its main
 * map (plus any extra maps it draws photos from). It is the only place that holds a map's `mid`:
 * the extraction reads each map's KML export by it, and the app no longer links to My Maps.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const { maps, cities } = JSON.parse(read('../../data/spots/sources.json'));
const enumSource = read('../../src/app/models/enums/map-enum.ts');

const cityEnumBody = /export enum CityEnum \{([\s\S]*?)\n\}/.exec(
  enumSource,
)[1];
const cityByMember = Object.fromEntries(
  [...cityEnumBody.matchAll(/(\w+) = '([^']+)'/g)].map(([, member, value]) => [
    member,
    value,
  ]),
);

test('lists exactly the CityEnum cities, in declaration order', () => {
  assert.deepEqual(Object.keys(cities ?? {}), Object.values(cityByMember));
});

test('every map a city names is registered', () => {
  for (const [city, { map, extraMaps = [] }] of Object.entries(cities ?? {})) {
    for (const slug of [map, ...extraMaps]) {
      assert.ok(Object.hasOwn(maps ?? {}, slug), `${city}: ${slug}`);
    }
  }
});

test('no city lists its own main map as an extra map', () => {
  for (const [city, { map, extraMaps = [] }] of Object.entries(cities ?? {})) {
    assert.equal(extraMaps.includes(map), false, city);
  }
});

test('every registered map is used by some city', () => {
  const used = new Set(
    Object.values(cities ?? {}).flatMap(({ map, extraMaps = [] }) => [
      map,
      ...extraMaps,
    ]),
  );
  assert.deepEqual(
    Object.keys(maps ?? {}).filter((slug) => !used.has(slug)),
    [],
  );
});

test('every city names at least one own prefix', () => {
  for (const [city, { namePrefixes }] of Object.entries(cities ?? {})) {
    assert.ok(Array.isArray(namePrefixes) && namePrefixes.length > 0, city);
  }
});
