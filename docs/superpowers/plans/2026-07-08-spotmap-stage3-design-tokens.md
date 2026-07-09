# Stage 3 — Design-Token Foundation Plan

> Executed via superpowers:subagent-driven-development. Opus 4.8 implementers, Sonnet 5 reviewers. The token VALUES are specified in `DESIGN.md` (frontmatter) and `.impeccable/design.json` (glow/motion/breakpoint extensions) at the repo root — those files are the source of truth; implement them faithfully.

**Goal:** Establish a single source of truth for the matrix design system — OKLCH color tokens (incl. the new amber channel), surfaces, spacing, radius, phosphor-glow, motion, and the mono font — as Tailwind v4 `@theme` + `:root` CSS variables, then migrate global and component CSS to consume them. Self-host IBM Plex Mono.

**Architecture:** Tailwind v4 is CSS-first: define tokens in a `@theme` block in `src/styles.css` (generates `text-*`/`bg-*`/`border-*`/`shadow-*` utilities) plus `:root` custom properties for values Tailwind utilities don't cover (text-shadow glows, motion durations/easings). Component CSS then references `var(--…)`. No behavior change; the matrix look is preserved (tokens equal current values, with two deliberate DESIGN.md refinements noted per task).

## Global Constraints

- **NEVER push.** Local commits only, branch `refactor/audit-p0-p3`.
- **Preserve the matrix aesthetic and all behavior/animation timing.** Visual output stays green-on-black monospace glow; only the two explicitly-noted DESIGN.md refinements change pixels.
- **No new runtime dependencies** without asking. IBM Plex Mono is self-hosted as static `.woff2` (see Task 2) — do NOT add an npm font package without asking first.
- **Author color in OKLCH** (DESIGN.md doctrine). Keep hex only as needed for the Tailwind/Stitch frontmatter already written.
- **Green gate per task:** `npm run build` succeeds (pre-existing warnings allowed) AND `npm test -- --watch=false --browsers=ChromeHeadless` = **15/15**. Run all build/test commands in the FOREGROUND (never backgrounded).
- App dir: `/Users/konstantin/Programming/spotmap-website/spotmap-website` (run `ng`/`npm`). Git root: `/Users/konstantin/Programming/spotmap-website` (run `git`). Keep `chore:`/`feat:` conventional-commit prefixes.

---

## Task 1: Token layer (Tailwind v4 @theme + :root)

**Files:** `src/styles.css` (the global stylesheet, already has `@import "tailwindcss";` at top).

**Interfaces produced (later tasks/stages consume these):**
- Tailwind color utilities from `@theme` `--color-*`: `phosphor`, `phosphor-bright`, `phosphor-dim`, `phosphor-deep`, `amber`, `amber-dim`, `danger`, `bg`, `surface`, `surface-raised`, `line` (→ `text-phosphor`, `bg-surface`, `border-line`, etc.).
- `--font-mono` (Tailwind `--font-mono` in `@theme` → `font-mono` utility): `'IBM Plex Mono', 'Courier New', monospace`.
- `:root` CSS vars for glow + motion (NOT Tailwind utilities): `--glow-text-rest`, `--glow-text-hot`, `--glow-text-amber`, `--glow-edge-frame`, `--glow-edge-active`, `--ease-out-expo`, `--dur-glitch`, `--dur-type`, `--dur-fast`, `--dur-glow-fade`.
- Radius via `@theme` `--radius-sm: 2px; --radius-md: 4px;`.

- [ ] **Step 1:** In `src/styles.css`, after `@import "tailwindcss";`, add a `@theme { … }` block declaring the color/`--font-mono`/`--radius-*`/`--shadow-*` tokens with the exact values from `DESIGN.md` frontmatter (colors in OKLCH — convert the hex in the frontmatter to the canonical OKLCH given in DESIGN.md §2, e.g. `--color-phosphor: oklch(86.6% 0.2948 142.5);`). Add a `:root { … }` block for the glow text-shadow vars and the motion vars, values from `.impeccable/design.json` `extensions.shadows`/`extensions.motion`.
- [ ] **Step 2:** Refactor the EXISTING rules in `src/styles.css` to consume tokens: replace the `#00ff00` occurrences with `var(--color-phosphor)`; replace the hardcoded `text-shadow: 0 0 2px … 10px #00ff00` glow with `var(--glow-text-rest)` (this uses DESIGN.md's ≤6px 3-stop resting glow — a **deliberate refinement** for sunlight legibility, per the Bloom-Budget Rule); replace `'Courier New', monospace` with `var(--font-mono)`; set the body background to `var(--color-bg)` and change the `body { font-family: Roboto … }` to `var(--font-mono)` (**deliberate:** the One-Grid Rule — the whole UI is monospace; the intro/app already render mono, this makes body consistent).
- [ ] **Step 3 (gate):** `npm run build` succeeds; `npm test … ` 15/15. The rendered look stays green-on-black monospace glow (slightly tighter resting glow). If the build errors on a Tailwind `@theme` syntax issue, fix minimally per Tailwind v4 docs.
- [ ] **Step 4:** Commit: `git commit -m "feat: add matrix design-token layer (Tailwind @theme + :root)"` (stage `spotmap-website/src/styles.css`).

Report: the token block written, the two deliberate refinements (glow ≤6px, body→mono), and gate results.

---

## Task 2: Self-host IBM Plex Mono

**Files:** `public/fonts/` (new `.woff2` files), `src/styles.css` (`@font-face`), `src/index.html` (remove the Google Fonts `<link>`s).

- [ ] **Step 1:** Obtain IBM Plex Mono (OFL, free) weights 400/500/600 as `.woff2` and place under `public/fonts/ibm-plex-mono/` (self-hosted; no external CDN, no npm package). If you cannot fetch the font files in this environment, STOP and report NEEDS_CONTEXT so the controller can supply them — do NOT add an npm dependency without asking.
- [ ] **Step 2:** Add `@font-face` rules in `src/styles.css` (`font-display: swap`) for the three weights; `--font-mono` (from Task 1) already lists `'IBM Plex Mono'` first, so no token change needed.
- [ ] **Step 3:** Remove the two Google Fonts `<link>`s (Roboto + Material Icons) from `src/index.html` — nothing should load them now that the UI is mono and Material Icons aren't used (verify no `mat-icon`/`Material Icons` usage remains; if any, replace or keep the icon font only, and note it).
- [ ] **Step 4 (gate):** build + 15/15; the app renders in IBM Plex Mono (verify the ASCII grid still aligns — monospace advance preserved). Commit: `git commit -m "feat: self-host IBM Plex Mono; drop Google Fonts"`.

Report: font files added, `@font-face` block, index.html links removed, ASCII-grid alignment confirmed, gate results.

---

## Task 3: Migrate component stylesheets to tokens

**Files:** `app.component.css`, `modules/components/{nav-bar,map-container,loading-bar,ascii-animation-text}/*.css`, `modules/pages/map/map.component.css`.

- [ ] **Step 1:** Replace hardcoded `#00ff00` / `rgba(0,255,0,…)` / `'Courier New'` / glow `text-shadow` / `box-shadow` green stacks with the corresponding `var(--…)` tokens across every component stylesheet. Semantics-preserving: `#00ff00` → `var(--color-phosphor)`, glow → the matching `--glow-*` var, font → `var(--font-mono)`, black bg → `var(--color-bg)`, near-black panels → `var(--color-surface)`. Do NOT restyle Material `::ng-deep` blocks yet (that's Stage 5) beyond swapping literal color values for tokens.
- [ ] **Step 2 (gate):** build + 15/15; visual unchanged. Commit: `git commit -m "refactor: migrate component styles to design tokens"`.

Report: per-file counts of literals replaced, confirmation of no visual change, gate results.

---

## Stage 3 completion
Controller runs a whole-branch review of the Stage 3 range, then a visual re-verification (boot app + screenshot) before Stage 4 (drop Bootstrap).
