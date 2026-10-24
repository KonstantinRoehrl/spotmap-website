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
- **Karma + Jasmine** — unit tests, run through `@angular/build:karma`, which bundles the specs with esbuild.
- **TypeScript 6**, **Zone.js** (change detection is OnPush, Zone retained).

### Dependency overrides

`package.json` pins `vite` to `8.3.5` under `overrides`. `@angular/build` 22.2 requires exactly
`vite` 8.3.0, which has known dev-server security advisories, and the override replaces that copy so
`npm audit` stays clean. Vite only runs the local dev server; it is not part of the deployed site.
**Remove the override once `@angular/build`'s own `vite` dependency is 8.3.3 or later** — check with
`npm view @angular/build@<version> dependencies.vite` when upgrading Angular. The pin is exact, so it
never moves on its own, and Dependabot will not retire it for you.

## Getting started

Requires **Node ≥ 26** (`engines` in `package.json`, `.nvmrc`); the spot extraction
tool depends on it.

```bash
npm ci            # install exact dependencies
npm start         # dev server at http://localhost:4200
npm run build     # production build → dist/
npm test          # unit tests (Karma/Jasmine, headless-capable)
```

### Scripts

| Command                            | What it does                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run watch`                    | development build that rebuilds on every change                                                                                                                                   |
| `npm run format`                   | rewrites `src/` (`.ts`, `.html`, `.css`, `.scss`) with Prettier                                                                                                                   |
| `npm run format:check`             | the same files, check only — a required CI check                                                                                                                                  |
| `npm run build:pages`              | what CI and the deploy run: `npm run test:tools`, the production build into `../dist/spotmap-website` with the `/spotmap-website/` base href, then the three dist verifiers below |
| `npm run test:tools`               | the Node test suite for `tools/` (`tools/**/*.test.mjs`)                                                                                                                          |
| `npm run verify:map-worker-assets` | dist guard: MapLibre's web-worker module is in the browser output, so the map's worker request does not 404                                                                       |
| `npm run verify:css-asset-urls`    | dist guard: no root-absolute `url()` in the emitted CSS (it would 404 under the deploy prefix), and every relative one resolves to an emitted file                                |
| `npm run verify:initial-bundle`    | dist guard: no library only the maintainer tool needs ships in the initial bundle                                                                                                 |
| `npm run verify:dev-map-worker`    | manual check: starts `ng serve` on port 4271 (or the port given after `--`) and confirms the dev server serves the map worker                                                     |

`npm run extract:spots`, the `db:*` scripts and `sync:supabase` / `snapshot:supabase`
are covered in their own sections below.

## Project structure

```
src/
  app/
    modules/
      components/   # nav-bar, map-container, map-loader, spot-map, spot-popup,
                    # spot-photo-gallery, ascii-rain, ascii-animation-text
      components/admin/  # satellite-picker (the maintainer tool's satellite pin picker)
      pages/        # home, map, about (routed)
      pages/admin/  # the maintainer tool: shell, sign-in, create-or-attach, spot list, spot edit (lazy)
      directives/   # glitch-text (per-character scramble),
                    # pointer-bloom (centres the shared hover bloom on the pointer)
    models/         # admin/, enums/ (city / country / config data, SUPPORTED_CITIES), spots/
    services/       # spots.service.ts (live spots with snapshot fallback),
                    # spotmap-backend.ts (the backend the app talks to);
                    # admin/ (the maintainer tool's sign-in, data access, imagery and photo pipeline)
    utils/          # admin-path, prefers-reduced-motion
    app.routes.ts   # home · map · about · admin (lazy) · '' → map · ** → home
  environments/     # the backend each build talks to (environment.prod.ts in production)
  styles.css        # Tailwind + @theme design tokens (OKLCH colors, glow, motion, radius)
  theme.scss        # Angular Material M3 green-terminal theme
  fonts/            # self-hosted IBM Plex Mono (woff2) — under src/, not public/,
                    # so the bundler emits them hashed and rewrites the url()
                    # relative; a root-absolute /fonts/... 404s under the deploy
                    # prefix (tools/verify-css-asset-urls.mjs guards it)
  index.html
tools/
  extract-spots/    # npm run extract:spots — My Maps KML → data/spots/ (see below)
  sync-supabase/    # npm run sync:supabase (insert-only) / snapshot:supabase — data/spots/ → Supabase → public/spots/ (see below)
  verify-*.mjs      # build:pages runs the dist guards; verify:dev-map-worker is manual
data/
  spots/            # extracted per-city datasets (GeoJSON + run reports)
  thumbs/           # derived 640px thumbnails (local, not committed)
supabase/           # Supabase CLI project: config.toml, the migrations, pgTAP tests, the magic-link email template
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

The tool writes only `data/`: the datasets, their reports and the encoded
photos. Each spot's served record (`tools/extract-spots/served-record.mjs`) is
`id`, `name`, `status`, `notes` — the first non-empty description across its
maps, verbatim, or `null` — and `photos` as object keys `<city>/<file>.webp`
under the photo host; `npm run sync:supabase` inserts the spots the database has
never seen. The bundled `public/spots/<city>.geojson` snapshots are no longer
derived from `data/spots/`: `npm run snapshot:supabase` exports them from the
database (see [Snapshots](#snapshots)). `tools/extract-spots/committed-datasets.test.mjs`
checks every committed snapshot on its own (a well-formed collection, unique
ids, valid statuses and coordinates, photo keys `<city>/<file>.webp`) and the
Karma `spot-datasets.spec.ts` checks one snapshot per supported city.

| Path                               | Committed | Contents                                                                            |
| ---------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| `data/spots/sources.json`          | yes       | the map registry: every My Maps map by slug, and each city's maps and prefixes      |
| `data/spots/<city>.geojson`        | yes       | the city's spots; photo paths are base-relative (`spots/<city>/…`)                  |
| `data/spots/<city>.report.json`    | yes       | counts, dead, recovered and repeated photos, match issues and warnings              |
| `data/spots/<map>.map-report.json` | yes       | the placemarks of a shared or extra map that no city or several cities claim        |
| `public/spots/<city>.geojson`      | yes       | the snapshot the app falls back to, exported from the database by snapshot:supabase |
| `data/spots/<city>/*.webp`         | no        | the encoded photos                                                                  |
| `data/thumbs/<city>/*.webp`        | no        | the sync's 640px thumbnails of the encoded photos                                   |
| `data/.cache/kml/<map>.kml`        | no        | the raw KML of each map's last fetch that parsed                                    |

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
non-zero, naming each failed city. A city also fails, so a wrong error from Google or a moved placemark cannot wipe
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

Each build's backend is set in `src/environments/`. Production builds
(`environment.prod.ts`) talk to the hosted EU Supabase project, so the deployed
site shows live spots and photos and falls back to the snapshot as described
above. Development builds talk to the local stack (see [Local stack](#local-stack)).
[The hosted project](#the-hosted-project) records how the production project is
set up and how to re-point the site at another one.

### The maintainer loop

The database is the source of truth. Existing spots are edited only in the
maintainer tool (see [The maintainer tool](#the-maintainer-tool)). Google My Maps
stays an input for **new** spots only: a change made there to a spot the database
already holds — a moved pin, a new name, a new photo, a status — never flows in.

1. Edit in the tool; the change is live at once.
2. Optionally add new spots in My Maps → `npm run extract:spots` →
   `npm run sync:supabase -- --hosted` (inserts only spots the database has
   never seen).
3. `npm run snapshot:supabase -- --hosted` → commit `public/spots/` (the
   fallback may lag the live map until then).

A spot moved more than 25 m, or renamed, in My Maps after it was synced gets a
new id: the sync prints it as a possible duplicate or inserts it as new. It
prints both and guesses nothing.

### Access

The public (the publishable key the site ships in its bundle) can read the
`cities`, `spots` and `spot_photos` tables and call `city_spots(city)`, and
nothing else: no table, function or bucket write. Only the **secret key**
(`sb_secret_…`, which bypasses row-level security) writes, through
`sync_existing_spots()` / `sync_insert_spots(payload)` and Storage uploads. It
lives in `spotmap-website/.env.local` (gitignored; template `.env.example`) and
is sent in the `apikey` header only.

A signed-in admin (a row in `public.admins`) writes through the `admin_*`
functions and the `is_admin()`-gated Storage policies. Soft-deleted spots
(`deleted_at` set) are hidden from the public and from `city_spots()`. The Esri
imagery key lives in the admin-only `admin_settings` table and reaches the
browser only through `admin_get_setting()`.

### The maintainer tool

The maintainer tool lives at `/spotmap-website/admin` on the Pages origin and at
`http://127.0.0.1:4200/admin` under `ng serve`. Nothing on the public site links
to it; its routes skip the intro and hide the public nav bar.

**Sign-in.** Enter the email address: one email carries a link and a 6-digit
code. Open the link, or type the code on the page (which works when the link
opens in another browser). Only an invited user can sign in and only a user in
`admins` can do anything. The default mailer sends about 2 emails per hour.

**Add (create-or-attach).** Pick photos from the camera roll (HEIC or JPEG). They
are decoded and re-encoded in the browser to WebP at 1,400 px / quality 72 and
640 px / quality 70, with no EXIF. GPS, when present, is only the picker's first
guess and is never stored. Place the spot on Esri satellite imagery by panning
under the fixed centre pin; the view opens on the first photo with GPS, else on
the centre of the chosen city's spots. Spots within 25 m (or of the same name
within 100 m) are offered as candidates: attach here, restore and attach a
deleted one, or create a new spot anyway. The result is a saved spot with
thumbnails. Photos picked together land on one spot; a batch spread over more
than 25 m warns and lets photos be dropped.

**Spots.** The list filters by city and name and can include deleted spots. The
edit page renames, changes the status and notes, moves the pin on the picker,
reorders photos (earlier / later), removes a photo (confirmed in the page; both
files are deleted) and adds photos, and deletes (soft, restorable) or restores
the spot. Every edit is one database call and shows saving, saved or the error.

**New city.** "New city…" in the city field inserts a `cities` row only.
Visitors see the city after a normal code change adds it to `CityEnum`
(`src/app/models/enums/map-enum.ts`), `SUPPORTED_CITIES`
(`src/app/models/enums/config.ts`) and, if it has a My Maps map,
`data/spots/sources.json`, plus its snapshot via
`npm run snapshot:supabase -- --hosted --city <slug>`.

### Local stack

Needs Docker.

```bash
npm run db:start   # db, REST API, Storage on http://127.0.0.1:54321 (applies the migrations)
npm run db:test    # pgTAP: access rules, city_spots, the admin functions, sync_insert_spots
npm run db:reset   # re-apply the migrations from scratch
npm run db:stop
```

`ng serve` talks to this stack (`src/environments/environment.ts`); with the
stack down the map simply serves the snapshot. `npm run db:start` also starts the
mail catcher (Mailpit, `http://127.0.0.1:54324`, `[local_smtp]` in
`supabase/config.toml`), so a local sign-in email can be read there.

### The sync

Inserts the spots the extraction found that the database has never seen. Once a
spot is in the database the maintainer tool owns it, so the sync never updates,
deletes or prunes anything.

```bash
npm run sync:supabase                          # local stack
npm run sync:supabase -- --dry-run             # plan against the database, write nothing
npm run sync:supabase -- --db-only             # database only, from the committed datasets (no photos needed); local stack only
npm run sync:supabase -- --hosted              # required whenever SUPABASE_URL is not the local stack
npm run sync:supabase -- --expect-no-inserts   # plan against the database, write nothing, exit 1 if anything would be inserted
```

It reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY` from `.env.local` or the
environment (the environment wins), so it targets whichever project those two
name: the local stack by default, the hosted project once `.env.local` points at
it.

It prints the target first, then runs each step only after the previous one
succeeded: read every existing spot, deleted ones included → plan: an id
already present is skipped, a spot within 25 m of an existing one (or with the
identical name within 100 m) is printed as "possible duplicate of <id>" and held
back, every other spot is inserted → load and check the photos of the spots it
will insert → derive their thumbnails into `data/thumbs/` → upload the objects
the bucket lacks (one it already holds is skipped) → insert in one `sync_insert_spots()`
transaction. A re-run with unchanged data inserts nothing.
Exit codes: 0 done, 1 a step failed (named), 2 bad arguments or environment
(including `--db-only` against a hosted project, whose rows would point at photos
never uploaded). CI's database job runs it this way on every pull request (see
[Branches and CI](#branches-and-ci)).

### Snapshots

```bash
npm run snapshot:supabase                  # from the local stack
npm run snapshot:supabase -- --hosted      # from the hosted project
npm run snapshot:supabase -- --city <slug> # also writes a city that has no snapshot yet
```

Writes `public/spots/<city>.geojson` from `city_spots()` for every city that
already has a snapshot, plus each `--city` given (repeatable). Exit codes: 0 all
written, 1 a city failed, 2 bad arguments or a target refused (a hosted URL
without `--hosted`, or `--hosted` against the local stack).

### The hosted project

Production runs on one hosted Supabase project. These steps set one up from
nothing; to move the site to a different project, run them against the new
one and redeploy:

1. Create the Supabase project (EU region, free tier).
2. Apply the migrations to it. All of them must be in before steps 5 and 7,
   which insert into `public.admins` and `public.admin_settings`, tables the
   maintainer-tool migration creates:

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
5. Auth: set the site URL to the Pages origin
   `https://<user>.github.io/spotmap-website/` and add
   `https://<user>.github.io/spotmap-website/admin` and
   `http://127.0.0.1:4200/admin` to the redirect allow-list; disable signups;
   invite the maintainer (Authentication → Users → Invite). Then, in the SQL
   editor:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = '<maintainer email>';
   ```

6. Email: paste `supabase/templates/magic-link.html` into Authentication →
   Email Templates → Magic Link. It carries `{{ .ConfirmationURL }}` and
   `{{ .Token }}`, so the email has both the link and the code. The default
   mailer's limit is about 2 emails per hour.
7. Imagery: create an ArcGIS Location Platform API key with only the static
   basemap tiles privilege, referrer-restricted to the Pages origin. Check it:

   ```bash
   curl -s -o /dev/null -w '%{http_code}' "https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1/arcgis/imagery/static/tile/3/3/3?token=$KEY"
   ```

   It must print `200`; a failing check means the key or the imagery provider
   needs revisiting before going on. Then store the key; it is never committed:

   ```sql
   insert into public.admin_settings (key, value) values ('esri_api_key', '<key>');
   ```

8. `npm run sync:supabase -- --hosted`, then
   `npm run snapshot:supabase -- --hosted`.

To test a branch on a phone against the hosted sign-in, add the phone-reachable
origin (a local-network address or a tunnel) to the redirect allow-list for the
test, and remove it afterwards.

A custom domain means updating the site URL and the redirect allow-list.

## Design system

The visual North Star and its rules — two-phosphor palette (green voice + amber
for care/selection), the No-White rule, glow-as-depth (no drop-shadows),
monospace everything, and soft 4/6/8 px corners — live in `PRODUCT.md` and
`DESIGN.md` at the repository root.

## Branches and CI

`dev` is the integration branch: work lands on a topic branch, opens a pull
request into `dev`, and `dev` reaches `main` by pull request (`main` is
production, see [Deployment](#deployment)).

Every pull request into `dev` or `main` runs `.github/workflows/ci.yml`:

- **format** — `npm run format:check` (Prettier).
- **build** — `npm run build:pages`: the `tools/` tests, the production build
  and the dist verifiers, so the artifact `main` would deploy is checked first.
- **test** — the Karma unit tests in headless Chrome
  (`npm test -- --no-watch --no-progress --browsers=ChromeHeadless`).
- **database** — on a local Supabase stack: the migrations (`npm run db:start`)
  and pgTAP tests (`npm run db:test`), the sync seeding the empty database from
  `data/spots` (`npm run sync:supabase -- --db-only`), then the same sync again
  with `--db-only --expect-no-inserts`, which fails if the committed datasets and
  the database disagree.
- **secrets** — a gitleaks scan of the whole git history.

Dependabot opens weekly update PRs for the GitHub Actions (repo root) and the
npm dependencies (`spotmap-website/`); minor and patch updates arrive grouped in
one PR per ecosystem, majors one PR each. `jasmine-core`, `@types/jasmine` and
`typescript` are held at their current major (an `ignore:` rule in
`.github/dependabot.yml`): moving one is a deliberate upgrade, made by hand.

## Deployment

Pushing to `main` triggers the GitHub Actions workflow
(`.github/workflows/deploy-angular.yml`), which builds and deploys the app.
Because a push to `main` deploys automatically, treat `main` as production.
