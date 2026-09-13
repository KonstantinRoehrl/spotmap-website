# Graph Report - .  (2026-07-09)

## Corpus Check
- 58 files · ~151,848 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 274 nodes · 401 edges · 15 communities (12 shown, 3 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 49 edges (avg confidence: 0.8)
- Token cost: 267,277 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_App Shell, Routing & Pages|App Shell, Routing & Pages]]
- [[_COMMUNITY_Angular Build Config|Angular Build Config]]
- [[_COMMUNITY_Angular Project & Schematics|Angular Project & Schematics]]
- [[_COMMUNITY_Dev Tooling & npm Scripts|Dev Tooling & npm Scripts]]
- [[_COMMUNITY_Loader, Glitch FX & Motion Guard|Loader, Glitch FX & Motion Guard]]
- [[_COMMUNITY_Design Language & Product Docs|Design Language & Product Docs]]
- [[_COMMUNITY_Refactor Plan Architecture & A11y|Refactor Plan: Architecture & A11y]]
- [[_COMMUNITY_Map Page & City Data Model|Map Page & City Data Model]]
- [[_COMMUNITY_Refactor Plan Platform & Theming|Refactor Plan: Platform & Theming]]
- [[_COMMUNITY_Angular Runtime Dependencies|Angular Runtime Dependencies]]
- [[_COMMUNITY_ASCII Typewriter Engine|ASCII Typewriter Engine]]
- [[_COMMUNITY_Map Iframe State Machine|Map Iframe State Machine]]
- [[_COMMUNITY_App Icons & Brand Identity|App Icons & Brand Identity]]
- [[_COMMUNITY_Phosphor Palette & Glow Rules|Phosphor Palette & Glow Rules]]
- [[_COMMUNITY_Brand Personality & Audience|Brand Personality & Audience]]

## God Nodes (most connected - your core abstractions)
1. `AsciiAnimationTextComponent` - 18 edges
2. `AppComponent` - 16 edges
3. `MapContainerComponent` - 15 edges
4. `LoadingBarComponent` - 13 edges
5. `MapComponent` - 12 edges
6. `GlitchTextDirective` - 11 edges
7. `options` - 9 edges
8. `schematics` - 9 edges
9. `scripts` - 8 edges
10. `MapItem` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Time Travel Metaphor (Guiding Principle)` --semantically_similar_to--> `The Phosphor Archive (Creative North Star)`  [INFERRED] [semantically similar]
  PRODUCT.md → DESIGN.md
- `HomeComponent` --references--> `Terminal / Phosphor CRT Retro Aesthetic Pattern`  [INFERRED]
  spotmap-website/src/app/modules/pages/home/home.component.ts → spotmap-website/src/app/modules/pages/about/about.component.html
- `SPA 404.html Routing Fallback` --conceptually_related_to--> `Project Structure (src/app modules)`  [INFERRED]
  .github/workflows/deploy-angular.yml → spotmap-website/README.md
- `Project Structure (src/app modules)` --conceptually_related_to--> `Matrix Radar Loader (Signature)`  [INFERRED]
  spotmap-website/README.md → DESIGN.md
- `Project Structure (src/app modules)` --conceptually_related_to--> `GlitchText Navigation Effect`  [INFERRED]
  spotmap-website/README.md → DESIGN.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Phosphor Archive Named Design Rules** — design_two_phosphor_rule, design_no_white_rule, design_glow_is_the_shadow_rule, design_one_grid_rule, design_bloom_budget_rule [EXTRACTED 0.90]
- **Signature Terminal Components** — design_map_frame, design_ascii_animation, design_matrix_radar_loader, design_glitch_text [EXTRACTED 0.90]
- **Skate Identity & Archive Positioning** — product_compendium, product_users_street_skaters, product_brand_personality, product_time_travel_metaphor [INFERRED 0.85]
- **Staged Gated Refactor Program (Stage 0 → 9)** — docs_superpowers_plans_2026_07_07_spotmap_audit_refactor_program, docs_superpowers_plans_2026_07_07_spotmap_audit_refactor_stage0_stabilization, docs_superpowers_plans_2026_07_07_spotmap_audit_refactor_stage1_platform_upgrade, docs_superpowers_plans_2026_07_07_spotmap_audit_refactor_stage2_impeccable_pipeline, docs_superpowers_plans_2026_07_07_spotmap_audit_refactor_stage3_design_tokens, docs_superpowers_plans_2026_07_07_spotmap_audit_refactor_stage4_drop_bootstrap, docs_superpowers_plans_2026_07_07_spotmap_audit_refactor_stage5_material_theme, docs_superpowers_plans_2026_07_07_spotmap_audit_refactor_stage6_architecture, docs_superpowers_plans_2026_07_07_spotmap_audit_refactor_stage7_cleanup, docs_superpowers_plans_2026_07_07_spotmap_audit_refactor_stage8_a11y_ux, docs_superpowers_plans_2026_07_07_spotmap_audit_refactor_stage9_finalize [EXTRACTED 0.95]
- **Angular Idiom Modernization (Stage 6)** — docs_superpowers_plans_2026_07_08_spotmap_stage6_architecture_onpush_signals_zonejs, docs_superpowers_plans_2026_07_08_spotmap_stage6_architecture_for_control_flow, docs_superpowers_plans_2026_07_08_spotmap_stage6_architecture_signal_input_output, docs_superpowers_plans_2026_07_08_spotmap_stage6_architecture_glyph_measurement, docs_superpowers_plans_2026_07_08_spotmap_stage6_architecture_router_driven_nav [EXTRACTED 0.90]
- **CRT Accessibility & UX Pass (Stage 8)** — docs_superpowers_plans_2026_07_08_spotmap_stage8_a11y_ux_reduced_motion_fallbacks, docs_superpowers_plans_2026_07_08_spotmap_stage8_a11y_ux_skippable_session_intro, docs_superpowers_plans_2026_07_08_spotmap_stage8_a11y_ux_accessibility, docs_superpowers_plans_2026_07_08_spotmap_stage8_a11y_ux_monochrome_country_codes [EXTRACTED 0.90]
- **App Root Composition Shell (Nav Bar + Intro Animation)** — spotmap_website_src_app_app_component_appcomponent, spotmap_website_src_app_modules_components_ascii_animation_text_ascii_animation_text_component_asciianimationtextcomponent, spotmap_website_src_app_modules_components_nav_bar_nav_bar_component_navbarcomponent [INFERRED 0.80]
- **Signal-Driven @if/@for Control Flow Templates** — spotmap_website_src_app_app_component_appcomponent, spotmap_website_src_app_modules_components_map_container_map_container_component_mapcontainercomponent, spotmap_website_src_app_modules_components_nav_bar_nav_bar_component_navbarcomponent [INFERRED 0.70]

## Communities (15 total, 3 thin omitted)

### Community 0 - "App Shell, Routing & Pages"
Cohesion: 0.09
Nodes (12): AppComponent, Skippable Intro Animation Pattern, appConfig, routes, Glitch Text Hover Directive (appGlitchText), NavBarComponent, NavBarLink, HostComponent (+4 more)

### Community 1 - "Angular Build Config"
Cohesion: 0.08
Nodes (32): build, extract-i18n, serve, test, builder, configurations, defaultConfiguration, options (+24 more)

### Community 2 - "Angular Project & Schematics"
Cohesion: 0.07
Nodes (27): newProjectRoot, projects, spotmap-website, $schema, schematics, type, type, typeSeparator (+19 more)

### Community 3 - "Dev Tooling & npm Scripts"
Cohesion: 0.07
Nodes (27): devDependencies, @angular/cli, @angular/compiler-cli, @angular-devkit/build-angular, istanbul-lib-instrument, jasmine-core, karma, karma-chrome-launcher (+19 more)

### Community 4 - "Loader, Glitch FX & Motion Guard"
Cohesion: 0.13
Nodes (4): LoadingBarComponent, GlitchTextDirective, HostComponent, prefersReducedMotion()

### Community 5 - "Design Language & Product Docs"
Cohesion: 0.10
Nodes (23): GitHub Pages Build Job, GitHub Pages Deploy Job, SPA 404.html Routing Fallback, Deploy Angular App to GitHub Pages (Workflow), ASCII Animation (Signature), The Bloom-Budget Rule, GlitchText Navigation Effect, IBM Plex Mono Typography (+15 more)

### Community 6 - "Refactor Plan: Architecture & A11y"
Cohesion: 0.11
Nodes (21): Green Gate (build + tests pass per stage), Matrix Aesthetic Preservation, Vienna Spotmap Audit Refactor Program, Stage 6 — Architecture / API Modernization (P1), Stage 7 — Cleanup / Dead-code / Docs (P2), Stage 8 — A11y + UX + Content (P3), Stage 9 — Finalize, Standalone Components + Signals (+13 more)

### Community 7 - "Map Page & City Data Model"
Cohesion: 0.30
Nodes (6): SUPPORTED_CITIES, MapItem, CityEnum, CountryCodeEnum, CountryEnum, MapComponent

### Community 8 - "Refactor Plan: Platform & Theming"
Cohesion: 0.15
Nodes (17): Design Token SSOT, Stage 0 — Stabilization (P0), Stage 1 — Platform Upgrade (Angular 18→22 + Tailwind v4), Stage 2 — Impeccable Design Pipeline, Stage 3 — Design Tokens, Stage 4 — Drop Bootstrap, Stage 5 — Material M3 Terminal Theme, Stepwise Gated ng update 18→22 (+9 more)

### Community 9 - "Angular Runtime Dependencies"
Cohesion: 0.14
Nodes (14): dependencies, @angular/animations, @angular/cdk, @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/material (+6 more)

### Community 12 - "App Icons & Brand Identity"
Cohesion: 0.83
Nodes (4): Spotmap App Brand/Visual Identity, icon2.png - Pixel-Art Blue Map-Pin Favicon, Blue Pixel-Art Map-Pin App Icon (icon3.png), Skateboard Map-Pin Favicon (Red/Black)

### Community 13 - "Phosphor Palette & Glow Rules"
Cohesion: 0.67
Nodes (3): The Glow-Is-The-Shadow Rule, Two-Phosphor Color Palette (Green + Amber), The Two-Phosphor Rule

## Ambiguous Edges - Review These
- `HomeComponent` → `MapComponent`  [AMBIGUOUS]
  spotmap-website/src/app/modules/pages/home/home.component.html · relation: references

## Knowledge Gaps
- **86 isolated node(s):** `$schema`, `version`, `newProjectRoot`, `projectType`, `schematics` (+81 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `HomeComponent` and `MapComponent`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `AsciiAnimationTextComponent` connect `ASCII Typewriter Engine` to `App Shell, Routing & Pages`, `Loader, Glitch FX & Motion Guard`, `Refactor Plan: Architecture & A11y`, `Map Page & City Data Model`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `AppComponent` connect `App Shell, Routing & Pages` to `ASCII Typewriter Engine`, `Map Page & City Data Model`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `Stage 5 — Material M3 Terminal Theme` connect `Refactor Plan: Platform & Theming` to `Refactor Plan: Architecture & A11y`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `AsciiAnimationTextComponent` (e.g. with `app.component.ts` and `LoadingBarComponent`) actually correct?**
  _`AsciiAnimationTextComponent` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `AppComponent` (e.g. with `AboutComponent` and `HomeComponent`) actually correct?**
  _`AppComponent` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `MapContainerComponent` (e.g. with `create()` and `map.component.ts`) actually correct?**
  _`MapContainerComponent` has 2 INFERRED edges - model-reasoned connections that need verification._