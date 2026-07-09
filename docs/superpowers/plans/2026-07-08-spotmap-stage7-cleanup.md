# Stage 7 — Cleanup / Dead-code / Docs / Format Plan

> subagent-driven-development. Opus for the dead-code/CSS + Prettier tasks (judgment: verify truly-dead before removing), Sonnet for README+tests, Sonnet reviews. Base: `0655ba1`.

**USER DECISIONS (recorded):** (1) Format pass = **add Prettier** (new devDependency approved) + a `.prettierrc` matching `.editorconfig` + a `format` npm script, run over the codebase — this task runs **LAST** so it normalizes the final state. (2) **Skip** folder restructure (structure is already sensible; churn not worth it).

**Goal:** Remove the accumulated dead code, tidy the last untokenized CSS, fix the leaky test, replace the boilerplate README with a real one, and add Prettier for consistent formatting — with zero behavior change.

## Global Constraints
- **NEVER push.** Local commits only, branch `refactor/audit-p0-p3`.
- Behavior + matrix aesthetic + animations UNCHANGED. No functional edits — pure cleanup.
- **Green gate per task:** `npm run build` succeeds AND `npm test -- --watch=false --browsers=ChromeHeadless` = **21/21**. FOREGROUND only.
- App dir `spotmap-website/`; git root = repo root. Conventional-commit prefixes.

## Task 1: Dead code + CSS/token cleanup (Opus)
**Verify each item is genuinely unused (grep the template + TS) BEFORE removing.**
- **5 unused imports (NG8113 — removing all clears every NG8113 warning):**
  - `app.component.ts:9` — `MapContainerComponent` (not used in AppComponent template; the intro/nav/router-outlet don't reference `<app-map-container>`). Remove import + from `imports:[]`.
  - `loading-bar.component.ts:8` — `AsciiAnimationTextComponent` AND `GlitchTextDirective` (neither used in loading-bar template). Also drop the now-unused `CommonModule` import (template uses no CommonModule feature after the Stage-6 `@for` migration). Remove all three.
  - `nav-bar.component.ts:15` — `AsciiAnimationTextComponent` (unused). Remove.
  - `map.component.ts:20` — `GlitchTextDirective` (unused). Remove.
  (Keep every import that IS used — e.g. map.component still needs `CommonModule` for `| keyvalue`, `MatSelectModule`, etc.)
- **Dead fields:** `app.component.ts` — `mapsLink` (hardcoded URL) and `headerText` (ASCII string) are not referenced by `app.component.html` (verify: template only uses `introFinished`, the ascii intro, nav links, router-outlet). Remove both.
- **Unused route import:** `app.routes.ts:5` imports `AppComponent` but never uses it in `Routes`. Remove the import.
- **Vestigial markup:** `map.component.html:~34,43` — the `<ng-container>` that wrapped the old `*ngFor` is no longer needed under `@for` (which needs no host element). Remove the wrapper, keep its children/`<mat-optgroup>` intact. Verify rendered output identical.
- **Dead CSS rule:** `map-container.component.css` — `.map-frame.visible` rule is never applied (opacity is driven by `[style.opacity]`, no template binding sets the `visible` class). Remove it.
- **CSS token polish (same file):** `map-container.component.css` — drop the redundant `var(--dur-fast, 200ms)` fallback (‑fast is defined in styles.css); replace the hardcoded retry-hover `box-shadow: 0 0 20px rgba(0,255,0,0.4)` with the `--glow-edge-active` token (closest DESIGN §5 match). `theme.scss` — remove the inert `--mat-sys-corner-small` line (verified: no Material component this app uses reads it; only `corner-extra-small` is consumed).
- **Dead dependency:** verify `lite-server` (in `dependencies`) is referenced nowhere (no script/config/import) → `npm uninstall lite-server`. If ANY reference exists, keep it and note.
- **Stray cruft:** `spotmap-website/src/.impeccable/hook.cache.json` is an impeccable hook cache in the source tree. Add an appropriate ignore for impeccable caches (e.g. `.impeccable/` cache) to `.gitignore` and remove the stray file. Do NOT touch the ROOT `.impeccable/design.json` (intentional design artifact, uncommitted).
- **Gate + commit** `chore: remove dead code and tidy component CSS`. Report NG8113 count before/after (target 0), items removed, and confirm build+21/21.

## Task 2: README + test cleanup (Sonnet)
- **README.md** (repo root or app dir — put it where the current one is; there's a boilerplate `spotmap-website/README.md`): replace the Angular-CLI boilerplate with a real README: one-line what-it-is (a matrix/phosphor-terminal skate-spot map — see PRODUCT.md/DESIGN.md at repo root for the design system), tech stack (Angular 22 standalone + signals + OnPush, Angular Material M3 custom theme, Tailwind v4, IBM Plex Mono), dev commands (`npm ci`, `npm start`, `npm run build`, `npm test`), project structure blurb, and a note that the map is a Google My Maps embed. Keep it concise and accurate — do NOT invent features.
- **Test leak:** `map.component.spec.ts` — the two localStorage/storage tests create a component (starting the 45ms interval) but never call `fixture.destroy()`, leaking a timer per test. Add `fixture.destroy()` (or an `afterEach(() => fixture.destroy())`) so the interval is cleared. Keep all assertions; suite stays 21/21.
- **Gate + commit** `docs: real README; chore: fix leaked interval in map spec` (or split into two commits). Report.

## Task 3: Prettier + format pass (Opus; LAST — depends on T1, T2)
- Read `.editorconfig` first and mirror its rules in `.prettierrc` (indent size/style, EOL, final newline, quotes if specified). Add `prettier` as a **devDependency** (`npm install -D prettier`). Add a `"format": "prettier --write \"src/**/*.{ts,html,css,scss,json}\""` script (and a `"format:check"` variant) to `package.json`.
- Run `npm run format` over `src/` (+ root config files if sensible). This normalizes the mixed 2-space/4-space indentation the schematics introduced. Also restore the `package.json` trailing newline lost during `ng update`.
- **This produces a large diff** — that's expected. Verify it's ONLY whitespace/formatting (no semantic changes): `git diff --stat`, spot-check a few files, and CRUCIALLY the gate must stay green (build + **21/21**) — formatting must not alter behavior. Ensure Prettier doesn't fight the ASCII-art template literals or the matrix templates (Prettier may reflow HTML — verify the ASCII grids / `<pre>` content and `[style.*]="'calc(...)'"` bindings are untouched or still correct; if Prettier mangles ASCII art, add a `.prettierignore` for those files and note it).
- **Gate + commit** `chore: add Prettier and format codebase`. Report the config, the diff stat, any `.prettierignore` needed, and gate results.

## Stage 7 completion
Controller runs a whole-branch review of the Stage 7 range and a quick visual re-verify (the format pass especially — confirm ASCII art + matrix animations still render) before Stage 8 (a11y/UX + Home/About content + flag-emoji).
