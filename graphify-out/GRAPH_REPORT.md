# Graph Report - .  (2026-09-13)

## Corpus Check
- 76 files · ~135,973 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 409 nodes · 646 edges · 28 communities (16 shown, 12 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.76)
- Token cost: 95,000 input · 16,000 output

## Community Hubs (Navigation)
- [[_COMMUNITY_ASCII Animation Text|ASCII Animation Text]]
- [[_COMMUNITY_Design System and Product Doctrine|Design System and Product Doctrine]]
- [[_COMMUNITY_Angular Build Targets|Angular Build Targets]]
- [[_COMMUNITY_Dev Toolchain Dependencies|Dev Toolchain Dependencies]]
- [[_COMMUNITY_City Config and Map Enums|City Config and Map Enums]]
- [[_COMMUNITY_Spot Data and Map Renderer|Spot Data and Map Renderer]]
- [[_COMMUNITY_Angular Workspace Schematics|Angular Workspace Schematics]]
- [[_COMMUNITY_App Bootstrap and Map Factory|App Bootstrap and Map Factory]]
- [[_COMMUNITY_App Shell and Intro Sequence|App Shell and Intro Sequence]]
- [[_COMMUNITY_Terminal Basemap Style|Terminal Basemap Style]]
- [[_COMMUNITY_Map Test Doubles|Map Test Doubles]]
- [[_COMMUNITY_Map Container State Machine|Map Container State Machine]]
- [[_COMMUNITY_Runtime Dependencies|Runtime Dependencies]]
- [[_COMMUNITY_Dev Server Worker Check|Dev Server Worker Check]]
- [[_COMMUNITY_Build Worker Asset Check|Build Worker Asset Check]]
- [[_COMMUNITY_Brand Marks|Brand Marks]]
- [[_COMMUNITY_Deploy and Repo Conventions|Deploy and Repo Conventions]]
- [[_COMMUNITY_Restraint as Signal|Restraint as Signal]]
- [[_COMMUNITY_Design Positioning|Design Positioning]]
- [[_COMMUNITY_Bloom Budget Rule|Bloom Budget Rule]]
- [[_COMMUNITY_Glow as Depth Rule|Glow as Depth Rule]]
- [[_COMMUNITY_One Grid Rule|One Grid Rule]]
- [[_COMMUNITY_Restrained Caps Rule|Restrained Caps Rule]]
- [[_COMMUNITY_Two Phosphor Rule|Two Phosphor Rule]]
- [[_COMMUNITY_Archive With Weight|Archive With Weight]]
- [[_COMMUNITY_Map Is The Point|Map Is The Point]]
- [[_COMMUNITY_Sarcastic But Caring|Sarcastic But Caring]]
- [[_COMMUNITY_Spotmap Product Definition|Spotmap Product Definition]]

## God Nodes (most connected - your core abstractions)
1. `FakeMap` - 25 edges
2. `AsciiAnimationTextComponent` - 18 edges
3. `AppComponent` - 16 edges
4. `CityEnum` - 16 edges
5. `SpotMapComponent` - 16 edges
6. `MapContainerComponent` - 14 edges
7. `LoadingBarComponent` - 12 edges
8. `MapComponent` - 12 edges
9. `scripts` - 11 edges
10. `GlitchTextDirective` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Design Principle: Insider, not exclusive` --semantically_similar_to--> `The Rarity Rule (amber ≤10% of any screen)`  [INFERRED] [semantically similar]
  PRODUCT.md → DESIGN.md
- `Task 2: Spot data on the real map` --conceptually_related_to--> `Map Surface (signature — Vienna) spec`  [INFERRED]
  docs/maplibre-vienna-pilot/on-device-checklist.md → DESIGN.md
- `Constraint: two map renderers coexist until full migration` --conceptually_related_to--> `Map Surface (signature — Vienna) spec`  [INFERRED]
  PRODUCT.md → DESIGN.md
- `Constraint: two map renderers coexist until full migration` --references--> `MapContainerComponent template`  [INFERRED]
  PRODUCT.md → spotmap-website/src/app/modules/components/map-container/map-container.component.html
- `Task 7: Real map factory registered` --references--> `SpotMapComponent template`  [INFERRED]
  docs/maplibre-vienna-pilot/on-device-checklist.md → spotmap-website/src/app/modules/components/spot-map/spot-map.component.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **App Root Composition Shell (Nav Bar + Intro Animation)** — spotmap_website_src_app_app_component_appcomponent, spotmap_website_src_app_modules_components_ascii_animation_text_ascii_animation_text_component_asciianimationtextcomponent, spotmap_website_src_app_modules_components_nav_bar_nav_bar_component_navbarcomponent [INFERRED 0.80]
- **Signal-Driven @if/@for Control Flow Templates** — spotmap_website_src_app_app_component_appcomponent, spotmap_website_src_app_modules_components_map_container_map_container_component_mapcontainercomponent, spotmap_website_src_app_modules_components_nav_bar_nav_bar_component_navbarcomponent [INFERRED 0.70]
- **Vienna MapLibre render/composition pipeline** — spotmap_website_src_app_modules_components_map_container_map_container_component_template, spotmap_website_src_app_modules_components_spot_map_spot_map_component_template, spotmap_website_src_app_modules_components_spot_popup_spot_popup_component_template, spotmap_website_src_app_modules_components_spot_photo_gallery_spot_photo_gallery_component_template [INFERRED 0.85]
- **No-White Rule enforcement across map UI and QA checklist** — design_no_white_rule, spotmap_website_src_app_modules_components_map_container_map_container_component_template, spotmap_website_src_app_modules_components_spot_popup_spot_popup_component_template, docs_maplibre_vienna_pilot_on_device_checklist_task11_map_surface_matches_docs [EXTRACTED 1.00]
- **Dual-renderer abstraction (Google Maps embed vs MapLibre)** — product_two_renderer_constraint, spotmap_website_src_app_modules_components_map_container_map_container_component_template, spotmap_website_src_app_modules_components_gmaps_embed_gmaps_embed_component_template, spotmap_website_src_app_modules_components_spot_map_spot_map_component_template [INFERRED 0.85]

## Communities (28 total, 12 thin omitted)

### Community 0 - "ASCII Animation Text"
Cohesion: 0.09
Nodes (5): AsciiAnimationTextComponent, LoadingBarComponent, GlitchTextDirective, HostComponent, prefersReducedMotion()

### Community 1 - "Design System and Product Doctrine"
Cohesion: 0.08
Nodes (35): ASCII Animation (signature) spec, Map Frame component spec (signature), Map Surface (signature — Vienna) spec, Matrix Radar Loader (signature) spec, The No-White Rule, "The Phosphor Archive" creative north star, Commit 016d6a7 (PRODUCT.md / DESIGN.md doc update), Commit 01797e6 (Vienna renders through MapLibre) (+27 more)

### Community 2 - "Angular Build Targets"
Cohesion: 0.07
Nodes (35): build, extract-i18n, serve, test, builder, configurations, defaultConfiguration, options (+27 more)

### Community 3 - "Dev Toolchain Dependencies"
Cohesion: 0.06
Nodes (33): devDependencies, @angular/cli, @angular/compiler-cli, @angular-devkit/build-angular, istanbul-lib-instrument, jasmine-core, karma, karma-chrome-launcher (+25 more)

### Community 4 - "City Config and Map Enums"
Cohesion: 0.19
Nodes (12): SUPPORTED_CITIES, MapItem, CityEnum, CountryCodeEnum, CountryEnum, MapFailureReason, MapRendererEnum, GmapsEmbedComponent (+4 more)

### Community 5 - "Spot Data and Map Renderer"
Cohesion: 0.11
Nodes (9): SpotCollection, SpotFeature, SpotProperties, SpotStatus, SpotMapComponent, create(), SpotPhotoGalleryComponent, create() (+1 more)

### Community 6 - "Angular Workspace Schematics"
Cohesion: 0.07
Nodes (27): newProjectRoot, projects, spotmap-website, $schema, schematics, type, type, typeSeparator (+19 more)

### Community 7 - "App Bootstrap and Map Factory"
Cohesion: 0.10
Nodes (12): appConfig, routes, createMapLibreMap(), MAP_FACTORY, MapFactory, PopupFactory, CameraMove, COLLECTION (+4 more)

### Community 8 - "App Shell and Intro Sequence"
Cohesion: 0.11
Nodes (9): AppComponent, Skippable Intro Animation Pattern, Glitch Text Hover Directive (appGlitchText), NavBarComponent, NavBarLink, HostComponent, StubPageComponent, AboutComponent (+1 more)

### Community 9 - "Terminal Basemap Style"
Cohesion: 0.12
Nodes (22): buildTerminalStyle(), CASED_TIERS, casingRamp(), classFilter(), classFilterWithout(), ROAD_TIERS, ROAD_ZOOMS, roadLayer() (+14 more)

### Community 11 - "Map Container State Machine"
Cohesion: 0.20
Nodes (3): MapContainerComponent, create(), MapComponent

### Community 12 - "Runtime Dependencies"
Cohesion: 0.13
Nodes (15): dependencies, @angular/animations, @angular/cdk, @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/material (+7 more)

### Community 13 - "Dev Server Worker Check"
Cohesion: 0.31
Nodes (9): bodyOf(), fail(), findModuleBuildingTheWorkerUrl(), port, projectDir, server, statusOf(), waitForServer() (+1 more)

### Community 14 - "Build Worker Asset Check"
Cohesion: 0.40
Nodes (4): chunks, fail(), requireSiblingModule(), root

### Community 15 - "Brand Marks"
Cohesion: 0.83
Nodes (4): Spotmap App Brand/Visual Identity, icon2.png - Pixel-Art Blue Map-Pin Favicon, Blue Pixel-Art Map-Pin App Icon (icon3.png), Skateboard Map-Pin Favicon (Red/Black)

### Community 16 - "Deploy and Repo Conventions"
Cohesion: 0.67
Nodes (3): Deploy Angular App to GitHub Pages (CI workflow), Graphify update-in-the-same-change discipline, spotmap-website project instructions (CLAUDE.md)

## Ambiguous Edges - Review These
- `HomeComponent` → `MapComponent`  [AMBIGUOUS]
  spotmap-website/src/app/modules/pages/home/home.component.html · relation: references

## Knowledge Gaps
- **105 isolated node(s):** `$schema`, `version`, `newProjectRoot`, `projectType`, `schematics` (+100 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `HomeComponent` and `MapComponent`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `FakeMap` connect `Map Test Doubles` to `App Bootstrap and Map Factory`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `MapComponent` connect `Map Container State Machine` to `App Shell and Intro Sequence`, `ASCII Animation Text`, `City Config and Map Enums`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `AppComponent` connect `App Shell and Intro Sequence` to `ASCII Animation Text`, `Map Container State Machine`, `App Bootstrap and Map Factory`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `AppComponent` (e.g. with `AboutComponent` and `HomeComponent`) actually correct?**
  _`AppComponent` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `version`, `newProjectRoot` to the rest of the system?**
  _119 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ASCII Animation Text` be split into smaller, more focused modules?**
  _Cohesion score 0.08771929824561403 - nodes in this community are weakly interconnected._