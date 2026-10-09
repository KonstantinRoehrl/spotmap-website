---
name: Spotmap Compendium
description: A green-phosphor CRT terminal that archives skate spots across European cities.
colors:
  phosphor: "#00ff00"
  phosphor-bright: "#b6ffb6"
  phosphor-dim: "#00b800"
  phosphor-deep: "#005a00"
  amber: "#ffb000"
  amber-dim: "#cc7a00"
  bg: "#000000"
  surface: "#0a0f0a"
  surface-raised: "#0d160d"
  line: "#0f3d17"
  danger: "#ff2e2e"
  map-water: "#101a58"
  map-water-line: "#5a8cff"
  map-water-label: "#7aa2ff"
  map-green-space: "#0b2a14"
  map-plaza: "#1e2410"
  map-building: "#0e1512"
  map-building-line: "#3f6a50"
  map-relief-highlight: "#0d2c44"
  map-contour-minor: "#24402f"
  map-contour-major: "#4f7f62"
  map-contour-label: "#7fae92"
  map-road-major: "#d8ff4d"
  map-road-arterial: "#b0e63c"
  map-road-local: "#7fbf34"
  map-road-service: "#557f2a"
  map-path: "#6ee7c8"
  map-rail: "#8aa8a0"
  map-street-label: "#c8f060"
  map-place-label: "#e8ffb8"
typography:
  display:
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace"
    fontSize: "clamp(1.25rem, 4vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0"
  body:
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace"
    fontSize: "clamp(0.9rem, 1.6vw, 1rem)"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  none: "0"
  sm: "2px"
  md: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  "2xl": "48px"
components:
  nav-link:
    textColor: "{colors.phosphor}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  nav-link-active:
    textColor: "{colors.phosphor-bright}"
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  select-field:
    textColor: "{colors.phosphor}"
    backgroundColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  map-frame:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0"
  notice-care:
    textColor: "{colors.amber}"
    typography: "{typography.label}"
    padding: "8px 12px"
---

# Design System: Spotmap Compendium

## 1. Overview

**Creative North Star: "The Phosphor Archive"**

This is a green-phosphor CRT terminal that happens to be a skate-spot archive. Every surface the site controls should read like a monochrome monitor glowing in a dark room circa the era before the web looked like today — a machine you'd find in a squat, wired to a bulletin board of spots that locals pass down. The glow is not decoration; it's the light source. Depth, focus, and emphasis are all expressed as **phosphor bloom**, never as modern drop-shadows or frosted glass.

The system is disciplined to two phosphors. **Green** is the voice of the archive — every spot name, city, label, and body line. **Amber** is the rare second channel, reserved for the moments the culture is being earnest: respect-the-locals and safety notices, and the one thing you've currently selected. That restraint is the point; if amber shows up everywhere it stops meaning "pay attention." It explicitly rejects the things PRODUCT.md names: corporate/Google-Maps neutrality, Strava/Instagram social polish, cutesy gamification, and — most importantly — the "modern dark-mode SaaS" look. Dark is not the same as this. The difference is retro-computing *intent*: sharp corners, monospace everything, scanline-and-glitch motion, a true-black ground, and zero rounded friendly gradients.

Vienna's map is drawn by the site itself — the basemap is ours, not someone else's map recoloured from the outside — in the **Map Palette** (§2): radar-phosphor roads and labels and CRT blue-violet water, the one place a hue beyond the two phosphors is allowed, because a city map needs more distinct voices than two. The cities still waiting on the migration show the embedded Google My Maps instead; treat that embed as the temporary anachronism the terminal wraps around — framed in a glowing green border, sitting on a dark surface, never allowed to flash raw white.

**Key Characteristics:**
- **True-black ground, phosphor-green ink**, amber as the rare second phosphor.
- **Monospace everything** (IBM Plex Mono) — the whole world is a character grid.
- **Glow is depth.** No conventional shadows; elevation is bloom intensity.
- **Sharp, not rounded.** Corners are 0–4px; the terminal has edges.
- **Legible first.** It's used one-handed, outdoors, in sunlight — the vibe never beats the read.

## 2. Colors

A single-hue phosphor system for the UI chrome: one saturated green carries ~95% of every screen's chrome against true black, with a period-accurate CRT amber as the only second voice. The Vienna basemap is the one documented exception — see the Map Palette below. Canonical values are authored in **OKLCH** in the CSS layer; the frontmatter carries sRGB hex for tooling compatibility.

### Primary
- **Phosphor Green** (`#00ff00` / `oklch(86.6% 0.2948 142.5)`): The archive's voice. All primary text, spot/city names, nav labels, borders-at-strength, and the glow itself. On true black this clears AA for body and large text comfortably.
- **Phosphor Bright** (`#b6ffb6` / `oklch(93% 0.12 145)`): The peak of the bloom and hover/active text — where the beam is hottest. Used sparingly for emphasis and glow highlights, not for body.
- **Phosphor Dim** (`#00b800` / `oklch(70% 0.22 145)`): Secondary/muted text and quiet metadata. The dimmer beam — still ≥4.5:1 on black, so it never drops below readable.
- **Phosphor Deep** (`#005a00` / `oklch(45% 0.14 145)`): Structural lines, inactive dividers, disabled strokes. Present but receding.

### Secondary
- **CRT Amber** (`#ffb000` / `oklch(79.6% 0.166 76)`): The care channel. Earnest/safety notices ("RESPECT THE LOCALS", "TAKE CARE OF PEDESTRIANS") and the current selection/active affordance. Its rarity is what makes it read as "attention."
- **Amber Dim** (`#cc7a00` / `oklch(63% 0.145 70)`): Amber borders/secondary amber text.

### Tertiary
- **Alert Red** (`#ff2e2e` / `oklch(63% 0.24 27)`): Hard failures only (map load error, destructive confirmation). Not a general accent — if it appears, something is wrong.

### Neutral
- **CRT Black** (`#000000`): The ground. The default body background — a real switched-off-monitor black, not a tinted charcoal.
- **Surface** (`#0a0f0a` / `oklch(14% 0.012 150)`): Barely-lifted green-tinted near-black for panels, dropdown bodies, and the map frame's backing.
- **Surface Raised** (`#0d160d`): Active-tab and hover fills — the next step up, still nearly black.
- **Line** (`#0f3d17`): Green-tinted hairline dividers and separators.

### Map Palette (Vienna basemap only)
A city map needs more voices than two phosphors can give: road classes, water, green space, relief and pins each have to read as their own thing at a glance on a phone in sunlight. So the map, and only the map, draws on two period sources — the **P7 radar phosphor**'s yellow-green afterglow for roads and labels, and the **IBM 3279** colour terminal's blue-violet for water. Direct sun on a glossy screen washes out anything dimmer than about `#00b800`, so the dim fills, contours and relief are decoration; meaning lives in line brightness, width, labels and pin shape. Every line that carries meaning clears 3 : 1 against black and every label 4.5 : 1, and every line is solid — width carries rank, never a dash. `terminal-map-style.spec.ts` asserts all three; `MAP_PALETTE` in `map-palette.ts` is the code mirror.

| Role | Hex | Role | Hex |
| --- | --- | --- | --- |
| Water fill | `#101a58` | Motorway / trunk | `#d8ff4d` |
| Water shoreline | `#5a8cff` | Primary / secondary | `#b0e63c` |
| Water label | `#7aa2ff` | Tertiary / minor | `#7fbf34` |
| Green space | `#0b2a14` | Service / track / busway | `#557f2a` |
| Plaza / pier area | `#1e2410` | Path (cycleway, pedestrian street, pier) | `#6ee7c8` |
| Building fill | `#0e1512` | Rail / tram / U-Bahn (at 0.8) | `#8aa8a0` |
| Building outline | `#3f6a50` | Street label | `#c8f060` |
| Relief highlight | `#0d2c44` | Place label | `#e8ffb8` |
| Contour minor | `#24402f` | Ground, road casing, relief shadow | `bg` |
| Contour major | `#4f7f62` | Pins | `phosphor`, `phosphor-dim` |
| Contour label | `#7fae92` | Selection | `amber` |

### Named Rules
**The Two-Phosphor Rule.** In the UI chrome only green and amber are voices. Green is the default; amber is earnest/selected. Everything else (surfaces, lines) is a near-black tint of green, and any third decorative color is forbidden. The Vienna basemap's **Map Palette** is the single documented exception; on the map, amber remains the selection channel alone and the pins keep phosphor green.

**The No-White Rule.** `#ffffff` (and near-white grays) are banned on every surface, the basemap included now that the site draws it. White is the failure signature: nothing on screen is white, every empty/loading/error state falls back to `surface`, and the map chrome that arrives white (MapLibre's popup box, its tip, the attribution control) is repainted in the palette rather than left as shipped.

*Ruled 2026-09-13, so a sweep does not re-raise it:* `--color-phosphor-bright` (`#b6ffb6`) is the lightest colour the site paints — it tops the phosphor ramp and lights the gallery arrow on hover and focus. It is a pale mint at full green saturation, not a near-white gray, and the rule does not reach it. An on-device sweep of every visible element plus every pixel of the map's drawing buffer found nothing else above it, and no pixel with all three channels above 200.

*Ruled 2026-10-09 for the Map Palette:* the lightest colours the site now paints are the map's place labels (`#e8ffb8`) and motorways (`#d8ff4d`), both above `#b6ffb6`. Neither has all three channels above 200, and no Map Palette colour does, so the rule holds; `terminal-map-style.spec.ts` asserts it for every colour in the style.

**The Rarity Rule.** Amber covers ≤10% of any screen. If a screen has amber in more than one role at once, cut it back to the single most-earnest one.

## 3. Typography

**Display Font:** IBM Plex Mono (fallback: 'Courier New', monospace)
**Body Font:** IBM Plex Mono (fallback: 'Courier New', monospace)
**Label/Mono Font:** IBM Plex Mono (same family)

**Character:** One monospace family, self-hosted, in several weights — the entire interface is a character grid, so a single mono in 400/500/600 carries display, body, and labels without ever pairing two similar sans/monos. IBM Plex Mono replaces both the old `Courier New` and the stray Roboto; it's more legible than Courier at small sizes (the sunlight/mobile priority) while still reading unmistakably as terminal. `'Courier New'` remains only as the offline fallback, and the ASCII animation relies on the fixed advance width a monospace guarantees.

### Hierarchy
- **Display** (600, `clamp(1.25rem, 4vw, 2.5rem)`, lh 1.1): The typewriter intro and looping ASCII headers. Ceiling stays modest — a terminal doesn't shout at 96px.
- **Headline** (600, `clamp(1.1rem, 2.5vw, 1.5rem)`, lh 1.15): Page/section titles.
- **Title** (500, `1.125rem`, lh 1.2): Sub-sections, the selected city.
- **Body** (400, `clamp(0.9rem, 1.6vw, 1rem)`, lh 1.5): Spot descriptions and prose. Cap measure at 65–75ch.
- **Label** (500, `0.8125rem`, `+0.08em` tracking, UPPERCASE): Nav, field labels, terminal chrome ("City", "ACCESS GRANTED").

### Named Rules
**The One-Grid Rule.** Everything is monospace. No proportional font enters the interface — not for "friendly" body copy, not for headings. The grid is the brand. The one documented exception is the map: the basemap and pin labels the map renderer draws are set in Noto Sans (Regular, Bold, Italic), because the keyless OpenFreeMap glyph server serves no monospace font. The exception covers those renderer-drawn labels only, never UI chrome.

**The Restrained-Caps Rule.** UPPERCASE + tracking is for labels and terminal system-copy only, not for body prose (long uppercase runs kill the sunlight read).

## 4. Elevation

This system has **no conventional shadows.** Depth is carried entirely by **phosphor glow** — a CRT beam blooming off text and edges. A surface feels "closer" when its glow is hotter and wider, "further" when the beam is tight or absent. Flat black is the resting plane; glow is the only lift.

### Shadow Vocabulary (glow, not shadow)
- **Text glow — resting** (`text-shadow: 0 0 2px #00ff00, 0 0 4px #00ff00, 0 0 6px #00ff00`): Default phosphor bloom on all green text. Present everywhere, low intensity.
- **Text glow — hot** (`text-shadow: 0 0 4px #00ff00, 0 0 8px #00ff00, 0 0 12px #00ff00`): Hover/active/emphasis. The beam intensifies on interaction.
- **Edge glow — frame** (`box-shadow: 0 0 24px rgba(0,255,0,0.35)`): The map frame and focused fields — a soft green halo that reads as "this is live."
- **Edge glow — active** (`box-shadow: 0 0 30px rgba(0,255,0,0.5), inset 0 0 2px rgba(0,255,120,0.6)`): The current nav tab / selected option.
- **Amber glow** (`text-shadow: 0 0 4px #ffb000, 0 0 8px #ffb000`): The care channel's bloom; identical grammar, amber hue.

### Named Rules
**The Glow-Is-The-Shadow Rule.** Never add a dark/gray `box-shadow` or `filter: drop-shadow(black)`. Elevation is always a colored bloom of phosphor (green, or amber for the care channel). If a component needs to feel raised, raise its glow, not a gray shadow.

**The Bloom-Budget Rule.** Glow must not smear legibility. Resting text glow stays ≤6px radius so letters keep clean edges in sunlight; only non-text chrome (frames, active tabs) uses the wide 24–30px halos.

## 5. Components

### Buttons
- **Shape:** sharp — 2px radius (`{rounded.sm}`), never pill.
- **Primary:** phosphor-green text/border on `surface`, resting text-glow; padding `10px 16px`, UPPERCASE label.
- **Hover / Focus:** beam intensifies to hot text-glow + a `0 0 20px rgba(0,255,0,0.4)` edge halo; `:focus-visible` gets a 1px phosphor outline offset 2px. Transitions ~200ms ease-out.
- **Care variant:** same grammar in amber — for earnest actions only.

### Inputs / Fields (the city select)
- **Style:** phosphor text on `surface`, 1px phosphor-deep border, 2–4px radius. Replaces the current Material Azure prebuilt look entirely — the dropdown **panel** must be `surface` (near-black), never the default white overlay, with phosphor options.
- **Focus:** border brightens phosphor + `0 0 20px rgba(0,255,0,0.4)` glow; label stays phosphor.
- **Selected option:** amber text + `surface-raised` fill + active edge-glow (the one place amber marks "current"). Other options phosphor on transparent; hover raises glow.
- **Error / Disabled:** error border alert-red; disabled uses phosphor-deep, no glow.

### Navigation
- **Style:** a horizontal terminal tab bar (top, desktop) / fixed bottom bar (mobile ≤768px) on `surface` with a phosphor-deep hairline.
- **Icons:** monochrome **terminal glyphs**, not color emoji — drawn as phosphor line-marks / ASCII (e.g. a house, a pin, an info mark rendered in green stroke). They inherit the text color and glow.
- **States:** default phosphor label + resting glow; hover intensifies glow + faint `surface-raised`; **active** = phosphor-bright label on `surface-raised` with active edge-glow. Optional per-character glitch on hover/active (the existing GlitchText behavior) — honor `prefers-reduced-motion`.

### Map Frame (signature)
- **Corner Style:** 4px radius, `overflow: hidden`.
- **Background:** `surface` (near-black) — the backing both renderers sit on, so a blank/slow/failed map reads black-green, **never white**.
- **Glow Strategy:** `box-shadow: 0 0 24px rgba(0,255,0,0.35)` frame halo.
- **Loading:** the matrix-radar spinner (green ASCII rotor) over `surface`, with the renderer held at `opacity: 0` and faded in only once it reports a first paint.
- **Error/timeout:** an opaque `surface` overlay carrying the phosphor line `> SIGNAL LOST // MAP UNREACHABLE` and a `> RETRY` button (phosphor on a phosphor-deep border, hot glow on hover/focus) — not a white void. A browser that cannot give MapLibre the WebGL 2 context it needs gets `> NO RENDERER // THIS BROWSER CANNOT DRAW THE MAP` and **no** retry, because rebuilding the map in the same page cannot help. The line states the outcome rather than the cause, because the cause varies and the app cannot tell which one it hit: an old renderer, graphics acceleration switched off, a blocklisted GPU, or too many live contexts on the page. Naming any one of them would be false for the other three.

### Map Surface (signature — Vienna)
The site's own map, drawn from OpenFreeMap vector tiles in the palette above. Everything here is the terminal system, not a theme layered over a street map.

- **Basemap:** a radar-phosphor street map of the city in the Map Palette. True-black ground; water in 3279 blue-violet with a brighter shoreline; parks, grass and wood a dark green; pedestrian squares and piers mapped as areas a subtle olive fill with no outline. Buildings fade in from z14.5 as a mid-tone block and take a green outline from z15.5. Roads climb four tiers by class up the afterglow ladder — motorway and trunk brightest and widest, then primary and secondary, tertiary and minor, and service, track and busway dimmest and thinnest from z13 — each scaled by zoom, and the two widest tiers run on a black casing so parallel carriageways stay two lines. Cycleways, pedestrian streets and piers — the ways a skater rolls on but does not drive — are drawn in a cool teal, paved ones only; footways, steps and trails stay off, since they crowded Karlsplatz and a trail is no ground to skate. Tram, rail and U-Bahn track is a muted grey-green at 0.8. Every line is solid: width carries rank, never a dash. What decides whether a way is drawn at all is whether it can be seen from the street: everything in a tunnel drops out, road and rail alike, and what runs in the open stays — the U-Bahn on a viaduct is a landmark, and so is the same line at grade. Station platforms and indoor corridors are transit furniture and stay off.
- **Basemap labels:** street names in pale radar-phosphor along the street, place names in the palest afterglow in Noto Sans Bold, water names in blue italic — all UPPERCASE and letterspaced (street `0.12em`, place `0.14em`, water `0.2em`) over a 1.5px black halo so they stay legible over the strokes beneath.
- **Elevation:** a faint blue hillshade on the sunward slopes and medium-density contour lines — 50/100 m from z11, 25/100 m from z13, 10/50 m from z15 — with the major contours labelled `<height> M` from z13. The terrain is Mapterhorn's keyless DEM (BEV 1 m over Vienna) and it is decoration: the map and its pins paint without waiting for it, and the relief appears once its tiles arrive. If the terrain library fails to load there is no relief; if the provider is unreachable or slow, the map stays flat and its tile errors are logged to the console.
- **Pins:** status reads by shape, so it survives colour-blindness. An `active` spot is a filled 6px phosphor dot with a blurred 14px bloom behind it (glow is depth, here too); an `unclassified` one a smaller 4.5px dot with a weaker bloom; a `demolished` one a hollow phosphor-dim ring with a ×, and no bloom (the ring is filled with the black ground and the × carries the labels' 1.5px black halo, so neither melts into a road it crosses) — present but receding, the archive's "this one is gone" state. An invisible 22px hit circle keeps the thumb target thumb-sized while the dot stays small.
- **Selected pin:** the tapped pin grows a step, a black gap cuts it out, and a thick 3px **amber** ring sits over the bloom's outer edge. It reads by contrast, not hue — phosphor and amber collapse to the same ochre under deuteranopia, while black against amber holds about 11.5 : 1 under every colour-vision deficiency. Selecting a pin fires a one-shot 450ms lock-on: an amber ring closes in from 34px and fades out onto the ring (skipped under `prefers-reduced-motion`). One pin at a time; this is amber's only role on the map (the care/selection channel), and it clears when the popup closes.
- **Popup:** MapLibre's own box, repainted — `surface` fill, `line` 1px border, 2px radius, the frame glow halo, and the anchor tip recoloured on every side. Max width 320px; the close button is a 44px phosphor-dim glyph that brightens to phosphor. Inside, in order: the photo gallery (only when the spot has photos), the spot name as an UPPERCASE phosphor label, `> DEMOLISHED` in phosphor-dim for a lost spot, and a `> DIRECTIONS` link. The status line carries no bloom — the text form of the ghosted pin — which also keeps amber to the selection ring alone.
- **Directions:** a Google Maps URL (`maps/dir/?api=1&destination=<lat>,<lng>`) opened in a new browsing context (`target="_blank"`, `rel="noopener noreferrer"`). Where the Google Maps app claims the link it takes the coordinates and the phone switches apps; everywhere else — every desktop browser, an iPhone whose maps app is Apple Maps, an Android without Google Maps — the new tab lands on Google's maps site with the route ready. Either way the archive tab is left standing: the map, the selected pin and the open popup are still there to come back to, and the archive itself is never replaced by a hosted map. It is kept as the destination because it is the only single URL that reaches a native maps app on both phone platforms and degrades to a usable route rather than to nothing — a `geo:` URI is app-neutral and Android honours it, but iOS registers no handler, so it is a dead tap in Safari, and `maps.apple.com` deep-links on Apple's platforms alone.
- **Photo gallery:** a 4:3 `surface` panel with a `line` border. With more than one photo it gains `‹` / `›` phosphor nav buttons (44px, translucent `surface` fill, phosphor-deep border) and a phosphor-dim `[n/N]` counter bottom-right; a horizontal swipe does the same thing on touch.
- **Gestures:** pan and zoom only — rotation and pitch are off, so the grid never tilts off true north. `touch-action: none` is scoped to the map canvas alone, so every touch on the map belongs to the map while the rest of the page keeps native pinch-zoom.
- **Attribution:** the OSM / OpenMapTiles credit stays on screen — it is a licence condition, so it is restyled, never hidden: compact, phosphor-dim mono on `surface`, with MapLibre's info glyph refilled in phosphor-dim. With terrain drawn it also credits © Mapterhorn (linked to its attribution page), DGM © BEV (CC BY 4.0), and Copernicus GLO-30 (© DLR e.V. 2010–2014, © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the EU and ESA).

### ASCII Animation (signature)
- The typewriter/glitch/collapse phosphor headline. Display type, hot-glow on the active char/cursor. Its timing is brand-critical and preserved; it must expose a `prefers-reduced-motion` path (render final text statically, no per-frame glitch).

### Matrix Radar Loader (signature)
- The rotating character-ring spinner in phosphor green on `surface`. Reduced-motion: a static ring or a simple "LOADING…" phosphor line.

## 6. Do's and Don'ts

### Do:
- **Do** keep true black (`#000000`) as the ground and phosphor green (`#00ff00`) as the default ink; author color in OKLCH.
- **Do** reserve amber (`#ffb000`) for earnest/safety copy and the single current selection — the care channel, ≤10% of any screen.
- **Do** express all depth as phosphor **glow** (green, or amber for care), per the Glow-Is-The-Shadow Rule.
- **Do** set everything in IBM Plex Mono (self-hosted); keep the whole UI on one character grid.
- **Do** keep corners sharp (0–4px) and give every heavy animation a `prefers-reduced-motion` fallback.
- **Do** frame the map — the site's own or the remaining Google embed — in `surface` + green glow so a blank frame reads black, never white.

### Don't:
- **Don't** ship **white** or near-white surfaces anywhere (the No-White Rule) — the map has no carve-out: its basemap is drawn on true black like every other surface, and no Map Palette colour reaches white.
- **Don't** drift into **corporate / Google-Maps polish**, **Strava/Instagram social** cards and gradients, **over-gamified/cutesy** badges, or a **generic dark-mode SaaS template** — all named anti-references in PRODUCT.md. Dark ≠ this; retro-computing intent is the difference.
- **Don't** use gray/black drop-shadows, frosted glassmorphism, rounded pill shapes, or proportional (non-mono) fonts (the map renderer's Noto Sans basemap and pin labels are the one exception, see the One-Grid Rule).
- **Don't** introduce a third decorative color into the UI chrome (the Vienna basemap's Map Palette is the one documented exception), or let amber sprawl past the care/selection role.
- **Don't** use full-color emoji as UI icons — render terminal glyphs in phosphor instead.
- **Don't** let glow smear text legibility; resting text glow stays ≤6px so it survives sunlight on a phone.
