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

`npm run extract:spots` pulls every city's Google My Maps KML export, turns its
placemarks into the app's `SpotCollection` GeoJSON (`src/app/models/spots/spot.ts`),
and re-encodes every reachable photo to WebP (long edge 1400px, quality 72).

```bash
npm run extract:spots                       # all 16 cities
npm run extract:spots -- vienna split       # only these cities
npm run extract:spots -- vienna --reencode  # download and encode existing photos again
```

The tool lives in `tools/extract-spots/` and writes to `data/`. The live map
still reads `public/spots/`; promoting a dataset there is a separate step.

| Path                            | Committed | Contents                                                                               |
| ------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| `data/spots/sources.json`       | yes       | each city's My Maps `mid` and the name prefixes stripped from its spot names           |
| `data/spots/<city>.geojson`     | yes       | the city's spots; photo paths are base-relative (`spots/<city>/…`)                     |
| `data/spots/<city>.report.json` | yes       | counts, dead and repeated photos (by spot and position) and warnings from the last run |
| `data/spots/<city>/*.webp`      | no        | the encoded photos                                                                     |
| `data/.cache/kml/`              | no        | the raw KML of each city's last successful fetch                                       |

Photos are not committed: all cities together come to well over a thousand
images, too heavy for git, and they get a real host later.

Google changes every photo URL on each export, so the tool recognises a photo by
a fingerprint of its tiny 32px rendition and names the file after it. A re-run
fetches that rendition for every photo (a few KB each) and downloads only photos
that are new or changed; with unchanged maps it downloads no originals and the
committed files stay identical. A city that fails keeps its previous files; the
run carries on and exits non-zero, naming each failed city. A city also fails
when a photo it downloaded on the previous run now comes back dead: Google
sometimes answers a good photo with an error, and failing is safer than
deleting it.

Some photo links (`lh3.googleusercontent.com/umsh/…` — every photo of Split and
Prague) answer 404, even for the map's owner, and My Maps itself shows them as
broken images. Those photos are lost at the source: the tool skips them and lists
them under `photosDead` in the city's report. A dead link is only skipped when it
is new or was already dead on the previous run. A photo that was downloaded before
and now turns dead fails the city until a re-run downloads it again or the link
is removed in My Maps.

## Design system

The visual North Star and its rules — two-phosphor palette (green voice + amber
for care/selection), the No-White rule, glow-as-depth (no drop-shadows),
monospace everything, and sharp 0–4px corners — live in `PRODUCT.md` and
`DESIGN.md` at the repository root.

## Deployment

Pushing to `main` triggers the GitHub Actions workflow
(`.github/workflows/deploy-angular.yml`), which builds and deploys the app.
Because a push to `main` deploys automatically, treat `main` as production.
