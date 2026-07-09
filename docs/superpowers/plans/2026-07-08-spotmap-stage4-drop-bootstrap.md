# Stage 4 — Drop Bootstrap → Tailwind Plan

> Executed via superpowers:subagent-driven-development. Opus 4.8 implementer (template layout migration needs judgment), Sonnet 5 reviewer. Controller visually re-verifies after removal.

**Goal:** Remove the Bootstrap dependency by migrating its utility classes (used in templates) to Tailwind v4 equivalents, then deleting Bootstrap from the build — with the rendered layout unchanged. This removes ~302 kB of CSS and the unparseable-selector build warnings.

**Critical correctness note — spacing scales differ.** Bootstrap's `p/m` scale is `0,1,2,3,4,5 = 0, .25rem, .5rem, 1rem, 1.5rem, 3rem`. Tailwind's scale is `n × 0.25rem`. So map by VALUE, not by number:
- BS `*-0`→`0`; BS `*-1`(.25rem)→Tailwind `1`; BS `*-2`(.5rem)→`2`; BS `*-3`(1rem)→Tailwind `4`; BS `*-4`(1.5rem)→Tailwind `6`; BS `*-5`(3rem)→Tailwind `12`.

## Global Constraints

- **NEVER push.** Local commits only, branch `refactor/audit-p0-p3`.
- **Rendered layout must be unchanged** at every breakpoint (mobile ≤768 / desktop ≥769) — this is a like-for-like utility migration, not a redesign.
- Preserve behavior/animation timing and the matrix aesthetic. No new dependencies (Tailwind is already present).
- **Green gate per task:** `npm run build` succeeds AND `npm test -- --watch=false --browsers=ChromeHeadless` = **15/15**. Run all commands in the FOREGROUND.
- App dir: `/Users/konstantin/Programming/spotmap-website/spotmap-website` (run `ng`/`npm`). Git root: `/Users/konstantin/Programming/spotmap-website` (run `git`). Conventional-commit prefixes.

## Bootstrap → Tailwind class map (authoritative for this stage)

Display/flex: `d-flex`→`flex`, `d-block`→`block`, `d-inline-block`→`inline-block`, `flex-column`→`flex-col`, `flex-row`→`flex-row`, `flex-md-row`→`md:flex-row`, `justify-content-between`→`justify-between`, `justify-content-center`→`justify-center`, `align-items-center`→`items-center`, `flex-fill`→`flex-auto` (both are `flex:1 1 auto`; do NOT use `flex-1` which is `1 1 0%`).

Sizing: `w-100`→`w-full`, `h-100`→`h-full`.

Position: `position-relative`→`relative`, `position-absolute`→`absolute`, `top-0`→`top-0`, `start-0`→`left-0`.

Text: `text-center`→`text-center`, `text-md-start`→`md:text-left`.

Spacing (value-mapped!): `px-0`→`px-0`, `px-2`→`px-2`, `px-md-2`→`md:px-2`, `px-4`→`px-6`, `py-3`→`py-4`, `mb-3`→`mb-4`, `mb-md-0`→`md:mb-0`, `me-1`→`me-1`, `mx-auto`→`mx-auto`.

Grid columns → width fractions (Tailwind `w-N/12`): `col-12`→`w-full`, `col-md-8`→`md:w-8/12`, `col-md-4`→`md:w-4/12`, `col-md-10`→`md:w-10/12`, `col-lg-9`→`lg:w-9/12`, `col-xl-8`→`xl:w-8/12`.

Other: `user-select-none`→`select-none`, `border-0`→`border-0`.

No-ops to DROP: bare `flex-grow` (not a real Bootstrap utility — it needs `-0/-1`, so it currently does nothing; drop it, don't map to `grow`). The duplicate `h-100` on `.map-page` collapses to one `h-full`.

**Gutter caveat:** Bootstrap `.col-*` add horizontal gutter padding only via a `.row` ancestor's `--bs-gutter-x`. These templates have **no `.row`**, and each `col-*` element already carries explicit `px-*`/`px-md-*` (or none) — so the columns render with **no** default gutter today. Therefore map `col-*`→width-only (`w-*/12`) and keep the existing explicit `px-*`; do NOT add padding to replace a gutter that isn't rendering. Verify this visually (controller does after T2).

---

## Task 1: Migrate Bootstrap utility classes → Tailwind in templates

**Files (the 4 templates that use Bootstrap classes):** `src/app/app.component.html`, `src/app/modules/pages/map/map.component.html`, `src/app/modules/components/map-container/map-container.component.html`, `src/app/modules/components/nav-bar/nav-bar.component.html`. (loading-bar/ascii/home/about templates use only custom classes — leave them.)

- [ ] **Step 1:** In each template, replace every Bootstrap utility class with its Tailwind equivalent from the map above, preserving custom classes (`app-container`, `ascii-header`, `nav-bar`, `map-container`, `map-frame`, `nav-icon`, `map-page`, etc.) untouched. Bootstrap is still loaded at this point, so if a class is missed the layout won't break yet — but aim for zero Bootstrap classes remaining. Full class-string examples to convert:
  - `content-container flex-fill px-4` → `content-container flex-auto px-6`
  - `ascii-animation d-inline-block px-0` → `ascii-animation inline-block px-0`
  - `map-page d-flex flex-column flex-grow h-100 flex-fill col-12 col-md-10 col-lg-9 col-xl-8 h-100 mx-auto` → `map-page flex flex-col h-full flex-auto w-full md:w-10/12 lg:w-9/12 xl:w-8/12 mx-auto`
  - `d-flex flex-column flex-md-row justify-content-between align-items-center py-3` → `flex flex-col md:flex-row justify-between items-center py-4`
  - `ascii-header col-12 col-md-8 text-center text-md-start mb-3 mb-md-0 px-0 px-md-2` → `ascii-header w-full md:w-8/12 text-center md:text-left mb-4 md:mb-0 px-0 md:px-2`
  - `col-12 col-md-4 px-0 px-md-2` → `w-full md:w-4/12 px-0 md:px-2`
  - `flex-row h-100` → `flex-row h-full`
  - `h-100 w-100 user-select-none d-block` → `h-full w-full select-none block`
  - `map-container w-100 h-100 position-relative` → `map-container w-full h-full relative`
  - `w-100 h-100 border-0 map-frame` → `w-full h-full border-0 map-frame`
  - `position-absolute top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center` → `absolute top-0 left-0 w-full h-full flex justify-center items-center`
  - `user-select-none w-100` → `select-none w-full`
  - `nav-bar user-select-none` → `nav-bar select-none`
  - `ascii-display user-select-none` → `ascii-display select-none`
  - `nav-icon me-1` → `nav-icon me-1`
- [ ] **Step 2 (gate):** `npm run build` succeeds; `npm test …` 15/15. Bootstrap is still loaded (removed in Task 2), so the app must look identical. If a Tailwind fraction utility (`w-8/12` etc.) doesn't generate, confirm Tailwind v4 emits it (it does by default); otherwise report.
- [ ] **Step 3:** Commit: `git commit -m "refactor: migrate Bootstrap utility classes to Tailwind"` (stage the 4 templates).

Report: per-template the classes converted, any missed/ambiguous ones, and gate results.

---

## Task 2: Remove the Bootstrap dependency

**Files:** `angular.json` (styles array), `package.json` / `package-lock.json` (uninstall).

- [ ] **Step 1:** Remove the `"node_modules/bootstrap/dist/css/bootstrap.min.css"` entry from `angular.json` `build.options.styles` (and the `test` styles array if present — check; the test target's styles list does NOT include bootstrap per the audit, but verify).
- [ ] **Step 2:** `npm uninstall bootstrap` (updates package.json + lock).
- [ ] **Step 3:** Grep to confirm ZERO remaining Bootstrap class references in templates and no `bootstrap` import anywhere: `grep -rnE "\b(d-flex|d-block|d-inline-block|flex-column|flex-fill|col-[0-9]|col-(sm|md|lg|xl)-|w-100|h-100|position-(relative|absolute)|justify-content-|align-items-|px-[0-9]|py-[0-9]|mb-[0-9]|me-[0-9]|mx-auto|text-md-start|user-select-none|start-0)\b" src --include=*.html`. Any hit that is a Bootstrap class (not a Tailwind one you introduced — note `px-0/px-2/top-0/mx-auto/border-0/me-1/text-center` are identical in both and are fine) must be resolved. (`user-select-none`/`w-100`/`h-100`/`d-*`/`col-*`/`flex-fill`/`justify-content-*`/`align-items-*`/`position-*`/`py-3`/`mb-3`/`px-4`/`text-md-start`/`start-0` are Bootstrap-only and must be GONE.)
- [ ] **Step 4 (gate):** `npm run build` succeeds — the initial bundle should drop by ~250–300 kB and the `.form-floating`/button-group "rules skipped due to selector errors" warnings should be GONE (they came from Bootstrap). `npm test …` 15/15.
- [ ] **Step 5:** Commit: `git commit -m "chore: remove Bootstrap dependency"` (stage angular.json, package.json, package-lock.json).

Report: the bundle-size before/after (from build output), confirmation the Bootstrap selector-warnings disappeared, the grep result (zero BS classes), and gate results.

---

## Stage 4 completion
Controller runs a whole-branch review of the Stage 4 range AND a visual re-verification at mobile + desktop (boot app + screenshot) to confirm the layout is pixel-equivalent, before Stage 5 (Material terminal theme).
