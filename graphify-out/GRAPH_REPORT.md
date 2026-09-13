# Graph Report - .  (2026-09-13)

## Corpus Check
- 4 files · ~140,474 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 427 nodes · 647 edges · 33 communities (17 shown, 16 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 55 edges (avg confidence: 0.81)
- Token cost: 95,000 input · 9,000 output

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
- [[_COMMUNITY_Community 32|Community 32]]

## God Nodes (most connected - your core abstractions)
1. `FakeMap` - 25 edges
2. `AsciiAnimationTextComponent` - 18 edges
3. `AppComponent` - 16 edges
4. `SpotMapComponent` - 16 edges
5. `Design System: Spotmap Compendium (DESIGN.md)` - 14 edges
6. `On-Device Checklist — MapLibre Vienna Pilot` - 13 edges
7. `CityEnum` - 12 edges
8. `LoadingBarComponent` - 12 edges
9. `MapContainerComponent` - 12 edges
10. `MapComponent` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Task 4: Photo Gallery Rendering` --references--> `SpotPhotoGalleryComponent`  [AMBIGUOUS]
  docs/maplibre-vienna-pilot/on-device-checklist.md → spotmap-website/src/app/modules/components/spot-photo-gallery/spot-photo-gallery.component.ts
- `Task 8: The Spot Map Itself` --references--> `SpotMapComponent`  [AMBIGUOUS]
  docs/maplibre-vienna-pilot/on-device-checklist.md → spotmap-website/src/app/modules/components/spot-map/spot-map.component.ts
- `Design Principle: Insider, not exclusive` --semantically_similar_to--> `The Rarity Rule`  [INFERRED] [semantically similar]
  PRODUCT.md → DESIGN.md
- `Task 2: Spot Data on the Real Map` --references--> `Map Surface (signature — Vienna)`  [INFERRED]
  docs/maplibre-vienna-pilot/on-device-checklist.md → DESIGN.md
- `Task 6: Terminal Basemap Style` --references--> `Map Surface (signature — Vienna)`  [INFERRED]
  docs/maplibre-vienna-pilot/on-device-checklist.md → DESIGN.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **App Root Composition Shell (Nav Bar + Intro Animation)** — spotmap_website_src_app_app_component_appcomponent, spotmap_website_src_app_modules_components_ascii_animation_text_ascii_animation_text_component_asciianimationtextcomponent, spotmap_website_src_app_modules_components_nav_bar_nav_bar_component_navbarcomponent [INFERRED 0.80]
- **Signal-Driven @if/@for Control Flow Templates** — spotmap_website_src_app_app_component_appcomponent, spotmap_website_src_app_modules_components_map_container_map_container_component_mapcontainercomponent, spotmap_website_src_app_modules_components_nav_bar_nav_bar_component_navbarcomponent [INFERRED 0.70]

## Communities (33 total, 16 thin omitted)

### Community 0 - "Design System and Doctrine"
Cohesion: 0.10
Nodes (40): Design System: Spotmap Compendium (DESIGN.md), ASCII Animation (signature), The Bloom-Budget Rule, Directions Link Mechanism, The Glow-Is-The-Shadow Rule, Google My Maps Embed (temporary anachronism), Map Frame (signature), Map Surface (signature — Vienna) (+32 more)

### Community 1 - "ASCII Animation Text"
Cohesion: 0.09
Nodes (5): AsciiAnimationTextComponent, LoadingBarComponent, GlitchTextDirective, HostComponent, prefersReducedMotion()

### Community 2 - "Map Container and Chrome"
Cohesion: 0.07
Nodes (35): build, extract-i18n, serve, test, builder, configurations, defaultConfiguration, options (+27 more)

### Community 3 - "Angular Build Targets"
Cohesion: 0.06
Nodes (34): devDependencies, @angular/cli, @angular/compiler-cli, @angular-devkit/build-angular, istanbul-lib-instrument, jasmine-core, karma, karma-chrome-launcher (+26 more)

### Community 4 - "Runtime Dependencies"
Cohesion: 0.08
Nodes (10): CameraMove, COLLECTION, create(), FakePopup, tap(), tapOn(), SPOT_LAYERS, SpotMapComponent (+2 more)

### Community 5 - "City Config and Map Enums"
Cohesion: 0.16
Nodes (14): SUPPORTED_CITIES, MapItem, CityEnum, CountryCodeEnum, CountryEnum, MapFailureReason, MapRendererEnum, SpotCollection (+6 more)

### Community 6 - "Terminal Basemap Style"
Cohesion: 0.09
Nodes (24): buildTerminalStyle(), CASED_TIERS, casingRamp(), classFilter(), HIDDEN_BRUNNELS, ROAD_TIERS, ROAD_ZOOMS, roadLayer() (+16 more)

### Community 7 - "Angular Workspace Schematics"
Cohesion: 0.07
Nodes (27): newProjectRoot, projects, spotmap-website, $schema, schematics, type, type, typeSeparator (+19 more)

### Community 8 - "App Shell and Intro Sequence"
Cohesion: 0.11
Nodes (9): AppComponent, Skippable Intro Animation Pattern, Glitch Text Hover Directive (appGlitchText), NavBarComponent, NavBarLink, HostComponent, StubPageComponent, AboutComponent (+1 more)

### Community 11 - "Dev Toolchain Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, @angular/animations, @angular/cdk, @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/material (+7 more)

### Community 12 - "App Bootstrap and Map Factory"
Cohesion: 0.26
Nodes (7): appConfig, routes, createMapLibreMap(), MAP_FACTORY, MapFactory, POPUP_FACTORY, PopupFactory

### Community 13 - "Dev Server Worker Check"
Cohesion: 0.36
Nodes (8): bodyOf(), fail(), findModuleBuildingTheWorkerUrl(), port, projectDir, statusOf(), waitForServer(), workerModuleUrls()

### Community 15 - "Build Worker Asset Guard"
Cohesion: 0.48
Nodes (6): applicationModules(), chunks, entryScripts(), fail(), requireSiblingModule(), root

### Community 16 - "Worker Guard Tests"
Cohesion: 0.40
Nodes (4): buildOutput(), guard, mapChunk(), workDir

### Community 17 - "Brand Marks"
Cohesion: 0.83
Nodes (4): Spotmap App Brand/Visual Identity, icon2.png - Pixel-Art Blue Map-Pin Favicon, Blue Pixel-Art Map-Pin App Icon (icon3.png), Skateboard Map-Pin Favicon (Red/Black)

### Community 19 - "Deploy and Repo Conventions"
Cohesion: 0.67
Nodes (3): Deploy Angular App to GitHub Pages (CI workflow), Graphify update-in-the-same-change discipline, spotmap-website project instructions (CLAUDE.md)

## Ambiguous Edges - Review These
- `SpotPhotoGalleryComponent` → `Task 4: Photo Gallery Rendering`  [AMBIGUOUS]
  docs/maplibre-vienna-pilot/on-device-checklist.md · relation: references
- `HomeComponent` → `MapComponent`  [AMBIGUOUS]
  spotmap-website/src/app/modules/pages/home/home.component.html · relation: references
- `SpotMapComponent` → `Task 8: The Spot Map Itself`  [AMBIGUOUS]
  docs/maplibre-vienna-pilot/on-device-checklist.md · relation: references

## Knowledge Gaps
- **113 isolated node(s):** `SpotStatus`, `SpotProperties`, `SpotFeature`, `StubPageComponent`, `HostComponent` (+108 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `SpotPhotoGalleryComponent` and `Task 4: Photo Gallery Rendering`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `HomeComponent` and `MapComponent`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `SpotMapComponent` and `Task 8: The Spot Map Itself`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `SpotMapComponent` connect `Runtime Dependencies` to `Design System and Doctrine`, `City Config and Map Enums`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **Why does `Task 8: The Spot Map Itself` connect `Design System and Doctrine` to `Runtime Dependencies`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `AppComponent` (e.g. with `AboutComponent` and `HomeComponent`) actually correct?**
  _`AppComponent` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `SpotStatus`, `SpotProperties`, `SpotFeature` to the rest of the system?**
  _124 weakly-connected nodes found - possible documentation gaps or missing edges._