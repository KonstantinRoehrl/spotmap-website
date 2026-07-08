# Spotmap

A skate-spot map for Vienna (and other cities), styled as a green-phosphor CRT
terminal — "The Phosphor Archive". It's an Angular single-page app; the map
itself is an embedded Google My Maps iframe, framed in a dark, glowing terminal
shell so a blank embed never flashes white.

## Tech stack

- **Angular 22** — standalone components, signals (`input()`/`output()`/`signal()`/`computed()`), OnPush change detection, `@for`/`@if` control flow.
- **Angular Material 22** — a custom M3 "green terminal" theme (`src/theme.scss`) via `--mat-sys-*` system tokens.
- **Tailwind CSS v4** — CSS-first `@theme` design tokens in `src/styles.css`.
- **IBM Plex Mono** — self-hosted (`public/fonts/`); the whole UI is one monospace character grid.
- **Karma + Jasmine** — unit tests.
- **TypeScript 6**, **Zone.js** (change detection is OnPush, Zone retained).

## Getting started

Requires **Node ≥ 22.22.3** (or ≥ 24.15 / ≥ 26) for the Angular 22 CLI.

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
  index.html
public/fonts/        # self-hosted IBM Plex Mono (woff2)
```

## Design system

The visual North Star and its rules — two-phosphor palette (green voice + amber
for care/selection), the No-White rule, glow-as-depth (no drop-shadows),
monospace everything, and sharp 0–4px corners — live in `PRODUCT.md` and
`DESIGN.md` at the repository root.

## Deployment

Pushing to `main` triggers the GitHub Actions workflow
(`.github/workflows/deploy-angular.yml`), which builds and deploys the app.
Because a push to `main` deploys automatically, treat `main` as production.
