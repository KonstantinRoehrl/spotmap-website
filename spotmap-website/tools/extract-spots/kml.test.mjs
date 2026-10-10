/**
 * Tests for the KML parser against small fixtures shaped like the real My Maps exports.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseKml } from './kml.mjs';

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('collects placemarks from every folder in document order', () => {
  const names = parseKml(fixture('multi-folder.kml')).map(({ name }) => name);
  assert.deepEqual(names, ['Wien: Hbf Curb & Ledge', '1234', 'Wien: Gap']);
});

test('reads a single folder holding a single placemark as a list', () => {
  assert.deepEqual(parseKml(fixture('single-folder.kml')), [
    {
      ordinal: 0,
      name: 'Graz: Murinsel',
      styleUrl: '#icon-1899-0288D1-labelson',
      coordinates: [15.4342, 47.0739],
      mediaUrls: [
        'https://mymaps.usercontent.google.com/hostedimage/m/*/DDD?fife=s16383',
      ],
      folder: 'Graz',
    },
  ]);
});

test('keeps a digits-only name as a string', () => {
  assert.equal(parseKml(fixture('multi-folder.kml'))[1].name, '1234');
});

test('reads coordinates as [lng, lat] numbers, ignoring surrounding whitespace', () => {
  assert.deepEqual(
    parseKml(fixture('multi-folder.kml'))[0].coordinates,
    [16.3785491, 48.1840844],
  );
});

test('splits gx_media_links on whitespace and ignores other data fields', () => {
  const [first, , third] = parseKml(fixture('multi-folder.kml'));
  assert.deepEqual(first.mediaUrls, [
    'https://mymaps.usercontent.google.com/hostedimage/m/*/AAA?fife=s16383',
    'https://mymaps.usercontent.google.com/hostedimage/m/*/BBB?fife=s16383',
  ]);
  assert.deepEqual(third.mediaUrls, [
    'https://lh3.googleusercontent.com/umsh/CCC',
  ]);
});

test('gives a placemark without media links an empty list', () => {
  assert.deepEqual(parseKml(fixture('multi-folder.kml'))[1].mediaUrls, []);
});

test('throws on an HTML page answered in place of the KML', () => {
  assert.throws(
    () =>
      parseKml('<!DOCTYPE html><html><body>Before you continue</body></html>'),
    /^Error: not a KML document/,
  );
});

test('throws on a document without placemarks', () => {
  assert.throws(
    () => parseKml('<kml><Document><name>Empty</name></Document></kml>'),
    /KML document holds no placemarks/,
  );
});

test('throws on a placemark without a point, naming it', () => {
  const text =
    '<kml><Document><Placemark><name>Wien: Ghost</name></Placemark></Document></kml>';
  assert.throws(
    () => parseKml(text),
    /placemark "Wien: Ghost" has no Point coordinates/,
  );
});

const described = () => parseKml(fixture('descriptions.kml'));

test('numbers placemarks by their position in the parsed order', () => {
  assert.deepEqual(
    parseKml(fixture('multi-folder.kml')).map(({ ordinal }) => ordinal),
    [0, 1, 2],
  );
});

test('records the folder path, joined outermost first, and none at the document root', () => {
  assert.deepEqual(
    described().map(({ folder }) => folder),
    [undefined, 'Spots', 'Spots', 'Spots / Nested'],
  );
  assert.equal('folder' in described()[0], false);
});

test('reads a CDATA name as written', () => {
  assert.equal(described()[1].name, "Wien: Livio's 12er");
});

test('turns CDATA notes into plain text: images dropped, <br> as newlines, entities decoded, blank runs collapsed', () => {
  assert.equal(
    described()[1].description,
    'Police & guards\nRough <3 floor\n🛹 ä\n\nlast line',
  );
});

test('decodes plain-text notes exactly once and keeps a "<3" as typed', () => {
  assert.equal(described()[0].description, 'Fish &amp; chips <3');
});

test('decodes CDATA notes exactly once', () => {
  assert.equal(described()[3].description, 'double &amp; decoded once');
});

test('leaves the description out when nothing but images remains', () => {
  assert.equal('description' in described()[2], false);
});

test('keeps plain-text and CDATA runs of mixed notes in document order, each decoded once', () => {
  const text =
    '<kml><Document><Placemark><name>Wien: Mixed</name>' +
    '<description>Police &amp;amp; <![CDATA[often &amp; <br>]]> here <![CDATA[</b> &lt;3]]> end</description>' +
    '<Point><coordinates>16.1,48.1,0</coordinates></Point></Placemark></Document></kml>';
  assert.equal(
    parseKml(text)[0].description,
    'Police &amp; often &\n here </b> <3 end',
  );
});
