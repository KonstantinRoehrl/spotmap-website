# Spotmap

A skate-spot compendium for European cities, styled as a green-phosphor CRT
terminal — "The Phosphor Archive". It's an Angular single-page app; every city's
map is drawn by the site itself with MapLibre, from per-city spot data served by
a Supabase project (with a bundled GeoJSON snapshot as fallback), framed in a
dark, glowing terminal shell so a slow map never flashes white.

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
  environments/     # the backend each build talks to (environment.prod.ts in production)
  styles.css        # Tailwind + @theme design tokens (OKLCH colors, glow, motion, radius)
  theme.scss        # Angular Material M3 green-terminal theme
  fonts/            # self-hosted IBM Plex Mono (woff2) — under src/, not public/,
                    # so the bundler emits them hashed and rewrites the url()
                    # relative; a root-absolute /fonts/... 404s under the deploy
                    # prefix (tools/verify-css-asset-urls.mjs guards it)
  index.html
tools/
  extract-spots/    # npm run extract:spots / promote:spots — My Maps KML → data/spots/ → public/spots/ (see below)
  sync-supabase/    # npm run sync:supabase / parity:supabase — data/spots/ → Supabase (see below)
  verify-*.mjs      # build:pages runs the dist guards; verify:dev-map-worker is manual
data/
  spots/            # extracted per-city datasets (GeoJSON + run reports)
  thumbs/           # derived 640px thumbnails (local, not committed)
supabase/           # Supabase CLI project: config.toml, the migration, pgTAP tests
```

## Spot data extraction

`npm run extract:spots` pulls the Google My Maps KML exports of all cities,
turns their placemarks into the app's `SpotCollection` GeoJSON
(`src/app/models/spots/spot.ts`), and re-encodes every reachable photo to WebP
(long edge 1400px, quality 72).

```bash
npm run extract:spots                       # all cities
npm run extract:spots -- vienna split       # only these cities
npm run extract:spots -- vienna --reencode  # download and encode existing photos again
```

The tool lives in `tools/extract-spots/` and writes to `data/`. Each city it
writes successfully is then **promoted**: `public/spots/<city>.geojson`, the file
the app loads, is rewritten as a trimmed copy of the data file. Each spot keeps
its geometry and its served record (`tools/extract-spots/served-record.mjs`):
`id`, `name`, `status`, `notes` — the first non-empty description across its
maps, verbatim, or `null` — and `photos` as object keys `<city>/<file>.webp`
under the photo host. Source records and folders stay in `data/` only. The
Supabase sync writes the same record, so the snapshot is exactly what the app
falls back to.

```bash
npm run promote:spots                 # re-promote every city, offline
npm run promote:spots -- vienna graz  # only these cities
```

`promote:spots` never touches the network. An unknown city exits 2; a city whose
data file cannot be read is named, the others are still promoted, and the run
exits 1. `tools/extract-spots/promote.test.mjs` (part of `npm run test:tools`, so
CI and `build:pages` run it) fails when a `public/spots/<city>.geojson` differs
from what promoting its data file would write, or when `public/spots/` holds
anything other than one `<city>.geojson` per city.

| Path                               | Committed | Contents                                                                       |
| ---------------------------------- | --------- | ------------------------------------------------------------------------------ |
| `data/spots/sources.json`          | yes       | the map registry: every My Maps map by slug, and each city's maps and prefixes |
| `data/spots/<city>.geojson`        | yes       | the city's spots; photo paths are base-relative (`spots/<city>/…`)             |
| `data/spots/<city>.report.json`    | yes       | counts, dead, recovered and repeated photos, match issues and warnings         |
| `data/spots/<map>.map-report.json` | yes       | the placemarks of a shared or extra map that no city or several cities claim   |
| `public/spots/<city>.geojson`      | yes       | the promoted copy the app serves as fallback: served records, no sources       |
| `data/spots/<city>/*.webp`         | no        | the encoded photos                                                             |
| `data/thumbs/<city>/*.webp`        | no        | the sync's 640px thumbnails of the encoded photos                              |
| `data/.cache/kml/<map>.kml`        | no        | the raw KML of each map's last fetch that parsed                               |

Photos are not committed: all cities together come to well over a thousand
images, too heavy for git. They are hosted in Supabase Storage — see "Spot data
backend" below.

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

Zadar, Vodice and Šibenik (`sibenik`) come from the Spotmap Balkan map
(`balkan`), each keeping only the placemarks named with its own prefix
(`Zadar:`, `Vodice:`, `Sibenik:` — Balkan spells the town without the háček);
every other city has a map of its own. Split, Zagreb, Rijeka, Belgrade and
Sarajevo use Balkan as an extra map. Each map is fetched and parsed once per
run, however many cities use it; a map that fails fails every city that uses it,
naming the map.

`tools/extract-spots/sources.test.mjs` keeps the registry honest:

- `cities` lists exactly the `CityEnum` cities, in declaration order;
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
  each entry names the spot (`spotId`), the map (`map`) and the photo's number
  on it (`n`). A dead or recovered entry adds why the link is dead (`reason`,
  e.g. `http 404`), and a recovered one the extra maps whose photos the spot
  kept (`from`). A duplicate or near-duplicate entry adds the kept photo it
  repeats (`sameAs`: its map and number), and a near-duplicate its hash
  distance from it (`distance`, in bits);
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
non-zero, naming each failed city. The one exception is a failed promotion. It
comes after the data file and report are written, so that city has its new data
and report, a stale `public/spots/<city>.geojson` and no photo deleted. The drift
test flags the stale copy until `npm run promote:spots -- <city>` rewrites it. A
city also fails, so a wrong error from Google or a moved placemark cannot wipe
good photos, when compared with its previous run:

- **a photo is newly dead**: one the previous run downloaded now comes back
  dead, recovered or not;
- **a match is lost**: a spot an extra map fed photos last run is now named by
  an ambiguous placemark or an unmerged conflict of that map, or matches no
  placemark of that map while the map has an unmatched placemark this run (the
  feeding placemark may have been renamed and moved). With nothing of that map
  unmatched, a spot that lost its match had its placemark deleted, a legitimate
  removal that does not fail the city.

A spot whose GeoJSON still lists every photo file it listed before lost nothing
and is excused from both, as is a spot that left the main map. A dead link that
is new or was already dead last run is only reported. When a spot has fewer
links on a map than last run, removed links may have renumbered its later
photos, so a dead photo also counts as already dead when the previous run listed
one of that spot and map up to that many numbers above it, each previous entry
standing for one photo only. Removing one link and adding another in the same
edit nets no shift, so an already-dead photo after them is reported as newly
dead. A newly dead photo fails the city until a re-run downloads it again or
the link is removed in My Maps. A first run has nothing to compare. A previous
report from before extra maps (without `linkCounts`) is still read: only
main-map photos are checked, against the spot's written, dead and duplicate
photos of that run. A previous GeoJSON or report that cannot be read as
expected fails the city, naming the file, instead of quietly weakening the
check.

## Spot data backend (Supabase)

The map reads each city's spots live from a Supabase project — Postgres with
PostGIS, row-level security and Storage — and falls back to the bundled
`public/spots/<city>.geojson` when the backend errors, takes longer than 5 s,
answers with no spots, or is not configured (`SpotsService`). Photos are served
from the public `spot-photos` bucket as `full/<city>/<file>.webp` (the 1400px
encode) and `thumb/<city>/<file>.webp` (640px, what the popup shows); with no
photo host configured, popups show no gallery.

Each build's backend is set in `src/environments/`. The production one,
`environment.prod.ts`, stays empty until the hosted project is set up (see
[Rollout to the hosted project](#rollout-to-the-hosted-project)); until then
the deployed site serves the snapshot and shows no photos.

Until the maintainer tool replaces it, Google My Maps stays the editing surface
(roadmap Decision 1), so the database is a **mirror** of `data/spots/`:

1. edit My Maps → `npm run extract:spots`
2. commit the datasets and snapshots
3. `npm run sync:supabase -- --hosted`

### Access

The public (the publishable key the site ships in its bundle) can read the
`cities`, `spots` and `spot_photos` tables and call `city_spots(city)`, and
nothing else: no table, function or bucket write. Only the **secret key**
(`sb_secret_…`, which bypasses row-level security) writes, through
`sync_spots(payload)` and Storage uploads. It lives in
`spotmap-website/.env.local` (gitignored; template `.env.example`) and is sent
in the `apikey` header only.

### Local stack

Needs Docker.

```bash
npm run db:start   # db, REST API, Storage on http://127.0.0.1:54321 (applies the migrations)
npm run db:test    # pgTAP: access rules, city_spots, sync_spots
npm run db:reset   # re-apply the migrations from scratch
npm run db:stop
```

`ng serve` talks to this stack (`src/environments/environment.ts`); with the
stack down the map simply serves the snapshot.

### The sync

```bash
npm run sync:supabase                 # local stack
npm run sync:supabase -- --dry-run    # plan every step, write nothing
npm run sync:supabase -- --db-only    # database only, from the committed datasets (no photos needed)
npm run sync:supabase -- --hosted     # required whenever SUPABASE_URL is not the local stack
npm run parity:supabase               # every city's live answer must equal its snapshot
```

`sync:supabase` and `parity:supabase` both read `SUPABASE_URL` and
`SUPABASE_SECRET_KEY` from `.env.local` or the environment (the environment
wins), so they target whichever project those two name: the local stack by
default, the hosted project once `.env.local` points at it.

It prints the target first, then runs each step only after the previous one
succeeded: load and check every referenced photo is on disk → derive missing or
outdated thumbnails into `data/thumbs/` and delete orphaned ones → upload every
object the bucket lacks or holds with other bytes (compared by MD5, since a file
name fingerprints Google's rendition, not the served bytes) → mirror the
database in one `sync_spots()` transaction → delete bucket objects nothing
references any more, only after the database sync succeeded. A re-run with
unchanged data reports zero everywhere. Exit codes: 0 done, 1 a step failed
(named), 2 bad arguments or environment. CI runs the pgTAP tests, a `--db-only`
sync and the parity check on every pull request.

### Rollout to the hosted project

`main` deploys to GitHub Pages, so the hosted project is set up and verified
before the branch that turns the backend on is merged:

1. Create the Supabase project (EU region, free tier).
2. Apply the migrations to it:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

3. Fill `src/environments/environment.prod.ts`: `apiUrl` and `publishableKey`
   from the project's API settings, and `photoBaseUrl` as
   `<apiUrl>/storage/v1/object/public/spot-photos`. The key line keeps a
   trailing `// gitleaks:allow`, since the secret scan flags any committed key.
4. Put `SUPABASE_URL` (the same `apiUrl`) and `SUPABASE_SECRET_KEY` into
   `.env.local`. It is never committed.
5. Fill the project, then check it:

   ```bash
   npm run sync:supabase -- --hosted
   npm run parity:supabase
   ```

6. Merge to `main` only after the parity check passes. Without the rollout the
   site still degrades safely (snapshot pins, no photos), but it is not the
   photo release.

## Design system

The visual North Star and its rules — two-phosphor palette (green voice + amber
for care/selection), the No-White rule, glow-as-depth (no drop-shadows),
monospace everything, and sharp 0–4px corners — live in `PRODUCT.md` and
`DESIGN.md` at the repository root.

## Deployment

Pushing to `main` triggers the GitHub Actions workflow
(`.github/workflows/deploy-angular.yml`), which builds and deploys the app.
Because a push to `main` deploys automatically, treat `main` as production.
