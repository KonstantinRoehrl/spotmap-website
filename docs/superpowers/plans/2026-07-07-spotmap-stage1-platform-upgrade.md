# Stage 1 — Platform Upgrade Plan (Angular 18→22 + Tailwind v4)

> **For agentic workers:** executed via superpowers:subagent-driven-development. This stage is an incremental dependency upgrade, not TDD feature work — each task runs `ng update`, applies migration schematics, fixes breakages, and must pass the same green gate before commit.

**Goal:** Bring the app from Angular 18.2 to the latest stable (v22) one major at a time, then adopt Tailwind v4 — keeping the suite green and behavior unchanged at every step.

**Approach:** Gated stepwise `ng update`. Each major is one task; a major is only committed once `ng build` succeeds and `ng test` is 15/15 green. If a major cannot be made green with reasonable effort, STOP and hold at the last green major (report to controller) rather than forcing it.

**Model routing:** Opus 4.8 implementers (upgrades need judgment on breakages/Material theming), Sonnet 5 reviewers.

## Global Constraints

- **NEVER push.** Local commits only, branch `refactor/audit-p0-p3`. Pushing `main` triggers a prod deploy.
- **Preserve behavior & the matrix aesthetic.** Migration schematics may rewrite code; verify the app still builds and all 15 tests pass. Do not change animation logic/timing/values.
- **Green gate per task (all must hold before commit):**
  1. `npm run build` succeeds (pre-existing bundle-budget + `::ng-deep`/Bootstrap `.form-floating` warnings are allowed — they are cleared in later stages; a *new* error is not).
  2. `npm test -- --watch=false --browsers=ChromeHeadless` → **15/15 SUCCESS**.
- **Environment:** Node v22.16.0, npm 10.9.2 (verified — satisfies all majors through v22). App dir: `/Users/konstantin/Programming/spotmap-website/spotmap-website` (run `ng`/`npm` here). Git root: `/Users/konstantin/Programming/spotmap-website` (run `git` here).
- **Run all test/build commands in the FOREGROUND** (never `run_in_background`/`&` — backgrounded runs stall subagents).
- **Commit message style:** keep the branch's conventional-commit prefixes (`chore:` for upgrades) for consistency with Stage 0.
- **`ng update` dirty-tree note:** the tracked tree is clean (Stage 0 committed); untracked `docs/` and git-ignored `.superpowers/` do not block `ng update`. If `ng update` still refuses, pass `--allow-dirty` (never commit the docs/scratch as part of an upgrade commit).

---

## Task 1: Angular 18 → 19 (core, cli, cdk, material)

**Files:** `package.json`, `package-lock.json`, and whatever the v19 migration schematics touch under `src/`.

- [ ] **Step 1:** From the app dir, run: `npx ng update @angular/core@19 @angular/cli@19`
- [ ] **Step 2:** Then run: `npx ng update @angular/cdk@19 @angular/material@19` (let all migration schematics apply).
- [ ] **Step 3:** Fix any resulting build/test breakages. Likely areas: TypeScript floor bump; `@angular/material` theming API changes; any newly-flagged deprecations. Keep changes minimal and behavior-preserving.
- [ ] **Step 4 (gate):** `npm run build` succeeds AND `npm test -- --watch=false --browsers=ChromeHeadless` is 15/15. If not green and you cannot resolve it cleanly, STOP and report BLOCKED with the specific breakage (do not force-commit red).
- [ ] **Step 5:** Commit (from git root):
```bash
git add spotmap-website/package.json spotmap-website/package-lock.json spotmap-website/src spotmap-website/angular.json spotmap-website/tsconfig*.json
git commit -m "chore: upgrade Angular 18 -> 19 (core, cli, cdk, material)"
```
Report the exact versions landed (`npx ng version`), the migration schematics that ran, any breakages fixed, and the gate results.

---

## Task 2: Angular 19 → 20

Same procedure as Task 1 with `@20`:
- [ ] `npx ng update @angular/core@20 @angular/cli@20`, then `npx ng update @angular/cdk@20 @angular/material@20`.
- [ ] Fix breakages (v20 is a likely spot for Material theming-mixin changes and stricter templates). Behavior-preserving only.
- [ ] **Gate:** build succeeds + 15/15 tests. STOP/BLOCKED if unresolvable.
- [ ] Commit: `git commit -m "chore: upgrade Angular 19 -> 20 (core, cli, cdk, material)"` (stage the same paths as Task 1).
Report versions, schematics, breakages, gate results.

---

## Task 3: Angular 20 → 21

Same procedure with `@21`:
- [ ] `npx ng update @angular/core@21 @angular/cli@21`, then `npx ng update @angular/cdk@21 @angular/material@21`.
- [ ] Fix breakages. **Gate:** build + 15/15. STOP/BLOCKED if unresolvable.
- [ ] Commit: `git commit -m "chore: upgrade Angular 20 -> 21 (core, cli, cdk, material)"`.
Report versions, schematics, breakages, gate results.

---

## Task 4: Angular 21 → 22

Same procedure with `@22`:
- [ ] `npx ng update @angular/core@22 @angular/cli@22`, then `npx ng update @angular/cdk@22 @angular/material@22`.
- [ ] Fix breakages. **Gate:** build + 15/15. STOP/BLOCKED if unresolvable.
- [ ] Commit: `git commit -m "chore: upgrade Angular 21 -> 22 (core, cli, cdk, material)"`.
Report final versions (`npx ng version`), schematics, breakages, gate results.

---

## Task 5: Adopt Tailwind v4 (fallback v3.4)

**Goal:** Install and wire Tailwind so utility classes work in templates, without yet migrating any styles (that is Stages 3–4). This task only proves the toolchain: a Tailwind utility applied to one element renders.

- [ ] **Step 1:** Install Tailwind v4 for the Angular esbuild/application builder. Prefer the official v4 setup (`tailwindcss@4` + `@tailwindcss/postcss` + a `.postcssrc.json` with the `@tailwindcss/postcss` plugin), and add `@import "tailwindcss";` to `src/styles.css`. If the v4 + Angular-builder integration cannot be made to build cleanly in reasonable effort, FALL BACK to Tailwind v3.4 (`tailwindcss@3.4` + `tailwind.config.js` with `content: ["./src/**/*.{html,ts}"]` + the three `@tailwind` directives). Report which path you used and why.
- [ ] **Step 2:** Add a temporary probe: apply a Tailwind utility (e.g. `class="underline"`) to a visible element, `npm run build`, confirm the generated CSS contains the utility, then REMOVE the probe (leave no probe markup committed).
- [ ] **Step 3 (gate):** `npm run build` succeeds AND `npm test -- --watch=false --browsers=ChromeHeadless` is 15/15. Do NOT let Tailwind's preflight/reset break existing styles enough to fail the build or tests; if preflight conflicts with the matrix look, note it for Stage 3 (don't fix styling here).
- [ ] **Step 4:** Commit: `git commit -m "chore: add Tailwind v4 (or v3.4 fallback) build integration"`.
Report the Tailwind version/path chosen, config files added, and gate results.

---

## Stage 1 completion

After Task 5 (or after holding at the last green major), the controller runs a whole-branch review of the Stage 1 range and reports the final Angular + Tailwind versions to the user before Stage 2 (Impeccable pipeline).
