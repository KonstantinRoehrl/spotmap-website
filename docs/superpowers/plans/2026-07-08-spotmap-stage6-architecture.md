# Stage 6 — Architecture / API Modernization Plan

> subagent-driven-development. Opus implementers for judgment tasks (signals/measurement, router, OnPush), Sonnet for the mechanical control-flow migration + all reviews. Controller visually re-verifies animations. Pipelined (review N || impl N+1). Base: `6e6d4dd`.

**USER DECISION (recorded):** Change-detection scope = **OnPush + signals, keep Zone.js** (NOT zoneless). All 10 components currently carry the v22-migration `ChangeDetectionStrategy.Eager` compatibility default; state is already signal-driven (low-risk migration).

**Goal:** Modernize to current Angular idioms without changing behavior or the matrix aesthetic: new `@for` control flow (correct `track`), signal `input()/output()`, a reliable ASCII glyph-measurement, router-driven navigation (kill the unawaited `router.navigate`), and OnPush change detection across all components.

## Global Constraints
- **NEVER push.** Local commits only, branch `refactor/audit-p0-p3`.
- Preserve behavior + all animation timing (typewriter 35ms, glitch 80ms, matrix loader, nav glow) and the matrix look. Consume existing design tokens.
- **Green gate per task:** `npm run build` succeeds AND `npm test -- --watch=false --browsers=ChromeHeadless` = **19/19** (baseline raised from 15 in Stage 5). Run ALL build/test/git commands in the FOREGROUND — never background.
- App dir `spotmap-website/` (ng/npm); git root = repo root (git). Conventional-commit prefixes.

## Task 1: `*ngFor` → `@for` control flow (Sonnet)
**Files:** `src/app/modules/components/loading-bar/loading-bar.component.html`, `src/app/modules/pages/map/map.component.html`.
- **loading-bar** (matrix grid, 2 nested loops): values repeat, so **MUST `track $index`** (tracking by char/column caused NG0955 duplicate-key — see S1.T3 note). Preserve the index vars used in the style bindings:
  ```
  @for (column of maskedColumns(); track $index; let colIndex = $index) {
    <div class="matrix-column" [style.left]="'calc(' + colIndex + ' * var(--column-width) + ' + colIndex + ' * var(--column-gap))'">
      @for (char of column; track $index; let rowIndex = $index) {
        <span class="matrix-char" [style.top]="'calc(' + rowIndex + ' * var(--row-height) + ' + rowIndex + ' * var(--row-gap))'">{{ char }}</span>
      }
    </div>
  }
  ```
- **map** (city select): outer `@for (entry of citiesGroupedByCountry() | keyvalue; track entry.key)`, inner `@for (city of entry.value; track city.city)` (`city` is a `MapItem`; `.city` is the unique `CityEnum`). Keep the `<mat-optgroup>`/`<mat-option [value]="city">` structure and existing labels (incl. the flag-emoji labels — those are a separately-tracked Stage 8 item, don't touch here).
- No `@empty` unless a list is genuinely emptyable. Rendered output identical.
- **Gate + commit** `refactor: migrate *ngFor to @for control flow`. Report the 4 loops migrated + track exprs.

## Task 2: Modernize `ascii-animation-text` — signal input/output + reliable glyph measurement (Opus)
**Files:** `ascii-animation-text.component.ts`, `.spec.ts`, and `src/app/app.component.html` if a binding needs touching (signal in/out bind identically, so likely no template change).
- `@Input() messages: string[]` → `messages = input<string[]>([...current default])`; update internal reads to `this.messages()`. `@Output() animationFinished = new EventEmitter<void>()` → `animationFinished = output<void>()` (keep `.emit()`).
- **Reliable glyph measurement:** investigate the current monospace character-width measurement (how the ASCII grid sizes columns). Make it robust — measure the real rendered advance of `--font-mono` (e.g. canvas `measureText` with the computed font, or a hidden measuring element), recompute on resize (keep the Stage-0 resize-listener cleanup), and guard against a zero/NaN measurement (no-DOM/pre-layout). The ASCII art grid MUST stay aligned in IBM Plex Mono. Do not change the animation cadence.
- Update the spec for signal input/output and any measurement helper. **Gate + commit** `refactor: signal input/output + reliable glyph measurement in ascii-animation-text`. Report the API change, the measurement approach before/after, and how misalignment is prevented.

## Task 3: Router-driven navigation (Opus)
**Files:** `app.component.ts`, `app.component.html`, possibly `nav-bar.component.*`, `app.routes.ts`.
- Fix the **unawaited `this.router.navigate([''])`** in `AppComponent.ngOnInit` (P1 finding #15 — wildcard `**→home` currently masks it). Make the intro→content flow explicit/awaited and router-driven; the nav-bar already uses `RouterLink`. Ensure `onIntroFinished()` navigation is handled (awaited or `.then`/error-handled), no reliance on the wildcard to paper over a failed navigate. Keep the default landing behavior identical (intro then home/map as today).
- **Gate + commit** `refactor: router-driven navigation`. Report the flow before/after.

## Task 4: Adopt OnPush change detection across all components (Opus; LAST — depends on T1–T3)
**Files:** all 10 component `.ts` decorators.
- Change `ChangeDetectionStrategy.Eager` → `ChangeDetectionStrategy.OnPush` in every component. Verify each still renders live: signal writes auto-mark dirty; `@HostListener` events auto-mark the host; `setInterval`/`setTimeout` callbacks that write signals auto-mark. **Watch for** any template binding fed by a value mutated imperatively WITHOUT a signal (would go stale under OnPush) — if found, convert that state to a signal. Directives (glitch-text) manipulate host DOM directly and are unaffected by CD strategy.
- **Gate + commit** `perf: adopt OnPush change detection across components`. Report any state converted to signals to satisfy OnPush.
- Controller then does a **full visual verification** (intro typewriter, glitch scramble, matrix loader, nav hover-glow + active tab, map load + select) — every animation must be intact under OnPush.

## Stage 6 completion
Controller runs a whole-branch review of the Stage 6 range and the OnPush visual re-verification before Stage 7 (cleanup/dead-code/docs/format — the worktree-parallel stage).
