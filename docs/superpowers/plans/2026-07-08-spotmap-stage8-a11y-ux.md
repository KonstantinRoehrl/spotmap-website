# Stage 8 — a11y / UX / Content Plan

> subagent-driven-development. Opus for the motion/intro/content tasks (judgment + writing), Sonnet reviews. Controller visually verifies (incl. a reduced-motion emulation pass). Base: `04a13f2`.

**USER DECISIONS (recorded):**
1. **Intro** = play **once per browser session** (sessionStorage flag), skip straight to the map on later loads that session; **skippable** any time via click / tap / Esc; **reduced-motion** shows the end-state instantly.
2. **Flags** → **monochrome country code** in phosphor green (e.g. `vienna · AT`, group header `AUSTRIA`), no color emoji.
3. **Home** = a short terminal manifesto (what the archive is) + the amber care-channel (`> RESPECT THE LOCALS` / `> TAKE CARE OF PEDESTRIANS`) + a way into the map. **About** = how-to + the "time-travel to earlier days" ethos + credits + a skate-at-your-own-risk disclaimer. Copy in the design voice (raw/DIY, cryptic-insider, sarcastic-but-caring); DRAFT then surface for user review.

**Goal:** Make the CRT experience accessible (every heavy animation has a `prefers-reduced-motion` fallback), less punishing on repeat visits (skippable, once-per-session intro), design-consistent (no color emoji), and actually populated (Home/About content).

## Global Constraints
- **NEVER push.** Local commits only, branch `refactor/audit-p0-p3`.
- Preserve the matrix aesthetic and the animation timing for users WITHOUT reduced-motion. Consume design tokens; author color in OKLCH; amber only for care/selection (Rarity Rule ≤10%).
- **Green gate per task:** `npm run build` succeeds AND `npm test -- --watch=false --browsers=ChromeHeadless` = **21/21** (adjust up if a task adds tests — report the count). FOREGROUND only.
- App dir `spotmap-website/`; git root = repo root. Conventional-commit prefixes. Run `npm run format` before committing if a task changed many files (Prettier is now set up), or ensure the diff is already Prettier-clean.

## Task 1: prefers-reduced-motion fallbacks for the non-intro animations (Opus)
**Files:** `glitch-text.directive.ts`, `loading-bar.component.{ts,css}`, `nav-bar.component.css` (+ any component CSS with `@keyframes`/`transition`/`animation` — grep first).
- Every CRT motion needs a reduced-motion fallback (DESIGN.md / `.impeccable/design.json` motion rules: static end-state or crossfade). Implement per animation:
  - **glitch-text directive:** JS-driven per-character scramble (setInterval mutating DOM on hover). Under `matchMedia('(prefers-reduced-motion: reduce)').matches`, do NOT scramble — render the final text immediately (no interval). Guard in TS.
  - **loading-bar matrix:** JS-driven rotation + char-shift intervals. Under reduced-motion, render a STATIC ring (don't start the rotation/shift intervals, or set a single static frame) — the loader must still communicate "loading" without motion. Guard in TS + a CSS fallback.
  - **nav-bar glow:** the hover radial-glow (mousemove `--mouse-x/y`) and touch-glow fade + any glow `transition`/`animation`. Under reduced-motion (CSS `@media (prefers-reduced-motion: reduce)`), disable/shorten the animated glow transitions — keep a static legible focus/active state (accessibility priority surface).
  - Any `@keyframes` (scanline/flicker/phosphor-decay) in component CSS → wrap in `@media (prefers-reduced-motion: no-preference)` or add a reduce override that stops them.
- Do NOT change behavior for users without the preference. **Gate + commit** `feat: prefers-reduced-motion fallbacks for CRT animations`. Report each animation and its fallback.

## Task 2: intro overhaul — once-per-session, skippable, reduced-motion, font re-measure (Opus)
**Files:** `app.component.{ts,html}`, `ascii-animation-text.component.{ts,html}`.
- **Once per session:** gate the intro on `sessionStorage` (e.g. key `introSeen`). First load of a session → `introFinished=false` (play intro). If already seen this session → set `introFinished=true` immediately and go straight to `/map` (no intro). Set the flag when the intro finishes/skips. Guard sessionStorage in try/catch (private mode).
- **Skippable:** a click / tap / `Escape` keydown while the intro is showing finishes it immediately (same effect as `animationFinished` → navigate to map, set flag). Add a small, accessible "skip" affordance (e.g. a visually-terminal `[ SKIP ]` control or `press any key`), keyboard-focusable, `aria`-labeled. Don't break the existing `onIntroFinished` flow.
- **Reduced-motion:** if `prefers-reduced-motion: reduce`, skip the typewriter animation entirely — show the final message (or just proceed to the map) instantly. Coordinate with the AsciiAnimationText component: under reduced-motion it should not run the per-char interval; render the full text (and still emit `animationFinished`).
- **Font re-measure (deferred from Stage 7):** in `ascii-animation-text`, add a `document.fonts.ready.then(() => this.updateFontSize())` so the first glyph measurement isn't taken on the fallback font before IBM Plex Mono loads. Guard for environments without `document.fonts`.
- **Gate + commit** `feat: skippable once-per-session intro + reduced-motion + font re-measure`. Report the session logic, skip affordance, reduced-motion handling.

## Task 3: city select — country codes + a11y (Opus)
**Files:** `map.component.{ts,html}`, `models/enums/*` (FlagEnum / config / MapItem). Read them first.
- Replace the full-color flag emoji (🇦🇹/🇧🇦) in the select VALUE and the `<mat-optgroup>` labels with **monochrome 2-letter country codes** in phosphor green. Group header → the country name uppercased (e.g. `AUSTRIA`); the selected value/trigger → `city · AT` (or similar terminal form). Decide the cleanest mapping from the existing `FlagEnum`/`country` data — you may map country→ISO-2 code via a small lookup or reuse existing country data. No color emoji anywhere on this surface.
- **a11y audit of the select + map region:** ensure `<mat-select>` has an accessible label (the `<mat-label>City</mat-label>` associates it — confirm), the trigger/options are keyboard-navigable (Material handles this — verify not broken), and the map state changes (loading / SIGNAL LOST) are announced (the error already has `role="alert"`; consider `aria-live="polite"` on the loading state and confirm the iframe `title`). Fix any gap found; don't over-engineer.
- **Gate + commit** `feat: monochrome country codes in city select; a11y polish`. Report the emoji→code mapping and a11y changes.

## Task 4: Home + About content (Opus)
**Files:** `home.component.{html,css}`, `about.component.{html,css}` (+ ts only if needed).
- Write real content in the design voice (raw/DIY skate + cryptic-insider + sarcastic-but-caring; product register; terminal styling; amber ONLY for the care-channel / one earnest role, ≤10%).
  - **Home:** a short manifesto — what "The Phosphor Archive" / spotmap is (1–3 terminal lines), the amber care-channel (`> RESPECT THE LOCALS`, `> TAKE CARE OF PEDESTRIANS`), and a clear route into the map (a terminal-styled `[ ENTER THE MAP ]` RouterLink to `/map`).
  - **About:** how to use it (pick a city, the map is a Google My Maps embed, spots are pins), the ethos ("time travel to earlier days" — the deliberate anachronism), credits/attribution, and a skate-at-your-own-risk disclaimer.
- Style with existing tokens (phosphor green, mono, glow, sharp corners, amber care-channel). Keep prose ≤65–75ch, mobile-first, legible. Honor reduced-motion (no new unguarded animation). These pages currently just wrap the ascii component — you may keep or drop that per what reads best.
- **This is a DRAFT for user review** — implement it, gate green, commit, but the controller will surface the copy to the user and we may iterate. **Gate + commit** `feat: Home manifesto + About page content`. Report the copy written (quote it in your report so the controller can relay it).

## Stage 8 completion
Controller runs a whole-branch review of the Stage 8 range, a visual verification (desktop + mobile) INCLUDING a `prefers-reduced-motion: reduce` emulation pass (confirm animations fall back), and surfaces the Home/About copy to the user for review before Stage 9 (finalize: budgets, lazy routes, final verify).
