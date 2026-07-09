# Vienna Spotmap — Audit Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. A fresh subagent implements each task; a separate reviewer subagent gates each task before integration.

**Goal:** Bring the Vienna Spotmap Angular app to production readiness across correctness, design-system, architecture, and polish — without changing its matrix/terminal look or animation behavior.

**Architecture:** Staged, gated program on branch `refactor/audit-p0-p3`. Each stage ends green (`ng build` + `ng test` pass) and is a reviewable checkpoint. Stage 0 (this document, fully detailed) stabilizes the app. Stages 1–9 are planned just-in-time at their gates because they depend on gated outcomes (the Angular upgrade result and the Impeccable design pipeline).

**Tech Stack:** Angular (standalone + signals), Angular Material, Tailwind (target v4), TypeScript, Karma/Jasmine, GitHub Pages CI.

## Global Constraints

- **Never push to `main`.** The GH Actions workflow (`.github/workflows/deploy-angular.yml`) deploys on `push: branches: [main]`. All work stays on `refactor/audit-p0-p3`; commits are local; no push until the user explicitly approves.
- **Preserve behavior & timing.** Do not change animation logic, durations, spawn rates, or glitch probabilities unless the task explicitly says so. The only proposed behavioral addition is an opt-in skippable intro (P3, item #23) — build only if greenlit.
- **Standalone + signals.** All components standalone; use `input()`/`output()`/`signal()`/`computed()` — no `@Input()`/`@Output()`/`EventEmitter` unless there is a documented reason.
- **No new dependencies** beyond Tailwind (+ its build tooling) and the Angular-update packages, without asking first.
- **Preserve the matrix aesthetic** (dark bg, monospace, green-on-black, subtle glow) at every step.
- **Version targets (verified against npm 2026-07-07):** Angular latest stable `22.0.5` (from `18.2.13`); `@angular/material` `22.0.3`; Tailwind `4.3.2` (fallback `3.4.19`). CI Node = `22`.
- **Project root vs app root:** git root is `/Users/konstantin/Programming/spotmap-website`; the Angular app is in the `spotmap-website/` subdir. Run `ng`/`npm` from the app subdir. All file paths below are relative to the app subdir `spotmap-website/` unless noted.

## Model Routing (subagent dispatch)

- **Opus 4.8** — complex tasks: the Angular 18→22 upgrade (Stage 1), the design-token + Tailwind + Material M3 system (Stages 3–5), the ASCII glyph-measurement rework, and the folder restructure.
- **Sonnet 5** — straightforward tasks: all of Stage 0 (P0), dead-code removal, docs, Home/About content.
- **Sonnet 5** — all reviewer subagents (both correctness and requirements review), every task.

---

## Program Roadmap (stages & gates)

| Stage | Goal | Gate / fallback | Complexity |
|---|---|---|---|
| **0. Stabilization (P0)** — *this plan* | Fix leaks/crashes/broken tests → suite 10/10 green, no leaks | Baseline for all later work | Sonnet |
| 1. Platform upgrade *(gated)* | `ng update` 18→19→20→21→22 stepwise + TS bump, then Tailwind v4 | Green at each major or **hold at last green major**; Tailwind **falls back to 3.4** | Opus |
| 2. Impeccable design pipeline | `/impeccable init` → critique → layout → contrast/color → typography → motion → polish | Produces `PRODUCT.md` + design direction feeding Stages 3–5 & P3 | — |
| 3. Design tokens | Encode matrix identity (color/type/space/anim/breakpoints) as CSS vars + Tailwind theme | SSOT before any style migration | Opus |
| 4. Drop Bootstrap | Migrate Bootstrap utilities/grid → Tailwind; remove dep + `angular.json` entry | Re-check bundle budget | Opus |
| 5. Material M3 theme | Custom green theme + `--mat-*` token overrides at global scope | Removes all `::ng-deep`/`!important` | Opus |
| 6. Architecture + API (P1) | Signals API, ASCII glyph measurement, zone/perf, router-driven nav | Behavior/timing preserved | Opus/Sonnet |
| 7. Cleanup (P2) | Dead code, magic numbers, folder restructure, docs | — | Sonnet |
| 8. A11y + UX + content (P3) | Accessibility, opt-in skippable intro, Home/About content, error states | — | Sonnet |
| 9. Finalize | Retune budgets, lazy-load routes, full verify | 10/10 green + build clean | Sonnet |

### Decision deferred to the Stage 1 gate
Angular is **18→22 (four majors)**. At the Stage 0→1 boundary, ask the user to confirm: attempt the full climb (gated, reversible) or cap it (e.g. stop at v20 LTS). Do not begin Stage 1 without that answer.

---

## Prioritised backlog (traceability — full P0–P3)

**P0 (Stage 0, detailed below):** resize-listener leak; MutationObserver leak; localStorage crash guard; three broken specs (AppComponent stale assertion, MapContainer NG0904, MapComponent NG05105).

**P1 (Stages 3–6):** design-token SSOT; Tailwind migration; Bootstrap removal; Material M3 theme (color-render root-cause fix); ASCII I/O → signals API; reliable ASCII glyph measurement (also fixes the global-`querySelector` scoping bug); animation perf (run tickers outside zone / rAF, stop idle glitch interval, iframe `loading="lazy"`); router-driven nav active state.

**P2 (Stage 7):** dead-code removal (`headerText`/`mapsLink`/unused imports/`maskedColumnsArrow`/`stopAnimation`/`MapEnum`/`CountryEnum`); centralize magic numbers; folder restructure (`modules/`→`features/`+`shared/`, flatten `models/`); split the ASCII phase engine into a tested helper; remove empty lifecycle hooks; add `CLAUDE.md` + real README + inline docs; convert `styles.css`→`styles.scss` (M3 prerequisite).

**P3 (Stage 8):** accessibility (iframe `title`, `aria-hidden` decorative `<pre>`, `aria-current`, emoji labels, focus states); opt-in skippable intro; matrix-styled Home/About content; bundle-budget retune + route lazy-loading; map error/timeout fallback.

---

# STAGE 0 — Stabilization (P0)

**Deliverable:** all unit tests pass (target ≥ 11/11 after new tests), the two memory leaks are fixed and covered by tests, and `localStorage` access can't crash the map page. No visual or behavioral change.

**File structure touched in Stage 0:**
- `src/app/modules/components/ascii-animation-text/ascii-animation-text.component.ts` — add resize-listener teardown.
- `src/app/modules/components/ascii-animation-text/ascii-animation-text.component.spec.ts` — add teardown test.
- `src/app/modules/directives/glitch-text.directive.ts` — store + disconnect observer.
- `src/app/modules/directives/glitch-text.directive.spec.ts` — **create** (host-component test).
- `src/app/modules/pages/map/map.component.ts` — guard `localStorage`.
- `src/app/modules/pages/map/map.component.spec.ts` — add animations provider + storage tests.
- `src/app/modules/components/map-container/map-container.component.ts` + `.html` — `safeUrl` `effect`→`computed`.
- `src/app/modules/components/map-container/map-container.component.spec.ts` — set required input.
- `src/app/app.component.spec.ts` — rewrite stale assertion.

**Task order (dependencies):** Task 1 and Task 2 are independent. Task 3 (map animations provider) must precede Task 4 (map storage tests). Task 5 and Task 6 are independent. Task 7 is final verification.

---

### Task 1: Fix window-resize-listener leak in AsciiAnimationTextComponent

**Files:**
- Modify: `src/app/modules/components/ascii-animation-text/ascii-animation-text.component.ts:60-75`
- Test: `src/app/modules/components/ascii-animation-text/ascii-animation-text.component.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no public API change. `ngOnDestroy` now also removes the `resize` listener.

- [ ] **Step 1: Write the failing test** — append to the existing `describe` block in `ascii-animation-text.component.spec.ts`:

```ts
it('removes its window resize listener on destroy', () => {
  const added = new Map<string, EventListenerOrEventListenerObject>();
  spyOn(window, 'addEventListener').and.callFake(
    (type: string, cb: EventListenerOrEventListenerObject) => added.set(type, cb),
  );
  const removeSpy = spyOn(window, 'removeEventListener').and.callThrough();

  const f = TestBed.createComponent(AsciiAnimationTextComponent);
  f.detectChanges(); // triggers ngAfterViewInit -> addEventListener('resize', ...)
  const handler = added.get('resize');
  expect(handler).withContext('resize listener should be registered').toBeDefined();

  f.destroy();

  expect(removeSpy).toHaveBeenCalledWith('resize', handler!);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include='**/ascii-animation-text.component.spec.ts'`
Expected: FAIL — `removeEventListener` not called with the resize handler.

- [ ] **Step 3: Write minimal implementation** — in `ascii-animation-text.component.ts`, update `ngOnDestroy` (currently lines 71-75) to also remove the listener:

```ts
ngOnDestroy() {
  if (this.interval) {
    clearInterval(this.interval);
  }
  if (this.resizeListener) {
    window.removeEventListener('resize', this.resizeListener);
    this.resizeListener = undefined;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include='**/ascii-animation-text.component.spec.ts'`
Expected: PASS (both `should create` and the new teardown test).

- [ ] **Step 5: Commit** (local branch only)

```bash
git add spotmap-website/src/app/modules/components/ascii-animation-text/
git commit -m "fix: remove window resize listener on AsciiAnimationText destroy"
```

---

### Task 2: Fix MutationObserver leak in GlitchTextDirective

**Files:**
- Modify: `src/app/modules/directives/glitch-text.directive.ts:8-41` (add field + disconnect in destroy)
- Test: `src/app/modules/directives/glitch-text.directive.spec.ts` (**create**)

**Interfaces:**
- Consumes: nothing new.
- Produces: no public API change. `ngOnDestroy` now disconnects the class-observing `MutationObserver`.

- [ ] **Step 1: Write the failing test** — create `glitch-text.directive.spec.ts`:

```ts
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GlitchTextDirective } from './glitch-text.directive';

@Component({
  standalone: true,
  imports: [GlitchTextDirective],
  template: `<a appGlitchText><span class="nav-text">Map</span></a>`,
})
class HostComponent {}

describe('GlitchTextDirective', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('disconnects its MutationObserver on destroy', () => {
    const disconnectSpy = spyOn(MutationObserver.prototype, 'disconnect').and.callThrough();
    fixture.destroy();
    expect(disconnectSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include='**/glitch-text.directive.spec.ts'`
Expected: FAIL — `disconnect` never called (observer isn't stored/torn down).

- [ ] **Step 3: Write minimal implementation** — in `glitch-text.directive.ts`:

Add a field near the other private fields (after line 11):

```ts
  private observer?: MutationObserver;
```

In `checkActive()`, store the observer instead of leaving it anonymous (replace the `const observer = new MutationObserver(...)` / `observer.observe(...)` block):

```ts
    this.observer = new MutationObserver(() => {
      if (a.classList.contains('active')) {
        this.startGlitch();
      } else if (!a.matches(':hover')) {
        this.stopGlitch();
        if (this.textNode) this.textNode.innerText = this.originalText;
      }
    });

    this.observer.observe(a, { attributes: true, attributeFilter: ['class'] });
```

Update `ngOnDestroy` (currently lines 20-22):

```ts
  ngOnDestroy() {
    this.stopGlitch();
    this.observer?.disconnect();
    this.observer = undefined;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include='**/glitch-text.directive.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add spotmap-website/src/app/modules/directives/
git commit -m "fix: disconnect GlitchText MutationObserver on destroy"
```

---

### Task 3: Provide animations in the MapComponent test bed (fix NG05105)

**Files:**
- Modify: `src/app/modules/pages/map/map.component.spec.ts`

**Interfaces:**
- Consumes: `provideNoopAnimations` from `@angular/platform-browser/animations`.
- Produces: a green `MapComponent` `should create` test that later tasks (Task 4) extend.

- [ ] **Step 1: Edit the spec** — set `map.component.spec.ts` `configureTestingModule` to provide no-op animations:

```ts
import { provideNoopAnimations } from '@angular/platform-browser/animations';
// ...
await TestBed.configureTestingModule({
  imports: [MapComponent],
  providers: [provideNoopAnimations()],
}).compileComponents();
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include='**/map.component.spec.ts'`
Expected: PASS — `MapComponent should create` no longer throws NG05105.

- [ ] **Step 3: Commit**

```bash
git add spotmap-website/src/app/modules/pages/map/map.component.spec.ts
git commit -m "test: provide no-op animations for MapComponent spec"
```

---

### Task 4: Guard localStorage access in MapComponent

**Files:**
- Modify: `src/app/modules/pages/map/map.component.ts:40-49,80-84`
- Test: `src/app/modules/pages/map/map.component.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ngOnInit` and `selectCity` no longer throw if `localStorage` is unavailable; `selectedCity()` defaults to Vienna on read failure.

- [ ] **Step 1: Write the failing test** — add to `map.component.spec.ts` (reuse the component/fixture from the existing block or inject fresh):

```ts
it('falls back to Vienna when localStorage.getItem throws', () => {
  spyOn(localStorage, 'getItem').and.throwError('SecurityError');
  const f = TestBed.createComponent(MapComponent);
  expect(() => f.detectChanges()).not.toThrow();
  expect(f.componentInstance['selectedCity']().city).toBe(CityEnum.Vienna);
});

it('does not throw when localStorage.setItem throws', () => {
  spyOn(localStorage, 'setItem').and.throwError('QuotaExceeded');
  const f = TestBed.createComponent(MapComponent);
  f.detectChanges();
  const anyCity = SUPPORTED_CITIES[CityEnum.Graz];
  expect(() => f.componentInstance.selectCity(anyCity)).not.toThrow();
});
```

Add imports at top of the spec: `import { CityEnum } from '../../../models/enums/map-enum';` and `import { SUPPORTED_CITIES } from '../../../models/enums/config';`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include='**/map.component.spec.ts'`
Expected: FAIL — an unhandled error escapes `ngOnInit`/`selectCity`.

- [ ] **Step 3: Write minimal implementation** — in `map.component.ts`, replace the direct `localStorage` calls with guarded private helpers. Update `ngOnInit`:

```ts
  ngOnInit() {
    const userCity = this.readStoredCity();
    if (userCity && SUPPORTED_CITIES[userCity as CityEnum]) {
      this.selectedCity.set(SUPPORTED_CITIES[userCity as CityEnum]);
    }

    this.citiesGroupedByCountry.set(this.citiesByCountry());
  }

  private readStoredCity(): string | null {
    try {
      return localStorage.getItem(this.localStorageKeyUserCity);
    } catch {
      return null;
    }
  }

  private storeCity(cityKey: string): void {
    try {
      localStorage.setItem(this.localStorageKeyUserCity, cityKey);
    } catch {
      /* storage unavailable (private mode / blocked cookies) — non-fatal */
    }
  }
```

Update `selectCity`:

```ts
  selectCity(city: MapItem) {
    this.selectedCity.set(city);
    this.storeCity(city.city);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include='**/map.component.spec.ts'`
Expected: PASS (create + both storage tests).

- [ ] **Step 5: Commit**

```bash
git add spotmap-website/src/app/modules/pages/map/
git commit -m "fix: guard localStorage access in MapComponent against storage errors"
```

---

### Task 5: Make MapContainer safeUrl a computed and fix its spec (fix NG0904)

**Files:**
- Modify: `src/app/modules/components/map-container/map-container.component.ts:15-40`
- Modify: `src/app/modules/components/map-container/map-container.component.html:2`
- Test: `src/app/modules/components/map-container/map-container.component.spec.ts`

**Interfaces:**
- Consumes: `computed` from `@angular/core`; `CityEnum` from the map enum.
- Produces: `safeUrl` becomes a `Signal<SafeResourceUrl>` (call as `safeUrl()`), always defined once `city` is set. Template binding becomes `[src]="safeUrl()"`.

- [ ] **Step 1: Write the corrected test** — rewrite `map-container.component.spec.ts` `beforeEach`/test to set the required input:

```ts
import { CityEnum } from '../../../models/enums/map-enum';
// ...
beforeEach(async () => {
  await TestBed.configureTestingModule({
    imports: [MapContainerComponent],
  }).compileComponents();

  fixture = TestBed.createComponent(MapContainerComponent);
  fixture.componentRef.setInput('city', CityEnum.Vienna);
  component = fixture.componentInstance;
  fixture.detectChanges();
});

it('should create', () => {
  expect(component).toBeTruthy();
});

it('exposes a sanitized url for the selected city', () => {
  expect(component.safeUrl()).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include='**/map-container.component.spec.ts'`
Expected: FAIL — `safeUrl` is not yet a callable signal (or still NG0904 with the old `effect`).

- [ ] **Step 3: Write minimal implementation** — in `map-container.component.ts`, replace the `effect`-based `safeUrl` field with a `computed`:

```ts
import { Component, computed, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SUPPORTED_CITIES } from '../../../models/enums/config';
import { CityEnum } from '../../../models/enums/map-enum';
import { LoadingBarComponent } from '../loading-bar/loading-bar.component';

@Component({
  selector: 'app-map-container',
  standalone: true,
  imports: [LoadingBarComponent],
  templateUrl: './map-container.component.html',
  styleUrl: './map-container.component.css',
})
export class MapContainerComponent {
  city = input.required<CityEnum>();

  readonly safeUrl = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(SUPPORTED_CITIES[this.city()].mapLink),
  );

  protected iframeLoaded = signal(false);

  constructor(private sanitizer: DomSanitizer) {}

  onIframeLoad() {
    setTimeout(() => this.iframeLoaded.set(true), 700);
  }
}
```

Update `map-container.component.html:2` binding from `[src]="safeUrl"` to `[src]="safeUrl()"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include='**/map-container.component.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add spotmap-website/src/app/modules/components/map-container/
git commit -m "fix: derive MapContainer safeUrl via computed; set required input in spec"
```

---

### Task 6: Rewrite the stale AppComponent spec

**Files:**
- Modify: `src/app/app.component.spec.ts`

**Interfaces:**
- Consumes: `provideRouter` from `@angular/router`; `Router` for spying.
- Produces: `AppComponent` specs that reflect the real template (intro shown before finish; nav hidden).

- [ ] **Step 1: Rewrite the spec** — replace `app.component.spec.ts` contents:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it(`should have the 'spotmap-website' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.title).toEqual('spotmap-website');
  });

  it('shows the intro animation and hides the nav before the intro finishes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-ascii-animation-text')).toBeTruthy();
    expect(el.querySelector('app-nav-bar')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include='**/app.component.spec.ts'`
Expected: PASS (all three).

- [ ] **Step 3: Commit**

```bash
git add spotmap-website/src/app/app.component.spec.ts
git commit -m "test: rewrite stale AppComponent spec to match real template"
```

---

### Task 7: Full-suite verification gate

**Files:** none (verification only).

- [ ] **Step 1: Run the whole suite**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: `TOTAL: 0 FAILED` — every spec green (≥ 11 tests: originals minus the 3 fixed failures, plus the 4 new tests).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds. (Bundle-budget warnings are expected and are addressed in Stages 4/9 — they are not a Stage 0 failure.)

- [ ] **Step 3: Confirm no behavior change** — visually diff is unnecessary; confirm no `.ts`/`.html` logic outside the listed files changed via `git diff --stat main..HEAD`.

- [ ] **Step 4: Stop at the Stage 0→1 gate.** Report results to the user and ask the deferred Angular-upgrade-appetite question before any Stage 1 work.

---

## Later stages (planned just-in-time)

Stages 1–9 are **not** detailed here on purpose: their concrete steps depend on (a) how far the gated Angular upgrade gets and (b) the Impeccable pipeline's design decisions. Each will get its own `docs/superpowers/plans/YYYY-MM-DD-<stage>.md`, written at the start of that stage, following the same bite-sized TDD structure. The roadmap table and the P1–P3 backlog above define their scope and acceptance criteria.

## Self-Review notes

- **Spec coverage:** Stage 0 covers every P0 item from the audit (2 leaks, 3 broken specs, localStorage crash). P1–P3 are mapped in the backlog to Stages 3–9. The one reclassification vs. the Phase 1 audit: the ASCII global-`querySelector` scoping bug moves from P0 to P1, folded into the glyph-measurement rework (#13), because in the current single-visible-instance layout it is latent, not an active crash — noted for the user.
- **Placeholder scan:** no TBD/TODO inside Stage 0 tasks; all test and impl code is concrete.
- **Type consistency:** `safeUrl` is a `computed` signal (called `safeUrl()`) in both the component (Task 5 impl) and template; `readStoredCity`/`storeCity` names match between impl and usage; `provideNoopAnimations`/`provideRouter` imports specified.
