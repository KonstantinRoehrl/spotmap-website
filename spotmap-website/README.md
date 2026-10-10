# Spotmap

A skate-spot map for Vienna (and other cities), styled as a green-phosphor CRT
terminal — "The Phosphor Archive". It's an Angular single-page app; the map
itself is an embedded Google My Maps iframe, framed in a dark, glowing terminal
shell so a blank embed never flashes white.

## Tech stack

- **Angular 22** — standalone components, signals (`input()`/`output()`/`signal()`/`computed()`), OnPush change detection, `@for`/`@if` control flow.
- **Angular Material 22** — a custom M3 "green terminal" theme (`src/theme.scss`) via `--mat-sys-*` system tokens.
- **Tailwind CSS v4** — CSS-first `@theme` design tokens in `src/styles.css`.
- **IBM Plex Mono** — self-hosted (`src/fonts/`, emitted hashed under `media/`); the whole UI is one monospace character grid.
- **Karma + Jasmine** — unit tests.
- **TypeScript 6**, **Zone.js** (change detection is OnPush, Zone retained).

## Getting started

Requires **Node ≥ 26** (`engines` in `package.json`, `.nvmrc`); the spot extraction
tool depends on it.

```bash
npm ci            # install exact dependencies
npm start         # dev server at http://localhost:4200
npm run build     # production build → dist/
npm test          # unit tests (Karma/Jasmine, headless-capable)
```

## Project structure

```
src/
  app/
    modules/
      components/   # nav-bar, map-container, loading-bar, ascii-animation-text
      pages/        # home, map, about (routed)
      directives/   # glitch-text (per-character scramble)
    models/enums/   # city / country / config data (SUPPORTED_CITIES)
    app.routes.ts   # home · map · about · '' → home · ** → home
  styles.css        # Tailwind + @theme design tokens (OKLCH colors, glow, motion, radius)
  theme.scss        # Angular Material M3 green-terminal theme
  fonts/            # self-hosted IBM Plex Mono (woff2) — under src/, not public/,
                    # so the bundler emits them hashed and rewrites the url()
                    # relative; a root-absolute /fonts/... 404s under the deploy
                    # prefix (tools/verify-css-asset-urls.mjs guards it)
  index.html
tools/
  extract-spots/    # npm run extract:spots — My Maps KML → data/spots/ (see below)
  verify-*.mjs      # build:pages runs the dist guards; verify:dev-map-worker is manual
data/
  spots/            # extracted per-city datasets (GeoJSON + run reports)
```

## Spot data extraction

`npm run extract:spots` pulls the Google My Maps KML exports of all 19 cities,
turns their placemarks into the app's `SpotCollection` GeoJSON
(`src/app/models/spots/spot.ts`), and re-encodes every reachable photo to WebP
(long edge 1400px, quality 72).

```bash
npm run extract:spots                       # all 19 cities
npm run extract:spots -- vienna split       # only these cities
npm run extract:spots -- vienna --reencode  # download and encode existing photos again
```

The tool lives in `tools/extract-spots/` and writes to `data/`. The live map
still reads `public/spots/`; promoting a dataset there is a separate step.

| Path                               | Committed | Contents                                                                       |
| ---------------------------------- | --------- | ------------------------------------------------------------------------------ |
| `data/spots/sources.json`          | yes       | the map registry: every My Maps map by slug, and each city's maps and prefixes |
| `data/spots/<city>.geojson`        | yes       | the city's spots; photo paths are base-relative (`spots/<city>/…`)             |
| `data/spots/<city>.report.json`    | yes       | counts, dead, recovered and repeated photos, match issues and warnings         |
| `data/spots/<map>.map-report.json` | yes       | the placemarks of a shared or extra map that no city or several cities claim   |
| `data/spots/<city>/*.webp`         | no        | the encoded photos                                                             |
| `data/.cache/kml/<map>.kml`        | no        | the raw KML of each map's last fetch that parsed                               |

Photos are not committed: all cities together come to well over a thousand
images, too heavy for git, and they get a real host later.

### The map registry

`data/spots/sources.json` names every My Maps map once, under a slug (`maps`:
slug → map id), and gives each city (`cities`) its main map (`map`), the name
prefixes its spots carry (`namePrefixes`), and optionally the maps it only takes
photos from (`extraMaps`) and whether to keep only its own-prefixed placemarks
of a map it shares (`onlyPrefixed`). An excerpt:

```json
{
  "maps": {
    "vienna": "13c9hk1PqIRE5jgjTAr1pf4sP_9GNiIg",
    "split": "1dgfVkXz-ruy1aoQePV7j2lhv5QzEfFw",
    "balkan": "1IDO4AGmCsN_D-zcXPjpU1eXqwQYTh1A"
  },
  "cities": {
    "split": {
      "map": "split",
      "namePrefixes": ["Split"],
      "extraMaps": ["balkan"]
    },
    "zadar": { "map": "balkan", "namePrefixes": ["Zadar"], "onlyPrefixed": true }
  }
}
```

Sixteen cities have a map of their own. Zadar, Vodice and Šibenik (`sibenik`)
come from the Spotmap Balkan map (`balkan`), each keeping only the placemarks
named with its own prefix (`Zadar:`, `Vodice:`, `Sibenik:` — Balkan spells the
town without the háček). Split, Zagreb, Rijeka, Belgrade and Sarajevo use Balkan
as an extra map. Each map is fetched and parsed once per run, however many
cities use it; a map that fails fails every city that uses it, naming the map.

`tools/extract-spots/sources.test.mjs` keeps the registry honest:

- `cities` lists exactly the `CityEnum` cities, in declaration order;
- each city's main-map id equals the `mid=` of its `mapLink` in `config.ts`;
- every map a city names (`map` and `extraMaps`) is registered in `maps`;
- no city lists its own main map as an extra map;
- every registered map is used by some city;
- every city names at least one prefix.

### Extra maps

A city's spots always come from its main map, which stays authoritative for
their position, name and status. An extra map only adds photos and a source
record to the spots its placemarks match; it never adds, moves or renames a
spot, so spot ids do not change. Each placemark of an extra map is matched by
name first (cleaned with the city's prefixes), then by position:

- a single spot with that name within 100 m is a match;
- a single spot with that name more than 100 m away is a conflict, merged only
  when the placemark carries the city's own prefix;
- of several spots with that name, the only one within 25 m is a match;
- with no spot of that name, the only spot within 25 m is a match;
- several candidates and no single one within 25 m make the placemark
  ambiguous;
- a placemark with the city's own prefix that matches nothing is unmatched; one
  without it belongs to another city and is skipped.

Conflicts, ambiguous and unmatched placemarks are reported under `matches`,
never resolved or added as spots, and do not fail the city. A spot matched by
several placemarks keeps them all, with a warning.

Each spot's GeoJSON `properties.sources` holds one record per map that holds
it, its main map first: `map` (the slug, never an id or URL), `folder` (the
folder path, names joined by `" / "`) and `description` (the notes) where the
placemark has them, and for an extra map's record its `position` and — only
where they differ from the spot's — its `name` and `status`. Notes are turned
into plain text: images are dropped (they repeat the photo links), `<br>`
becomes a newline, and entities are decoded exactly once. Before a city's
GeoJSON is written, every property is checked for URLs; one found fails the
city, naming the spot and the field.

### Photos

Google changes every photo URL on each export, so the tool recognises a photo by
a fingerprint of its tiny 32px rendition and names the file after it. A re-run
fetches that rendition for every photo (a few KB each) and downloads only photos
that are new or changed; with unchanged maps it downloads no originals and the
committed files stay identical.

A photo is identified by its spot, its map and its number among that spot's
photos on that map, so photos added from an extra map never renumber the main
map's. Per spot, in order:

- a photo whose file equals one already kept is an exact duplicate
  (`photosDuplicate`);
- an extra-map photo within 10 of 256 bits (16×16 average hash) of a kept photo
  of another map is a near-duplicate (`photosNearDuplicate`); the earlier copy,
  so the main map's, wins and the file stays on disk;
- a dead main-map photo counts as recovered (`photosRecovered`) when the spot
  kept an extra-map photo, at most one per kept extra-map photo.

Duplicates and near-duplicates are left out of the GeoJSON. Some photo links
(`lh3.googleusercontent.com/umsh/…` — every photo of Split and Prague) answer
404, even for the map's owner, and My Maps itself shows them as broken images.
Those photos are lost at the source: the tool skips them and lists them under
`photosDead`, unless they were recovered.

### Reports

Besides counts and warnings, a city's report holds:

- `map` and `mid`: its main map;
- `photosDead`, `photosRecovered`, `photosDuplicate`, `photosNearDuplicate`:
  each entry names the spot, the map and the photo's number on it;
- `extraMaps`: per extra map, its id, placemark count and number of matches;
- `matches`: the `conflicts`, `ambiguous` and `unmatched` placemarks of every
  extra map, each with its map, ordinal, raw name, position, folder, notes and
  photo-link count;
- `linkCounts`: per map, how many photo links each spot had.

`data/spots/<map>.map-report.json` is written for every map that several cities
share or a city uses as an extra map. It lists the placemarks no city claims
and those several cities claim, so a placemark a new town or a typo leaves
behind is never dropped silently. Only a run that names no city and in which
every city succeeds writes it.

Each city prints one line: spots, photos written of linked, downloads and dead
links, followed by the counts of `recovered`, `duplicate` and `near-duplicate`
photos and of `match issues` (conflicts, ambiguous and unmatched placemarks)
where any are non-zero.

### When a city fails

A city that fails keeps its previous files; the run carries on and exits
non-zero, naming each failed city. A city also fails, so a wrong error from
Google or a moved placemark cannot wipe good photos, when compared with its
previous run:

- **a photo is newly dead**: one the previous run downloaded now comes back
  dead, recovered or not;
- **a match is lost**: a spot an extra map fed photos last run is now named by
  an ambiguous placemark or an unmerged conflict of that map.

A spot whose GeoJSON still lists every photo file it listed before lost nothing
and is excused from both. A dead link that is new or was already dead last run
is only reported. A newly dead photo fails the city until a re-run downloads it
again or the link is removed in My Maps. A first run has nothing to compare. A
previous report from before extra maps (without `linkCounts`) is still read:
only main-map photos are checked, against the spot's written, dead and duplicate
photos of that run. A previous GeoJSON or report that cannot be read as expected
fails the city, naming the file, instead of quietly weakening the check.

## Design system

The visual North Star and its rules — two-phosphor palette (green voice + amber
for care/selection), the No-White rule, glow-as-depth (no drop-shadows),
monospace everything, and sharp 0–4px corners — live in `PRODUCT.md` and
`DESIGN.md` at the repository root.

## Deployment

Pushing to `main` triggers the GitHub Actions workflow
(`.github/workflows/deploy-angular.yml`), which builds and deploys the app.
Because a push to `main` deploys automatically, treat `main` as production.
