/**
 * Keeps the tool's city registry (data/spots/sources.json) in step with the app's own city list.
 *
 * sources.json duplicates each city's My Maps `mid` on purpose — Phase 4 deletes the app's
 * `mapLink` — so while both exist this test stops them drifting apart silently.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const sources = JSON.parse(read('../../data/spots/sources.json'));
const enumSource = read('../../src/app/models/enums/map-enum.ts');
const configSource = read('../../src/app/models/enums/config.ts');

const cityEnumBody = /export enum CityEnum \{([\s\S]*?)\n\}/.exec(
  enumSource,
)[1];
const cityByMember = Object.fromEntries(
  [...cityEnumBody.matchAll(/(\w+) = '([^']+)'/g)].map(([, member, value]) => [
    member,
    value,
  ]),
);
const midByCity = Object.fromEntries(
  [
    ...configSource.matchAll(/\[CityEnum\.(\w+)\]:\s*\{[\s\S]*?mid=([\w-]+)/g),
  ].map(([, member, mid]) => [cityByMember[member], mid]),
);

test('lists exactly the CityEnum cities, in declaration order', () => {
  assert.deepEqual(Object.keys(sources), Object.values(cityByMember));
});

test('every mid matches the mapLink in config.ts', () => {
  for (const [city, { mid }] of Object.entries(sources)) {
    assert.equal(mid, midByCity[city], city);
  }
});

test('every city names at least one own prefix', () => {
  for (const [city, { namePrefixes }] of Object.entries(sources)) {
    assert.ok(Array.isArray(namePrefixes) && namePrefixes.length > 0, city);
  }
});
