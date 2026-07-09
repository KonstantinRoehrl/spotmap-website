# Stage 5 — Material Terminal Theme Plan

> subagent-driven-development. Opus implementers (Material M3 theming + component work), Sonnet reviewers. Controller visually verifies. `DESIGN.md` §2/§5 + `.impeccable/design.json` are the spec.

**Goal:** Replace the stock Material `azure-blue` prebuilt theme with a custom **green terminal M3 theme**, eliminate the `::ng-deep`/`!important` override pile in `map.component.css`, fix the **white map box** (No-White Rule → dark placeholder + error state), and swap the **color emoji nav icons** for monochrome terminal glyphs.

## Global Constraints
- **NEVER push.** Local commits only, branch `refactor/audit-p0-p3`.
- Preserve behavior/animation timing and the matrix aesthetic. Consume the design tokens (`--color-*`, `--font-mono`, `--glow-*`, `--radius-*`) already defined in `src/styles.css`. Author color in OKLCH.
- **No white / near-white on any controlled surface** (DESIGN.md No-White Rule) — including the Material select dropdown panel/overlay.
- Minimize `!important` and `::ng-deep`; where a CDK-overlay element (the select panel) must be styled, do it in GLOBAL scope with `--mat-*` system tokens, not component `::ng-deep`.
- **Green gate per task:** `npm run build` succeeds AND `npm test -- --watch=false --browsers=ChromeHeadless` = **15/15**. FOREGROUND commands only.
- App dir: `spotmap-website/` (run `ng`/`npm`). Git root: repo root (run `git`). Conventional-commit prefixes.

## Task 1: Custom green M3 Material theme (Opus)
**Files:** `src/theme.scss` (new), `angular.json` (styles array), possibly `src/styles.css` (global `--mat-*` overrides if needed).
- Create `src/theme.scss` using Angular 22's Material theming API (`@use '@angular/material' as mat;`). Inspect the installed `@angular/material` version's API (M3 `mat.theme()` / `mat.define-theme`) to use the correct current syntax. Configure: a **green primary** (use a green M3 palette or define one from the phosphor hue), **dark** color scheme, **monospace** typography (IBM Plex Mono via the token/stack), density 0.
- In `angular.json` `build.options.styles`, REPLACE `@angular/material/prebuilt-themes/azure-blue.css` with the compiled `src/theme.scss`. (Keep `src/styles.css`.) Also update the `test` target styles array the same way (it currently lists azure-blue) so specs still theme.
- IMPORTANT (Tailwind coexistence): keep the Tailwind `@import "tailwindcss"` in `src/styles.css` (a CSS file processed by PostCSS). Do NOT move Tailwind into the SCSS file — `theme.scss` is Sass-compiled separately. If both must load, order in angular.json: theme.scss, then styles.css.
- Ensure the select **field, value text, arrow, label, options, and the overlay panel** render on dark `--color-surface` with `--color-phosphor` text (No-White). Selected option uses the amber/active treatment per DESIGN.md §5.
- **Gate + commit** `feat: add custom green terminal Material M3 theme`. Report the theming API used, the files, and how the dark panel/no-white is achieved.

## Task 2: Remove ::ng-deep/!important overrides in map.component.css (Opus; depends on T1)
**Files:** `src/app/modules/pages/map/map.component.css`, possibly a global `src/styles.css` addition for overlay-panel rules.
- With the M3 theme (T1) doing the heavy lifting, DELETE the `::ng-deep .mat-mdc-*` + `!important` blocks. Re-express only the still-needed terminal touches (phosphor glow on field/options, mono font, dark panel, selected=amber, sharp radius) via `--mat-*` system-variable overrides + minimal global rules. **Target: 0 `::ng-deep`, and `!important` count near-zero** (only where genuinely unavoidable, each with a comment).
- The select panel is a CDK overlay outside the component DOM — its rules MUST be global (`src/styles.css` or theme.scss), not component-scoped.
- **Gate + commit** `refactor: replace Material ::ng-deep overrides with M3 theme tokens`. Report before/after `::ng-deep` and `!important` counts and the map.component.css size (should drop well under the 4kB budget → we can revert the Stage-1 budget bump in Stage 9).

## Task 3: Fix the white map box + loading/error state (Opus; independent of T1/T2)
**Files:** `src/app/modules/components/map-container/map-container.component.{ts,html,css}`.
- Back the iframe with `--color-surface` (near-black) so a blank/slow/failed embed never flashes white (No-White Rule). Keep the existing matrix-radar loading spinner over the dark surface.
- Add an **error/timeout state**: if the iframe hasn't loaded after a timeout (e.g. ~15s) or errors, show a phosphor terminal message ("> SIGNAL LOST // MAP UNREACHABLE") on `--color-surface` with a retry affordance, per DESIGN.md §5 map-frame. Use signals; honor reduced-motion later (Stage 8). Also set the iframe `title` (a11y) here.
- Align the frame glow/radius to the tokens (`--glow-edge-frame`, `--radius-md`) — resolves the Stage-3-deferred solid-green glow/12px radius.
- **Gate + commit** `feat: dark map placeholder + SIGNAL LOST error state`. Report the states added and how white is prevented.

## Task 4: Nav emoji → monochrome terminal glyphs (Sonnet; independent)
**Files:** `src/app/app.component.html` (the nav links array passes `icon`), `nav-bar.component.{ts,html,css}`, and possibly the `NavBarLink` interface.
- Replace the color emoji (🏠 📍 ℹ️) with monochrome terminal glyphs that inherit `currentColor`/phosphor glow (inline SVG line-icons in green stroke, OR ASCII marks). The nav must still read Home/Map/About with an icon + label, phosphor glow, active state unchanged.
- Keep it accessible (glyphs `aria-hidden`, label text remains).
- **Gate + commit** `feat: replace nav emoji with monochrome terminal glyphs`. Report the glyph approach.

## Stage 5 completion
Controller runs a whole-branch review of the Stage 5 range and a visual re-verification (boot app + screenshot desktop/mobile; if feasible, drive a click to check the dark select panel) before Stage 6.
