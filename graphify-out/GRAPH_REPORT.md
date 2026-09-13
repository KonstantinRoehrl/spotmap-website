# Graph Report - spotmap-website  (2026-09-13)

## Corpus Check
- 64 files · ~146,098 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 494 nodes · 690 edges · 59 communities (18 shown, 41 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c169e38b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Design System and Doctrine|Design System and Doctrine]]
- [[_COMMUNITY_ASCII Animation Text|ASCII Animation Text]]
- [[_COMMUNITY_Map Container and Chrome|Map Container and Chrome]]
- [[_COMMUNITY_Angular Build Targets|Angular Build Targets]]
- [[_COMMUNITY_Runtime Dependencies|Runtime Dependencies]]
- [[_COMMUNITY_City Config and Map Enums|City Config and Map Enums]]
- [[_COMMUNITY_Terminal Basemap Style|Terminal Basemap Style]]
- [[_COMMUNITY_Angular Workspace Schematics|Angular Workspace Schematics]]
- [[_COMMUNITY_App Shell and Intro Sequence|App Shell and Intro Sequence]]
- [[_COMMUNITY_Map Test Doubles|Map Test Doubles]]
- [[_COMMUNITY_Map Container State Machine|Map Container State Machine]]
- [[_COMMUNITY_Dev Toolchain Dependencies|Dev Toolchain Dependencies]]
- [[_COMMUNITY_App Bootstrap and Map Factory|App Bootstrap and Map Factory]]
- [[_COMMUNITY_Dev Server Worker Check|Dev Server Worker Check]]
- [[_COMMUNITY_Spot Photo Gallery|Spot Photo Gallery]]
- [[_COMMUNITY_Build Worker Asset Guard|Build Worker Asset Guard]]
- [[_COMMUNITY_Worker Guard Tests|Worker Guard Tests]]
- [[_COMMUNITY_Brand Marks|Brand Marks]]
- [[_COMMUNITY_Dev Server Guard Tests|Dev Server Guard Tests]]
- [[_COMMUNITY_Deploy and Repo Conventions|Deploy and Repo Conventions]]
- [[_COMMUNITY_Anti-references|Anti-references]]
- [[_COMMUNITY_Brand Personality|Brand Personality]]
- [[_COMMUNITY_Archive With Weight|Archive With Weight]]
- [[_COMMUNITY_Map Is The Point|Map Is The Point]]
- [[_COMMUNITY_Sarcastic But Caring|Sarcastic But Caring]]
- [[_COMMUNITY_Time Travel Not Dark Mode|Time Travel Not Dark Mode]]
- [[_COMMUNITY_Spotmap Product Definition|Spotmap Product Definition]]
- [[_COMMUNITY_Two-Renderer Constraint|Two-Renderer Constraint]]
- [[_COMMUNITY_ASCII Animation Template|ASCII Animation Template]]
- [[_COMMUNITY_Google Embed Template|Google Embed Template]]
- [[_COMMUNITY_Spot Map Template|Spot Map Template]]
- [[_COMMUNITY_Spot Gallery Template|Spot Gallery Template]]
- [[_COMMUNITY_SpotPhotoGalleryComponent template|SpotPhotoGalleryComponent template]]
- [[_COMMUNITY_verify-css-asset-urls.test.mjs|verify-css-asset-urls.test.mjs]]
- [[_COMMUNITY_spotmap-website — project instructions|spotmap-website — project instructions]]
- [[_COMMUNITY_README|README.md]]
- [[_COMMUNITY_Graphify update-in-the-same-change discipline|Graphify update-in-the-same-change discipline]]
- [[_COMMUNITY_spotmap-website project instructions (CLAUDE.md)|spotmap-website project instructions (CLAUDE.md)]]
- [[_COMMUNITY_The Bloom-Budget Rule|The Bloom-Budget Rule]]
- [[_COMMUNITY_The Glow-Is-The-Shadow Rule|The Glow-Is-The-Shadow Rule]]
- [[_COMMUNITY_The One-Grid Rule|The One-Grid Rule]]
- [[_COMMUNITY_The Restrained-Caps Rule|The Restrained-Caps Rule]]
- [[_COMMUNITY_The Two-Phosphor Rule|The Two-Phosphor Rule]]
- [[_COMMUNITY_Branch Review Fixes (Round 1)|Branch Review Fixes (Round 1)]]
- [[_COMMUNITY_Branch Review Fixes (Round 2)|Branch Review Fixes (Round 2)]]
- [[_COMMUNITY_geo URI Platform Limitation|geo: URI Platform Limitation]]
- [[_COMMUNITY_Task 10 Turn Vienna On|Task 10: Turn Vienna On]]
- [[_COMMUNITY_Task 11 Map Surface Matches Its Documentation|Task 11: Map Surface Matches Its Documentation]]
- [[_COMMUNITY_Task 2 Spot Data on the Real Map|Task 2: Spot Data on the Real Map]]
- [[_COMMUNITY_Task 4 Photo Gallery Rendering|Task 4: Photo Gallery Rendering]]
- [[_COMMUNITY_Task 5 Container  Renderer Split|Task 5: Container / Renderer Split]]
- [[_COMMUNITY_Task 6 Terminal Basemap Style|Task 6: Terminal Basemap Style]]
- [[_COMMUNITY_Task 7 Real Map Factory Registered|Task 7: Real Map Factory Registered]]
- [[_COMMUNITY_Task 8 The Spot Map Itself|Task 8: The Spot Map Itself]]
- [[_COMMUNITY_Task 9 The Spot Popup and Pin Selection|Task 9: The Spot Popup and Pin Selection]]
- [[_COMMUNITY_Worker Guard Fix (maplibre-gl-worker 404)|Worker Guard Fix (maplibre-gl-worker 404)]]
- [[_COMMUNITY_Design Principle Insider, not exclusive|Design Principle: Insider, not exclusive]]
- [[_COMMUNITY_spotmap-website (Repository Root Readme)|spotmap-website (Repository Root Readme)]]
- [[_COMMUNITY_Spotmap Project Overview & Docs|Spotmap Project Overview & Docs]]

## God Nodes (most connected - your core abstractions)
1. `FakeMap` - 25 edges
2. `AsciiAnimationTextComponent` - 18 edges
3. `AppComponent` - 16 edges
4. `CityEnum` - 16 edges
5. `SpotMapComponent` - 16 edges
6. `MapContainerComponent` - 14 edges
7. `scripts` - 13 edges
8. `LoadingBarComponent` - 12 edges
9. `MapComponent` - 12 edges
10. `On-device checklist — MapLibre Vienna pilot` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Map Container Component Template` --implements--> `Map Frame (signature)`  [INFERRED]
  spotmap-website/src/app/modules/components/map-container/map-container.component.html → DESIGN.md
- `Map Container Component Template` --references--> `Matrix Radar Loader (signature)`  [INFERRED]
  spotmap-website/src/app/modules/components/map-container/map-container.component.html → DESIGN.md
- `Map Container Component Template` --references--> `The No-White Rule`  [INFERRED]
  spotmap-website/src/app/modules/components/map-container/map-container.component.html → DESIGN.md
- `Map Container Component Template` --implements--> `Google My Maps Embed (temporary anachronism)`  [INFERRED]
  spotmap-website/src/app/modules/components/map-container/map-container.component.html → DESIGN.md
- `Map Container Component Template` --shares_data_with--> `WebGL 2 vs WebGL Distinction (No-Renderer Message)`  [INFERRED]
  spotmap-website/src/app/modules/components/map-container/map-container.component.html → docs/maplibre-vienna-pilot/on-device-checklist.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **App Root Composition Shell (Nav Bar + Intro Animation)** — spotmap_website_src_app_app_component_appcomponent, spotmap_website_src_app_modules_components_ascii_animation_text_ascii_animation_text_component_asciianimationtextcomponent, spotmap_website_src_app_modules_components_nav_bar_nav_bar_component_navbarcomponent [INFERRED 0.80]
- **Signal-Driven @if/@for Control Flow Templates** — spotmap_website_src_app_app_component_appcomponent, spotmap_website_src_app_modules_components_map_container_map_container_component_mapcontainercomponent, spotmap_website_src_app_modules_components_nav_bar_nav_bar_component_navbarcomponent [INFERRED 0.70]

## Communities (59 total, 41 thin omitted)

### Community 0 - "Design System and Doctrine"
Cohesion: 0.06
Nodes (34): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, ASCII Animation (signature), Buttons (+26 more)

### Community 1 - "ASCII Animation Text"
Cohesion: 0.09
Nodes (5): AsciiAnimationTextComponent, LoadingBarComponent, GlitchTextDirective, HostComponent, prefersReducedMotion()

### Community 2 - "Map Container and Chrome"
Cohesion: 0.07
Nodes (35): build, extract-i18n, serve, test, builder, configurations, defaultConfiguration, options (+27 more)

### Community 3 - "Angular Build Targets"
Cohesion: 0.06
Nodes (34): dependencies, @angular/animations, @angular/cdk, @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/material (+26 more)

### Community 4 - "Runtime Dependencies"
Cohesion: 0.11
Nodes (9): SpotCollection, SpotFeature, SpotProperties, SpotStatus, SpotMapComponent, create(), SpotPhotoGalleryComponent, create() (+1 more)

### Community 5 - "City Config and Map Enums"
Cohesion: 0.10
Nodes (23): appConfig, routes, SUPPORTED_CITIES, MapItem, CityEnum, CountryCodeEnum, CountryEnum, MapFailureReason (+15 more)

### Community 6 - "Terminal Basemap Style"
Cohesion: 0.10
Nodes (24): buildTerminalStyle(), CASED_TIERS, casingRamp(), classFilter(), HIDDEN_BRUNNELS, ROAD_TIERS, ROAD_ZOOMS, roadLayer() (+16 more)

### Community 7 - "Angular Workspace Schematics"
Cohesion: 0.07
Nodes (27): newProjectRoot, projects, spotmap-website, $schema, schematics, type, type, typeSeparator (+19 more)

### Community 8 - "App Shell and Intro Sequence"
Cohesion: 0.11
Nodes (9): AppComponent, Skippable Intro Animation Pattern, Glitch Text Hover Directive (appGlitchText), NavBarComponent, NavBarLink, HostComponent, StubPageComponent, AboutComponent (+1 more)

### Community 10 - "Map Container State Machine"
Cohesion: 0.20
Nodes (3): MapContainerComponent, create(), MapComponent

### Community 11 - "Dev Toolchain Dependencies"
Cohesion: 0.10
Nodes (18): Branch review fixes (round 1), Branch review fixes (round 2), Container / renderer split — no visible change intended (Task 5), Map surface matches its documentation, and the No-White Rule holds with no exceptions (Task 11), On-device checklist — MapLibre Vienna pilot, Photo gallery rendering (Task 4), Real map factory registered (Task 7), Spot data on the real map (Task 2) (+10 more)

### Community 12 - "App Bootstrap and Map Factory"
Cohesion: 0.12
Nodes (16): devDependencies, @angular/cli, @angular/compiler-cli, @angular-devkit/build-angular, istanbul-lib-instrument, jasmine-core, karma, karma-chrome-launcher (+8 more)

### Community 13 - "Dev Server Worker Check"
Cohesion: 0.36
Nodes (8): bodyOf(), fail(), findModuleBuildingTheWorkerUrl(), port, projectDir, statusOf(), waitForServer(), workerModuleUrls()

### Community 14 - "Spot Photo Gallery"
Cohesion: 0.25
Nodes (7): Deployment, Design system, Getting started, Project structure, Spotmap, Tech stack, App Shell (app-root mount, Vienna Spotmap)

### Community 15 - "Build Worker Asset Guard"
Cohesion: 0.48
Nodes (6): applicationModules(), chunks, entryScripts(), fail(), requireSiblingModule(), root

### Community 16 - "Worker Guard Tests"
Cohesion: 0.40
Nodes (4): buildOutput(), guard, mapChunk(), workDir

### Community 17 - "Brand Marks"
Cohesion: 0.83
Nodes (4): Spotmap App Brand/Visual Identity, icon2.png - Pixel-Art Blue Map-Pin Favicon, Blue Pixel-Art Map-Pin App Icon (icon3.png), Skateboard Map-Pin Favicon (Red/Black)

### Community 21 - "Brand Personality"
Cohesion: 0.22
Nodes (8): Accessibility & Inclusion, Anti-references, Brand Personality, Design Principles, Product, Product Purpose, Register, Users

## Ambiguous Edges - Review These
- `HomeComponent` → `MapComponent`  [AMBIGUOUS]
  spotmap-website/src/app/modules/pages/home/home.component.html · relation: references

## Knowledge Gaps
- **172 isolated node(s):** `$schema`, `version`, `newProjectRoot`, `projectType`, `schematics` (+167 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `HomeComponent` and `MapComponent`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `FakeMap` connect `Map Test Doubles` to `City Config and Map Enums`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `MapComponent` connect `Map Container State Machine` to `App Shell and Intro Sequence`, `ASCII Animation Text`, `City Config and Map Enums`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `AppComponent` connect `App Shell and Intro Sequence` to `ASCII Animation Text`, `Map Container State Machine`, `City Config and Map Enums`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `AppComponent` (e.g. with `AboutComponent` and `HomeComponent`) actually correct?**
  _`AppComponent` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `version`, `newProjectRoot` to the rest of the system?**
  _191 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Design System and Doctrine` be split into smaller, more focused modules?**
  _Cohesion score 0.06050420168067227 - nodes in this community are weakly interconnected._