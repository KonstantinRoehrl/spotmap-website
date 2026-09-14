# Graph Report - .  (2026-09-14)

## Corpus Check
- 81 files · ~137,309 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 485 nodes · 711 edges · 54 communities (22 shown, 32 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.85)
- Token cost: 91,029 input · 91,032 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Angular Build Tooling & Test Deps|Angular Build Tooling & Test Deps]]
- [[_COMMUNITY_Angular CLI Build Targets|Angular CLI Build Targets]]
- [[_COMMUNITY_Map Factory & App Bootstrap|Map Factory & App Bootstrap]]
- [[_COMMUNITY_Terminal Basemap Style|Terminal Basemap Style]]
- [[_COMMUNITY_Spot Data & Spot Map|Spot Data & Spot Map]]
- [[_COMMUNITY_Angular Workspace Config|Angular Workspace Config]]
- [[_COMMUNITY_ASCII Animation & Loading Bar|ASCII Animation & Loading Bar]]
- [[_COMMUNITY_Fake Map Test Double|Fake Map Test Double]]
- [[_COMMUNITY_CI & Dependabot Automation|CI & Dependabot Automation]]
- [[_COMMUNITY_Map Container & Renderer Lifecycle|Map Container & Renderer Lifecycle]]
- [[_COMMUNITY_App Shell & Intro Flow|App Shell & Intro Flow]]
- [[_COMMUNITY_CityMap Enums & Gmaps Embed|City/Map Enums & Gmaps Embed]]
- [[_COMMUNITY_Angular App Routes & Tech Stack|Angular App Routes & Tech Stack]]
- [[_COMMUNITY_npm Runtime Dependencies|npm Runtime Dependencies]]
- [[_COMMUNITY_ASCII Text Animation Engine|ASCII Text Animation Engine]]
- [[_COMMUNITY_Map Surface Design & Vienna Pilot|Map Surface Design & Vienna Pilot]]
- [[_COMMUNITY_Dev-Server Map-Worker Verification Script|Dev-Server Map-Worker Verification Script]]
- [[_COMMUNITY_Loading UI & Color Design Rules|Loading UI & Color Design Rules]]
- [[_COMMUNITY_Spot Photo Gallery Component|Spot Photo Gallery Component]]
- [[_COMMUNITY_Button & Phosphor Color Design|Button & Phosphor Color Design]]
- [[_COMMUNITY_Map-Worker Asset Verification Script|Map-Worker Asset Verification Script]]
- [[_COMMUNITY_Map-Worker Asset Verification Tests|Map-Worker Asset Verification Tests]]
- [[_COMMUNITY_Design System Doctrine (DESIGN.md)|Design System Doctrine (DESIGN.md)]]
- [[_COMMUNITY_CSS Asset URL Verification Script|CSS Asset URL Verification Script]]
- [[_COMMUNITY_CSS Asset URL Verification Tests|CSS Asset URL Verification Tests]]
- [[_COMMUNITY_Glitch Text & Navigation|Glitch Text & Navigation]]
- [[_COMMUNITY_Dev-Server Map-Worker Verification Tests|Dev-Server Map-Worker Verification Tests]]
- [[_COMMUNITY_Typography & Grid Rules|Typography & Grid Rules]]
- [[_COMMUNITY_About Page Component|About Page Component]]
- [[_COMMUNITY_Graphify Workflow Discipline|Graphify Workflow Discipline]]
- [[_COMMUNITY_Alert Red Color Token|Alert Red Color Token]]
- [[_COMMUNITY_Amber Dim Color Token|Amber Dim Color Token]]
- [[_COMMUNITY_CRT Black Color Token|CRT Black Color Token]]
- [[_COMMUNITY_Line Color Token|Line Color Token]]
- [[_COMMUNITY_Phosphor Deep Color Token|Phosphor Deep Color Token]]
- [[_COMMUNITY_Phosphor Dim Color Token|Phosphor Dim Color Token]]
- [[_COMMUNITY_Restrained-Caps Typography Rule|Restrained-Caps Typography Rule]]
- [[_COMMUNITY_Surface Raised Color Token|Surface Raised Color Token]]
- [[_COMMUNITY_Design Anti-References|Design Anti-References]]
- [[_COMMUNITY_Brand Personality Traits|Brand Personality Traits]]
- [[_COMMUNITY_Archive-With-Weight Principle|Archive-With-Weight Principle]]
- [[_COMMUNITY_Map-Is-The-Point Principle|Map-Is-The-Point Principle]]
- [[_COMMUNITY_Sarcastic-But-Caring Principle|Sarcastic-But-Caring Principle]]
- [[_COMMUNITY_Time-Travel-Not-Dark-Mode Principle|Time-Travel-Not-Dark-Mode Principle]]
- [[_COMMUNITY_Product Definition (PRODUCT.md)|Product Definition (PRODUCT.md)]]
- [[_COMMUNITY_Dual-Renderer Migration Constraint|Dual-Renderer Migration Constraint]]
- [[_COMMUNITY_Spotmap-Website README|Spotmap-Website README]]
- [[_COMMUNITY_App Icon Variant 2|App Icon Variant 2]]
- [[_COMMUNITY_App Icon Variant 3|App Icon Variant 3]]
- [[_COMMUNITY_Primary App Icon|Primary App Icon]]
- [[_COMMUNITY_ASCII Animation Template|ASCII Animation Template]]
- [[_COMMUNITY_Gmaps Embed Template|Gmaps Embed Template]]
- [[_COMMUNITY_Spot Map Template|Spot Map Template]]
- [[_COMMUNITY_Spot Photo Gallery Template|Spot Photo Gallery Template]]

## God Nodes (most connected - your core abstractions)
1. `FakeMap` - 25 edges
2. `Spotmap README (spotmap-website/README.md)` - 23 edges
3. `AsciiAnimationTextComponent` - 17 edges
4. `CityEnum` - 16 edges
5. `SpotMapComponent` - 16 edges
6. `MapContainerComponent` - 14 edges
7. `scripts` - 13 edges
8. `AppComponent` - 12 edges
9. `LoadingBarComponent` - 12 edges
10. `GlitchTextDirective` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Design Principle: Insider, not exclusive` --semantically_similar_to--> `The Rarity Rule`  [INFERRED] [semantically similar]
  PRODUCT.md → DESIGN.md
- `IBM Plex Mono (typography system)` --semantically_similar_to--> `IBM Plex Mono (self-hosted font)`  [INFERRED] [semantically similar]
  DESIGN.md → spotmap-website/README.md
- `Map Frame (component)` --semantically_similar_to--> `map-container component`  [INFERRED] [semantically similar]
  DESIGN.md → spotmap-website/README.md
- `Map Surface — Vienna (signature component)` --semantically_similar_to--> `map-container component`  [INFERRED] [semantically similar]
  DESIGN.md → spotmap-website/README.md
- `Spot Popup Component Template` --implements--> `Map Surface — Vienna (signature component)`  [INFERRED]
  spotmap-website/src/app/modules/components/spot-popup/spot-popup.component.html → DESIGN.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **SHA-pinned GitHub Actions kept current by Dependabot** — github_dependabot_github_actions_updates, github_workflows_ci_checkout_action, github_workflows_ci_setup_node_action, github_workflows_deploy_angular_checkout_action, github_workflows_deploy_angular_setup_node_action, github_workflows_deploy_angular_configure_pages_action, github_workflows_deploy_angular_upload_pages_artifact_action, github_workflows_deploy_angular_deploy_pages_action [INFERRED 0.85]
- **CI jobs gating a pull request into main/dev** — github_workflows_ci_format_job, github_workflows_ci_build_job, github_workflows_ci_test_job, github_workflows_ci_secrets_job [EXTRACTED 1.00]
- **DESIGN.md's Named Rules design pattern** — design_two_phosphor_rule, design_no_white_rule, design_rarity_rule, design_one_grid_rule, design_restrained_caps_rule, design_glow_is_the_shadow_rule, design_bloom_budget_rule [EXTRACTED 1.00]
- **Angular App Shell Composition (bootstrap, root view, persistent nav)** — spotmap_website_src_index, spotmap_website_src_app_app_component_template, spotmap_website_src_app_modules_components_nav_bar_nav_bar_component_template [INFERRED 0.85]
- **Retro Terminal / CRT Aesthetic Theme** — spotmap_website_src_app_modules_pages_home_home_component_template, spotmap_website_src_app_modules_pages_map_map_component_template, spotmap_website_src_app_modules_components_loading_bar_loading_bar_component_template, spotmap_website_src_app_modules_components_nav_bar_nav_bar_component_template [INFERRED 0.75]

## Communities (54 total, 32 thin omitted)

### Community 0 - "Angular Build Tooling & Test Deps"
Cohesion: 0.06
Nodes (35): devDependencies, @angular/cli, @angular/compiler-cli, @angular-devkit/build-angular, istanbul-lib-instrument, jasmine-core, karma, karma-chrome-launcher (+27 more)

### Community 1 - "Angular CLI Build Targets"
Cohesion: 0.07
Nodes (35): build, extract-i18n, serve, test, builder, configurations, defaultConfiguration, options (+27 more)

### Community 2 - "Map Factory & App Bootstrap"
Cohesion: 0.10
Nodes (13): appConfig, routes, createMapLibreMap(), MAP_FACTORY, MapFactory, POPUP_FACTORY, PopupFactory, CameraMove (+5 more)

### Community 3 - "Terminal Basemap Style"
Cohesion: 0.10
Nodes (24): buildTerminalStyle(), CASED_TIERS, casingRamp(), classFilter(), HIDDEN_BRUNNELS, ROAD_TIERS, ROAD_ZOOMS, roadLayer() (+16 more)

### Community 4 - "Spot Data & Spot Map"
Cohesion: 0.13
Nodes (9): SpotCollection, SpotFeature, SpotProperties, SpotStatus, SPOT_LAYERS, SpotMapComponent, create(), SpotPopupComponent (+1 more)

### Community 5 - "Angular Workspace Config"
Cohesion: 0.07
Nodes (27): newProjectRoot, projects, spotmap-website, $schema, schematics, type, type, typeSeparator (+19 more)

### Community 6 - "ASCII Animation & Loading Bar"
Cohesion: 0.11
Nodes (5): LoadingBarComponent, LoadingBarComponent Template (Matrix Rain Loader), GlitchTextDirective, HostComponent, prefersReducedMotion()

### Community 8 - "CI & Dependabot Automation"
Cohesion: 0.12
Nodes (24): Dependabot config (.github/dependabot.yml), github-actions-minor-patch group, github-actions ecosystem updates (repo root), npm-minor-patch group, npm ecosystem updates (/spotmap-website directory), CI workflow (.github/workflows/ci.yml), build job — production build + tool tests, npm run build:pages (+16 more)

### Community 9 - "Map Container & Renderer Lifecycle"
Cohesion: 0.15
Nodes (6): MapContainerComponent, create(), HomeComponent, HomeComponent Template (Phosphor Archive Landing), MapComponent, MapComponent Template (City Selector + Map)

### Community 10 - "App Shell & Intro Flow"
Cohesion: 0.14
Nodes (8): AppComponent, AppComponent Template (Intro + Nav Shell), NavBarComponent, NavBarLink, HostComponent, StubPageComponent, NavBarComponent Template, index.html (App Bootstrap Shell)

### Community 11 - "City/Map Enums & Gmaps Embed"
Cohesion: 0.28
Nodes (9): SUPPORTED_CITIES, MapItem, CityEnum, CountryCodeEnum, CountryEnum, MapFailureReason, MapRendererEnum, GmapsEmbedComponent (+1 more)

### Community 12 - "Angular App Routes & Tech Stack"
Cohesion: 0.12
Nodes (16): ASCII Animation (signature component), Spotmap README (spotmap-website/README.md), about page (routed), Angular 22 (standalone components, signals, OnPush), Angular Material 22 (custom M3 green-terminal theme), app.routes.ts, ascii-animation-text component, home page (routed) (+8 more)

### Community 13 - "npm Runtime Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, @angular/animations, @angular/cdk, @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/material (+7 more)

### Community 15 - "Map Surface Design & Vienna Pilot"
Cohesion: 0.28
Nodes (9): The Bloom-Budget Rule, Directions link (Google Maps dir URL), Embedded Google My Maps (temporary anachronism for un-migrated cities), Map Frame (component), Map Surface — Vienna (signature component), MapLibre (WebGL 2 map renderer), OpenFreeMap vector-tile basemap, map-container component (+1 more)

### Community 16 - "Dev-Server Map-Worker Verification Script"
Cohesion: 0.36
Nodes (8): bodyOf(), fail(), findModuleBuildingTheWorkerUrl(), port, projectDir, statusOf(), waitForServer(), workerModuleUrls()

### Community 17 - "Loading UI & Color Design Rules"
Cohesion: 0.25
Nodes (8): Inputs / Fields — city select (component), Matrix Radar Loader (signature component), The No-White Rule, Phosphor Bright (#b6ffb6), Surface (#0a0f0a), Accessibility & Inclusion (mobile-first, reduced motion), loading-bar component, SUPPORTED_CITIES (city/country/config models-enums)

### Community 19 - "Button & Phosphor Color Design"
Cohesion: 0.29
Nodes (7): Buttons (component), CRT Amber (#ffb000), Phosphor Green (#00ff00), The Rarity Rule, The Two-Phosphor Rule, Design Principle: Insider, not exclusive, Spot Popup Component Template

### Community 20 - "Map-Worker Asset Verification Script"
Cohesion: 0.48
Nodes (6): applicationModules(), chunks, entryScripts(), fail(), requireSiblingModule(), root

### Community 21 - "Map-Worker Asset Verification Tests"
Cohesion: 0.40
Nodes (4): buildOutput(), guard, mapChunk(), workDir

### Community 22 - "Design System Doctrine (DESIGN.md)"
Cohesion: 0.40
Nodes (5): Design System: Spotmap Compendium (DESIGN.md), The Glow-Is-The-Shadow Rule, The Phosphor Archive (creative north star), PRODUCT.md (product brief, names anti-references), About Page Component Template

### Community 25 - "Glitch Text & Navigation"
Cohesion: 0.50
Nodes (4): GlitchText behavior (per-character glitch), Navigation (component), glitch-text directive (per-character scramble), nav-bar component

### Community 27 - "Typography & Grid Rules"
Cohesion: 0.67
Nodes (3): IBM Plex Mono (typography system), The One-Grid Rule, IBM Plex Mono (self-hosted font)

## Knowledge Gaps
- **148 isolated node(s):** `$schema`, `version`, `newProjectRoot`, `projectType`, `schematics` (+143 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FakeMap` connect `Fake Map Test Double` to `Map Factory & App Bootstrap`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `prefersReducedMotion()` connect `ASCII Animation & Loading Bar` to `Spot Data & Spot Map`, `ASCII Text Animation Engine`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `AsciiAnimationTextComponent` connect `ASCII Text Animation Engine` to `Map Container & Renderer Lifecycle`, `App Shell & Intro Flow`, `City/Map Enums & Gmaps Embed`, `ASCII Animation & Loading Bar`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `$schema`, `version`, `newProjectRoot` to the rest of the system?**
  _162 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Angular Build Tooling & Test Deps` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `Angular CLI Build Targets` be split into smaller, more focused modules?**
  _Cohesion score 0.06890756302521009 - nodes in this community are weakly interconnected._
- **Should `Map Factory & App Bootstrap` be split into smaller, more focused modules?**
  _Cohesion score 0.0989247311827957 - nodes in this community are weakly interconnected._