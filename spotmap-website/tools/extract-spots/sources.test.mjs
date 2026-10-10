/**
 * Keeps the tool's map registry (data/spots/sources.json) in step with the app's own city list.
 *
 * The registry names each My Maps map once, under a slug, and each city by the slug of its main
 * map (plus any extra maps it draws photos from). It duplicates each city's main-map `mid` on
 * purpose — Phase 4 deletes the app's `mapLink` — so while both exist this test stops them
 * drifting apart silently.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const { maps, cities } = JSON.parse(read('../../data/spots/sources.json'));
const enumSource = read('../../src/app/models/enums/map-enum.ts');
const configSource = inlineMapLinkConstants(
  read('../../src/app/models/enums/config.ts'),
);

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

/**
 * Replaces each `mapLink: SOME_CONSTANT` in config.ts with the constant's string literal, so every
 * city entry carries its own `mid=` and the lazy entry match cannot run on into the next entry.
 *
 * @param {string} source the text of config.ts
 * @returns {string} the text with every constant `mapLink` inlined
 * @throws {Error} naming a `mapLink` constant that config.ts does not declare as a string literal
 */
function inlineMapLinkConstants(source) {
  const constants = new Map(
    [...source.matchAll(/const (\w+) =\s*'([^']*)'/g)].map(
      ([, name, value]) => [name, value],
    ),
  );
  return source.replace(/mapLink:\s*([A-Za-z_]\w*)\s*,/g, (_, name) => {
    if (!constants.has(name)) {
      throw new Error(`config.ts: mapLink constant ${name} is not declared`);
    }
    return `mapLink: '${constants.get(name)}',`;
  });
}

test('lists exactly the CityEnum cities, in declaration order', () => {
  assert.deepEqual(Object.keys(cities ?? {}), Object.values(cityByMember));
});

test("every city's main-map mid matches the mapLink in config.ts", () => {
  for (const [city, { map }] of Object.entries(cities ?? {})) {
    assert.equal(maps[map], midByCity[city], city);
  }
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
