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
  map-contour-label: "#8fc4a4"
  map-road-major: "#d8ff4d"
  map-road-arterial: "#b0e63c"
  map-road-local: "#7fbf34"
  map-road-service: "#557f2a"
  map-path: "#6ee7c8"
  map-rail: "#92b0a8"
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
  sm: "4px"
  md: "6px"
  lg: "8px"
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
    padding: "9px"
  nav-link-active:
    textColor: "{colors.phosphor}"
    backgroundColor: "rgba(0, 255, 0, 0.07)"
    rounded: "{rounded.md}"
    padding: "9px"
  select-field:
    textColor: "{colors.phosphor}"
    backgroundColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  map-canvas:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "0"
  spot-column:
    textColor: "{colors.phosphor}"
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.none}"
    padding: "0"
    width: "384px"
  spot-sheet:
    textColor: "{colors.phosphor}"
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "0"
  spot-row:
    textColor: "{colors.phosphor-bright}"
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  spot-detail:
    textColor: "{colors.phosphor}"
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.none}"
    padding: "16px"
  photo-pin:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0"
  spot-tooltip:
    textColor: "{colors.phosphor-bright}"
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "6px"
  notice-care:
    textColor: "{colors.amber}"
    typography: "{typography.label}"
    padding: "8px 12px"
  admin-header:
    textColor: "{colors.phosphor-bright}"
    backgroundColor: "{colors.bg}"
    rounded: "{rounded.none}"
    padding: "8px 0"
  step-panel:
    textColor: "{colors.phosphor}"
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "14px"
  candidate-row:
    textColor: "{colors.phosphor-bright}"
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.none}"
    padding: "12px 0"
  photo-strip-item:
    textColor: "{colors.phosphor}"
    backgroundColor: "{colors.bg}"
    rounded: "{rounded.sm}"
    padding: "12px 0"
  picker-frame:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "0"
---

# Design System: Spotmap Compendium

## 1. Overview

**Creative North Star: "The Phosphor Archive"**

This is a green-phosphor CRT terminal that happens to be a skate-spot archive. Every surface the site controls should read like a monochrome monitor glowing in a dark room circa the era before the web looked like today — a machine you'd find in a squat, wired to a bulletin board of spots that locals pass down. The glow is not decoration; it's the light source. Depth, focus, and emphasis are all expressed as **phosphor bloom**, never as modern drop-shadows or frosted glass.

The system is disciplined to two phosphors. **Green** is the voice of the archive — every spot name, city, label, and body line. **Amber** is the rare second channel, reserved for the moments the culture is being earnest: respect-the-locals and safety notices, and the one thing you've currently selected. That restraint is the point; if amber shows up everywhere it stops meaning "pay attention." It explicitly rejects the things PRODUCT.md names: corporate/Google-Maps neutrality, Strava/Instagram social polish, cutesy gamification, and — most importantly — the "modern dark-mode SaaS" look. Dark is not the same as this. The difference is retro-computing *intent*: soft CRT corners, monospace everything, scanline-and-glitch motion, a true-black ground, and zero rounded friendly gradients.

Every city's map is drawn by the site itself — the basemap is ours, not someone else's map recoloured from the outside — in the **Map Palette** (§2): radar-phosphor roads and labels and CRT blue-violet water, the one place a hue beyond the two phosphors is allowed, because a city map needs more distinct voices than two.

**Key Characteristics:**
- **True-black ground, phosphor-green ink**, amber as the rare second phosphor.
- **Monospace everything** (IBM Plex Mono) — the whole world is a character grid.
- **Glow is depth.** No conventional shadows; elevation is bloom intensity.
- **Soft CRT corners.** Every element rounds on the R1 scale — 4 / 6 / 8 px; no pills, the pin stays the only circle. The one exception is the map loader's progress fill, whose radius is `calc(var(--radius-sm) - 3px)` so it stays concentric with its 4px track: it is only 8px tall, and the track's radius would round it into a pill.
- **Nothing jumps.** Every transition eases or crossfades — state swaps, overlays, camera moves, the sheet, the split handle's reset, the list/detail pane, the photo viewer, the selection flag and the loaders. Under `prefers-reduced-motion` movement stops on a still frame but changes still fade (≈200 ms, `--dur-fade`), never a hard cut.
- **Legible first.** It's used one-handed, outdoors, in sunlight — the vibe never beats the read. No text renders below 12 px, and captions, notes and prose carry no glow.

## 2. Colors

A single-hue phosphor system for the UI chrome: one saturated green carries ~95% of every screen's chrome against true black, with a period-accurate CRT amber as the only second voice. The basemap is the one documented exception — see the Map Palette below. Canonical values are authored in **OKLCH** in the CSS layer; the frontmatter carries sRGB hex for tooling compatibility.

### Primary
- **Phosphor Green** (`#00ff00` / `oklch(86.6% 0.2948 142.5)`): The archive's voice. All primary text, city names, nav labels, borders-at-strength, and the glow itself. On true black this clears AA for body and large text comfortably.
- **Phosphor Bright** (`#b6ffb6` / `oklch(93% 0.12 145)`): Resting Display text (the spot's name in the list and the detail, page titles and section headings, the loader's letters, the ASCII banners) and the lit label of every bloom control — where the beam is hottest. Used sparingly for names and glow highlights, not for body.
- **Phosphor Dim** (`#00b800` / `oklch(70% 0.22 145)`): Secondary/muted text and quiet metadata. The dimmer beam — still ≥4.5:1 on black, so it never drops below readable.
- **Phosphor Deep** (`#005a00` / `oklch(45% 0.14 145)`): Structural lines, inactive dividers, disabled strokes. Present but receding.

### Secondary
- **CRT Amber** (`#ffb000` / `oklch(79.6% 0.166 76)`): The care channel. Earnest/safety notices ("RESPECT THE LOCALS", "TAKE CARE OF PEDESTRIANS") and the current selection/active affordance. Its rarity is what makes it read as "attention."
- **Amber Dim** (`#cc7a00` / `oklch(63% 0.145 70)`): Amber borders/secondary amber text.

### Tertiary
- **Alert Red** (`#ff2e2e` / `oklch(63% 0.24 27)`): Hard failures only (map load error, destructive confirmation). Not a general accent — if it appears, something is wrong.

### Neutral
- **CRT Black** (`#000000`): The ground. The default body background — a real switched-off-monitor black, not a tinted charcoal.
- **Surface** (`#0a0f0a` / `oklch(14% 0.012 150)`): Barely-lifted green-tinted near-black for panels, dropdown bodies, the spot column and sheet, and the map's backing.
- **Surface Raised** (`#0d160d`): The selected option's fill and the map's attribution button — the next step up, still nearly black.
- **Line** (`#0f3d17`): Green-tinted hairline dividers and separators.

### Map Palette (basemap only)
A city map needs more voices than two phosphors can give: road classes, water, green space, relief and pins each have to read as their own thing at a glance on a phone in sunlight. So the map, and only the map, draws on two period sources — the **P7 radar phosphor**'s yellow-green afterglow for roads and labels, and the **IBM 3279** colour terminal's blue-violet for water. Direct sun on a glossy screen washes out anything dimmer than about `#00b800`, so the dim fills, contours and relief are decoration; meaning lives in line brightness, width, labels and pin shape. Every line that carries meaning clears 3 : 1 against black and every label 4.5 : 1, and every line is solid — width carries rank, never a dash. `terminal-map-style.spec.ts` asserts all three; `MAP_PALETTE` in `map-palette.ts` is the code mirror.

| Role | Hex | Role | Hex |
| --- | --- | --- | --- |
| Water fill | `#101a58` | Motorway / trunk | `#d8ff4d` |
| Water shoreline | `#5a8cff` | Primary / secondary | `#b0e63c` |
| Water label | `#7aa2ff` | Tertiary / minor | `#7fbf34` |
| Green space | `#0b2a14` | Service / track / busway | `#557f2a` |
| Plaza / pier area | `#1e2410` | Path (cycleway, pedestrian street, pier) | `#6ee7c8` |
| Building fill | `#0e1512` | Rail / tram / U-Bahn | `#92b0a8` |
| Building outline | `#3f6a50` | Street label | `#c8f060` |
| Relief highlight | `#0d2c44` | Place label | `#e8ffb8` |
| Contour minor | `#24402f` | Ground, road casing, relief shadow | `bg` |
| Contour major | `#4f7f62` | Pins | `phosphor`, `phosphor-dim` |
| Contour label | `#8fc4a4` | Selection | `amber` |

### Named Rules
**The Two-Phosphor Rule.** In the UI chrome only green and amber are voices. Green is the default; amber is earnest/selected. Everything else (surfaces, lines) is a near-black tint of green, and any third decorative color is forbidden. The basemap's **Map Palette** is the single documented exception; on the map, amber remains the selection channel alone and the pins keep phosphor green.

**The No-White Rule.** `#ffffff` (and near-white grays) are banned on every surface, the basemap included now that the site draws it. White is the failure signature: nothing on screen is white, every empty/loading/error state falls back to `surface`, and the map chrome that arrives white (the attribution control) is repainted in the palette rather than left as shipped.

*Ruled 2026-09-13, so a sweep does not re-raise it:* `--color-phosphor-bright` (`#b6ffb6`) is the lightest colour the site paints — it tops the phosphor ramp, paints Display text at rest and lights the label of every bloom control on hover and focus. It is a pale mint at full green saturation, not a near-white gray, and the rule does not reach it. An on-device sweep of every visible element plus every pixel of the map's drawing buffer found nothing else above it, and no pixel with all three channels above 200.

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
**The One-Grid Rule.** Everything is monospace. No proportional font enters the interface — not for "friendly" body copy, not for headings. The grid is the brand. The one documented exception is the map: the basemap labels and the demolished pin's `×` mark, both drawn by the map renderer, are set in Noto Sans (Regular, Bold, Italic), because the keyless OpenFreeMap glyph server serves no monospace font. The exception covers those renderer-drawn glyphs only, never UI chrome.

**The Restrained-Caps Rule.** UPPERCASE + tracking is for labels and terminal system-copy only, not for body prose (long uppercase runs kill the sunlight read).

## 4. Elevation

This system has **no conventional shadows.** Depth is carried entirely by **phosphor glow** — a CRT beam blooming off text and edges. A surface feels "closer" when its glow is hotter and wider, "further" when the beam is tight or absent. Flat black is the resting plane; glow is the only lift.

### Shadow Vocabulary (glow, not shadow)
- **Text glow — Display** (`--glow-text-display`: `0 0 2px rgba(0,255,0,.95), 0 0 6px rgba(0,255,0,.6)`, ink `phosphor-bright`): names and headings — the spot's name in the list and the detail, page titles and section headings, the loader's letters, the ASCII banners. A pale mint core over a green halo, so the letter's edge carries the read and the halo only colours it.
- **Text glow — Standard** (`--glow-text-standard`: `0 0 2px rgba(0,255,0,.7), 0 0 6px rgba(0,255,0,.35)`, ink `phosphor`): interactive and status labels — nav links, buttons and links, the city select, the map-error line, the rail's and the viewer's SIGNAL LOST line, the loader's current step.
- **Unlit** (no `text-shadow`, ink `phosphor` or `phosphor-dim`): everything else, and the default — prose, notes, captions, counters, status and rights lines, the terminal titlebar, dim lines, the photo rain. Text glows only where its own stylesheet opts into a tier.
- **Amber glow** (`--glow-text-amber`: `0 0 2px rgba(255,176,0,.7), 0 0 6px rgba(255,176,0,.35)`): the care notice; Standard's grammar in amber.
- **Edge glow — frame** (`box-shadow: 0 0 24px rgba(0,255,0,0.35)`): Focused fields, the open city select, the map frame and the photo viewer's window — a soft green halo that reads as "this is live."
- **Edge glow — pointer bloom** (`box-shadow: 0 0 14px rgba(0,255,0,.35), inset 0 0 0 1px rgba(0,255,0,.35)`; `.6` while pressed): the lit state of every control (§5 Buttons). Inside a clipping box (the rail and viewer photos, the list rows) only the inset edge lights.

### Named Rules
**The Glow-Is-The-Shadow Rule.** Never add a dark/gray `box-shadow` or `filter: drop-shadow(black)`. Elevation is always a colored bloom of phosphor (green, or amber for the care channel). If a component needs to feel raised, raise its glow, not a gray shadow.

**The Bloom-Budget Rule.** Glow must not smear legibility. Text glows in one of three tiers — Display, Standard or Unlit — and Unlit is the default; no halo on text reaches past 6 px, and small copy (captions, counters, notes) is always unlit. No text renders below 12 px (the MapLibre attribution, a licence line, is the one exception). Only non-text chrome uses wider halos: the 24 px frame halo and the pointer bloom's 14 px edge.

## 5. Components

### Buttons
- **Shape:** soft — 4px radius (`{rounded.sm}`), never pill.
- **Primary:** phosphor label in the Standard tier on a transparent or `surface` fill, with a 1px `phosphor-deep` border where the control needs an edge (RETRY, ENTER THE MAP, the viewer's arrows); padding `10px 16px`, UPPERCASE label.
- **Hover / Focus / Press — the pointer bloom:** one shared effect on every interactive element (nav links, buttons, links, the detail's directions and share, the back and close plates, the viewer's plates and the split handle's grip, list rows, the city select and its options). A single radial gradient fades in under the label, centred on the pointer and peaking at 40% green (capped there so the lit label keeps 4.5:1); a 1px inset green edge and a 14px green halo appear, both at 35%; the label steps up to the Display tier. Pressing strengthens the edge and halo to 60%. It lights in 120 ms (`--dur-hover-in`) and decays over 700 ms (`--dur-hover-out`), ease-out; only colour, glow, border, background and shadow transition. Hover lights only on devices with a hover pointer, so a tap flashes and decays instead of sticking. `:focus-visible` shows the same lit state plus a 1px phosphor outline offset 2px (pulled inside where the control sits against a clipping edge). Disabled controls do not light. Opt-in is the `phosphor-bloom` class (`phosphor-bloom--inset` inside the rail, the viewer and the list; `phosphor-bloom--plate` adds the resting outline and backing for controls floating over a photo); `appPointerBloom` makes the bloom follow the pointer.
- **Care variant:** same grammar in amber — for earnest actions only.

### Inputs / Fields (the city select)
- **Style:** phosphor text on `surface`, 1px phosphor-deep border, 6px radius (`{rounded.md}`). Replaces the current Material Azure prebuilt look entirely — the dropdown **panel** must be `surface` (near-black), never the default white overlay, with phosphor options.
- **Hover / Focus:** the pointer bloom (centred) on the field; while the panel is open the field keeps the 24px frame halo; label and value rest in the Standard tier and step up to the Display tier (bright mint) while the field is lit.
- **Selected option:** amber text + `surface-raised` fill (the one place amber marks "current"). Every option, the selected one included, lights with the inset pointer bloom (the panel clips an outer halo) on hover and keyboard highlight; a disabled option does not light, and while the pointer rests on one option the keyboard-highlighted one steps back to rest, so one option is lit at a time.
- **Error / Disabled:** error border alert-red; disabled uses phosphor-deep, no glow.

### Navigation
- **Style:** a horizontal terminal tab bar (top, desktop) / fixed bottom bar (mobile ≤768px). On mobile it sits on a 95% black backing under a 30% phosphor top hairline; on desktop it has no backing of its own and a 30% phosphor bottom hairline.
- **Icons:** monochrome **terminal glyphs**, not color emoji — drawn as phosphor line-marks / ASCII (e.g. a house, a pin, an info mark rendered in green stroke). They inherit the text color and glow.
- **States:** default phosphor label in the Standard tier; hover, focus and press are the pointer bloom; **active** (current page) = a quiet rest state below hover — 1px `phosphor-deep` border, a 7% green fill, Standard label — which still blooms on hover. Optional per-character glitch on hover/active (the existing GlitchText behavior) — honors `prefers-reduced-motion`.

### Map Canvas (signature)
- **Edges:** the map sits in a frame, never edge to edge: an 8px radius (`{rounded.lg}`), the `surface` backing, the 24px phosphor frame halo (`--shadow-edge-frame`) and clipped corners. From 1024 px the frame is one window holding the map, the split handle and the spot column, inset by a 24px page gutter on every side under the header row; below 1024 px it holds the map alone, inset 16px from the top bar (or the header row), the screen's sides and the bottom navigation (the screen's bottom edge from 769 to 1023 px), with the sheet inside it.
- **Background:** `surface` (near-black) — the backing the map sits on, so a blank/slow/failed map reads black-green, **never white**.
- **Loading:** the map loader (see Map Loader below) over `surface`: the city name locks in left to right over dim ASCII rain, and a SPOTS · MAP · DRAW bar beneath it moves on real load events only — never a timer. When the live feed fails and the archive snapshot stands in, an amber `LIVE FEED DOWN · ARCHIVE COPY` note shows under the bar. The renderer stays hidden until the bar has eased to 100 %, then the loader crossfades into the map over 300 ms (`--dur-crossfade`), the map fading in on the same beat.
- **Error/timeout:** an opaque `surface` overlay carrying the phosphor line `> SIGNAL LOST // MAP UNREACHABLE` and a `> RETRY` button (phosphor on a phosphor-deep border, lit by the pointer bloom) — not a white void. A browser that cannot give MapLibre the WebGL 2 context it needs gets `> NO RENDERER // THIS BROWSER CANNOT DRAW THE MAP` and **no** retry, because rebuilding the map in the same page cannot help. The line states the outcome rather than the cause, because the cause varies and the app cannot tell which one it hit: an old renderer, graphics acceleration switched off, a blocklisted GPU, or too many live contexts on the page. Naming any one of them would be false for the other three.

### Map page spacing
One inset per container, the same everywhere on the map page (Apple's iOS/macOS insets as the guide), all on the spacing scale:

| Role | Value | Used for |
| --- | --- | --- |
| page gutter | 24px from 1024 px, 16px below (`{spacing.lg}` / `{spacing.md}`) | page edge → header row and frame; header row → frame |
| panel inset | 16px (`{spacing.md}`) | every panel's edge → its content: the column, the sheet, the viewer window, toolbars |
| group gap | 16px (`{spacing.md}`) | between groups in a pane (photos / name + notes / actions) |
| item gap | 8px (`{spacing.sm}`) | inside a group (rail photos, rail → rights line, name → notes, buttons) |

Two elements of the same kind never differ in padding, and no content sits closer than 16px to the edge of its panel (plates floating on a photo excepted).

### Map Surface (signature)
The site's own map, drawn from OpenFreeMap vector tiles in the palette above. Everything here is the terminal system, not a theme layered over a street map.

- **Basemap:** a radar-phosphor street map of the city in the Map Palette. True-black ground; water in 3279 blue-violet with a brighter shoreline; parks, grass and wood a dark green; pedestrian squares and piers mapped as areas a subtle olive fill with no outline. Buildings fade in from z14.5 as a mid-tone block and take a green outline from z15.5. Roads climb four tiers by class up the afterglow ladder — motorway and trunk brightest and widest, then primary and secondary, tertiary and minor, and service, track and busway dimmest and thinnest from z13 — each scaled by zoom, and the two widest tiers run on a black casing so parallel carriageways stay two lines. Cycleways, pedestrian streets and piers — the ways a skater rolls on but does not drive — are drawn in a cool teal, paved ones only; footways, steps and trails stay off, since they crowded Karlsplatz and a trail is no ground to skate. Tram, rail and U-Bahn track is a muted grey-green, drawn at full opacity and kept thinner than a service road. Every line is solid: width carries rank, never a dash. What decides whether a way is drawn at all is whether it can be seen from the street: everything in a tunnel drops out, road and rail alike, and what runs in the open stays — the U-Bahn on a viaduct is a landmark, and so is the same line at grade. Station platforms and indoor corridors are transit furniture and stay off.
- **Basemap labels:** street names in pale radar-phosphor along the street, place names in the palest afterglow in Noto Sans Bold, water names in blue italic — all UPPERCASE and letterspaced (street `0.12em`, place `0.14em`, water `0.2em`) over a 1.5px black halo so they stay legible over the strokes beneath.
- **Elevation:** a faint blue hillshade on the sunward slopes and medium-density contour lines — 50/100 m from z11, 25/100 m from z13, 10/50 m from z15 — with the major contours labelled `<height> M` from z13 to z16. Contours sit under the plazas, water and buildings, so those cover them; the minor lines fade out by z16, the major ones ease back to 0.4 by z17.5, and the labels hide from z16 once the contours they sit on have gone. The terrain is Mapterhorn's keyless DEM — a survey DEM from z13 where Mapterhorn has one, Copernicus GLO-30 below that and everywhere else, so the Croatian, Serbian and Bosnian cities get GLO-30 alone and stop asking for DEM tiles at z12, where Mapterhorn's survey tiles do not exist (`demMaxzoomFor` in `elevation.ts`) — and it is decoration. The map and its pins never wait for relief. Relief is added after `load` once the terrain library is ready and appears as its tiles arrive, so a slow provider just means late relief. If the library fails to load, or is not ready within 4 s of the map painting, that build stays flat. An unreachable provider leaves the map flat and its tile errors are logged to the console.
- **Pins:** status reads by shape, so it survives colour-blindness. An `active` spot is a filled 6px phosphor dot with a blurred 14px bloom behind it (glow is depth, here too); a `demolished` one a hollow phosphor-dim ring with a ×, and no bloom (the ring is filled with the black ground and the × carries the labels' 1.5px black halo, so neither melts into a road it crosses) — present but receding, the archive's "this one is gone" state. Those are the only two states: Decision 1 (2026-10-16) made My Maps' green "new spot" marker `active`. An invisible 22px hit circle keeps the thumb target thumb-sized while the dot stays small.
- **Selected pin:** the tapped pin grows a step, a black gap cuts it out, and a thick 3px **amber** ring sits over the bloom's outer edge. It reads by contrast, not hue — phosphor and amber collapse to the same ochre under deuteranopia, while black against amber holds about 11.5 : 1 under every colour-vision deficiency. Selecting a pin fires a one-shot 450ms lock-on: an amber ring closes in from 34px and fades out onto the ring (skipped under `prefers-reduced-motion`). One pin at a time; this is amber's only role on the map (the care/selection channel), and it clears when the detail closes. With a photo host the selected spot also carries the selection flag (below).
- **Directions:** a Google Maps URL (`maps/dir/?api=1&destination=<lat>,<lng>`) opened in a new browsing context (`target="_blank"`, `rel="noopener noreferrer"`). Where the Google Maps app claims the link it takes the coordinates and the phone switches apps; everywhere else — every desktop browser, an iPhone whose maps app is Apple Maps, an Android without Google Maps — the new tab lands on Google's maps site with the route ready. Either way the archive tab is left standing: the map, the selected pin and the open detail are still there to come back to, and the archive itself is never replaced by a hosted map. It is kept as the destination because it is the only single URL that reaches a native maps app on both phone platforms and degrades to a usable route rather than to nothing — a `geo:` URI is app-neutral and Android honours it, but iOS registers no handler, so it is a dead tap in Safari, and `maps.apple.com` deep-links on Apple's platforms alone.
- **Opening view:** the map opens on the tightest box holding the city's spots that lie within 30 km of its median point (`framingBounds` in `fit-bounds.ts`). A spot farther out — Belgrade's and Zagreb's one far-off pin — is still drawn and can be panned to, but does not get to pull the opening view out to a whole region. The map is built already framed on that box — no opening fly-in.
- **Gestures:** pan and zoom only — rotation and pitch are off, so the grid never tilts off true north. `touch-action: none` is scoped to the map canvas alone, so every touch on the map belongs to the map while the rest of the page keeps native pinch-zoom.
- **Attribution:** the OSM / OpenMapTiles credit stays on screen — it is a licence condition, so it is restyled, never hidden: compact, phosphor-dim mono on `surface`, with MapLibre's info glyph refilled in phosphor-dim. On a map 640 px wide or narrower it opens collapsed to that glyph, one tap from the credits, because the full line of terrain credits would otherwise cover half of a phone-width map; on a wider one it opens expanded until the first drag, as MapLibre does. With terrain drawn it also credits © Mapterhorn (linked to its attribution page), every survey whose DEM may cover one of the picker's cities, and Copernicus GLO-30; `MAPTERHORN_DEM.attribution` in `elevation.ts` holds the exact credit line, and a city in a new country means checking it again. On the sheet layout (narrower than 1024 px) the control sits in the map frame's top-right corner, where the sheet never covers it; its styling and collapse rule are the same.

### Spot browser (signature)
The map page shows the spots in view beside or under the map, and opens one into its detail. One pane — the list or the open spot — is rendered into the column on a wide screen and into the sheet on a phone; list and detail crossfade in one cell with an 8px horizontal settle (200 ms, `--dur-fast`), never a cut.

- **Header row and spot column (≥ 1024 px):** under the top navigation, a header row carries the cycling ASCII banner (Display tier, full text, 20px) on the left and the city select (40px) on the right. Below it, the framed window holds the map and the spot column side by side, split by a draggable handle: a 1px 30 % phosphor hairline in a 16px hit area with an 8 × 40px grip plate (4px radius, `phosphor-deep` border, `surface` fill) that takes the pointer bloom on hover, focus and drag. Dragging resizes both sides live and the map keeps its centre. The handle is a focusable window splitter: ← widens the column and → narrows it by 16px, Shift + arrow by 64px, Home and End go to the limits, and a double-click eases the column back to its default 384px over 330 ms (at once under reduced motion). The column is at least 340px and at most half the window, and its share of the window is remembered on the device and held when the window resizes. The column (`surface`, no frame of its own) starts with a fixed 64px toolbar (16px around its content, a 1px `line` rule under it): `> 9 SPOTS IN VIEW` (`> 1 SPOT IN VIEW`, `> LOADING SPOTS…`) with a dim `A–Z`, or, while a spot is open, the `< OVERVIEW` plate back to the list (one 32px plate drawn, 44px to the touch: a plain `<` and the word in UPPERCASE Label type, no count), with nothing on the toolbar's right; the two crossfade. The pane scrolls under it. The column sits on the right on purpose: a left-hand results column is the Google-Maps look PRODUCT.md rejects.
- **Top bar and spot sheet (< 1024 px):** on a phone (≤ 768 px) a top bar with 16px padding on every side (below the safe area) holds two fixed rows 8px apart, each as wide as the bar's content and neither sized by the line playing or the city: the banner (14px, on a 24px row) over the city select (40px tall, its floating `CITY` label riding the gap above it), the bar 104px tall in all; the banner keeps cycling `SPOTMAP`, the city line and the house-voice lines as described under ASCII Animation, so nothing in the bar is ever clipped, `Bratislava · SK` included at 320px. From 769 to 1023 px the wide header row (16px gutter) takes its place. The sheet sits inside the map's frame, on its left, right and bottom edges: `surface`, a 1px `line` border, an 8px radius on every corner. Its head is 64px (16px padding, the grab handle inside the top padding, a 1px `line` rule under it while open). Three heights, each reachable by tapping: **peek** (the head alone: `> 9 SPOTS IN VIEW` and `LIST ▲`), **list** and **detail** (both half the frame, never more: `MAP ▼`; the `< OVERVIEW` plate back to the list and `✕` down to peek). At peek and list the head is one button named for what tapping does ("Show list" / "Show map"). The head stays put and the body scrolls under it. Heights ease over 330 ms on `--ease-out-expo`; under reduced motion the height changes without travel and the pane still fades. A tap on empty map closes an open spot to peek. "In view" on a phone means the part of the frame the sheet does not cover, and the camera treats it like the wide layout: a selected pin already visible there (ring and flag included) stays still, a hidden one eases so that it and its flag sit in the middle of it, and a shared link opens with the pin in that middle. Closing a spot, by any route (the plate, `✕`, a tap on empty map, Back), leaves the map exactly where it is, and the list comes back live for the view the map is in.
- **Spot list row:** one row per spot in view, A–Z by name (locale-aware, case- and accent-insensitive), each a real link to `/spot/<id>` that opens in place (middle-click still opens a new tab). A 4:3 thumbnail of the first photo (1px `line` border, 4px radius; a dim `NO PHOTO` plate when there is none or no photo host), the name in UPPERCASE `phosphor-bright` without glow at rest, and a dim line with the photo count, prefixed `DEMOLISHED ·` for a lost spot. Rows entering or leaving the view fade; the list stays frozen while a spot is open and comes back live when it closes. Hovering a row lights its pin and hovering a pin lights its row (hover-capable pointers only). Empty view: `> NO SPOTS IN VIEW` over a dim "pan around or zoom out. the city's bigger than this." While the city loads: a dim `> LOADING SPOTS…`.
- **Spot detail:** a region named by the spot, padded 16px, in groups 16px apart: the photo rail with `© all rights reserved` under it (small, unlit `phosphor-dim`, 8px below), the name (Display tier) over the notes verbatim (unlit, line breaks kept), `> DEMOLISHED` for a lost spot, then two 44px plates with the pointer bloom, `> DIRECTIONS` and the share control. Without photos, or without a photo host, the rail and the rights line drop out and the detail starts at the name. Opening shows what the list already knows (name, first photo) in the rail's reserved box and crossfades the rest in when the detail arrives; a detail that cannot be loaded shows `> SIGNAL LOST // FILE UNREACHABLE` and a `> RETRY` plate. Opening moves focus to the heading; going back returns it to the row that opened it.
- **Photo rail:** the spot's photos in one horizontal row of 4:3 frames (6px radius, 1px `line` border, 8px apart), each 46 % of the detail's content width so it scales continuously as the column is dragged or the screen resized, with no steps: never under 120 × 90px, and never over 320 × 240px in the column or 240 × 180px in the sheet. The photos sit from the left and never stretch, so a lone photo is the size its neighbours would be, and the frame held while the spot's file loads takes the same size. It bleeds to the panel's edges while scrolling and snaps each photo to the 16px inset; touch, trackpad and Shift + wheel scroll it. Each photo is a button ("Open photo 2 of 4") that opens the viewer on it. While a photo loads it shows a small block of rain and crossfades in (300 ms, `--dur-crossfade`); a cached one shows at once; one that fails reads `> SIGNAL LOST` over a dim `PHOTO UNREACHABLE`. No amber: nothing in the rail is current.
- **Photo viewer:** a modal dialog over an 82 % black scrim that covers the whole app, navigation included. The window is `surface` with a 1px `phosphor-deep` border, an 8px radius and the 24px frame halo, padded 16px at the sides and bottom and kept 16px (24px from 1024 px) from the screen's edges. A 48px title row carries the spot's name (UPPERCASE `phosphor-bright`, ellipsised) and a dim `[2/4]` counter. The photo is 4:3 and as large as the viewport allows: the 1400px `full` rendition crossfades in over the thumbnail the rail already showed (the thumbnail stays if it fails). `‹`, `›` and `✕` float on it as 44px plates 8px from its edges. A strip of thumbnails 16px below (72 × 54 from 1024 px, 56 × 42 below, 8px apart) frames the current one in 2px amber (the selection role) and dims the rest, and `© all rights reserved` sits 8px under it. ‹ ›, ← / →, a swipe or a strip thumbnail move between photos, wrapping at the ends; photos crossfade over 300 ms. ✕, Esc, a click on the scrim or the browser's Back (Android's back gesture) close it and leave the spot open. Opening fades the scrim in while the photo grows out of its rail thumbnail (about 420 ms, `--ease-out-expo`); only once it lands do the window, the title row, the plates and the strip fade in. Closing reverses it, and the photo shrinks back into its rail thumbnail, or fades when that thumbnail is off screen. Under reduced motion nothing grows or shrinks; everything fades. Focus moves into the dialog and stays there, returns to the rail photo that opened it, and each step's new place is announced politely.
- **Share:** `> SHARE SPOT ▾` opens a small menu above or below it, whichever fits: `> COPY LINK` and `> SHARE VIA…` (the device's share sheet). The menu fades and rises 4px in over 200 ms and fades out on close; Esc, a click outside or a choice closes it, and it is a real menu to the keyboard and screen readers. Where the browser has no share sheet the button is `> COPY LINK` itself. A copy is confirmed by the button's own label crossfading to `> LINK COPIED` (or `> COPY FAILED`) for 3 s, announced politely. A share sheet that fails for any reason but the visitor dismissing it copies the link instead. No id or URL is ever shown.
- **Photo pins:** a spot with photos shows its first photo as a small framed image (about 56 × 42, 1px `phosphor-deep` frame, 4px radius) on a short stem above its dot, wherever there is room for it at any zoom. A resting photo pin never covers another spot's dot: every dot (or demolished ring, with a small margin) claims its room before any photo, and a photo whose frame would cover one stays a plain dot. A spot's own dot never blocks its own photo. Where two photos would overlap, the spot with more photos wins. The same dot footprints keep the basemap labels off the dots. A dense corner shows fewer photos until you zoom in. Photo pins fade in and out with the map's symbol fade, a demolished spot's photo pin keeps a `phosphor-dim` frame and is drawn dimmed, and photos load only for the pins actually placed on screen.
- **Hover tooltip:** on a hover-capable pointer, hovering a pin or its row raises a small card above the pin over 120 ms (`--dur-hover-in`): the first photo (4:3) and the name, `surface` fill, `phosphor-deep` border, 6px radius (`{rounded.md}`), the pointer-bloom halo; a name-only plate for a spot without photos. Never for the selected spot.
- **Selection flag:** the photo pin and the raised photo are one object. On selection an amber stem draws up out of the dot and the photo rides up it, growing to about 84 × 63 while its frame turns 2px amber; a spot showing only a dot unfolds its flag out of the dot. Release reverses it, easing back into the pin or the dot (about 420 ms, `--ease-out-expo`; under reduced motion the two states crossfade over `--dur-fade` with no travel). The raised flag may cover neighbouring dots and photo pins: it is temporary, and it is the focus. It carries no title. A selected spot without photos keeps only the amber ring. Ring, flag and the viewer's strip highlight are amber's one role on the map: the current selection.
- **Per-spot links:** `/spot/<id>` opens the map with that spot selected and its detail open; `/map` is the map with nothing selected. Both are one page, so moving between them never rebuilds the map. Opening a spot pushes its link and switching spots replaces it, so Back returns to the list; closing returns to `/map`, and the browser's Back (or Android's back gesture) closes it too. While a spot is open the document title is `<SPOT NAME> · SPOTMAP`, and the nav's Map tab stays lit. A shared link skips the welcome intro, switches to the spot's city (remembering it), builds that map centred on the spot close enough for its photo pin, and opens the detail — the ring appears without the lock-on pulse. An unknown or deleted id opens the remembered city at `/map` with a dim `> FILE NOT FOUND // GONE FROM THE ARCHIVE` in the list (the sheet opens to list height to show it) until the next interaction.

### ASCII Animation (signature)
- The typewriter/glitch/collapse phosphor headline. Display type: the whole line is set in the Display tier (pale mint core, 6px halo), with trailing loading dots and no separate glow on the active character. Its timing is brand-critical and preserved; it must expose a `prefers-reduced-motion` path (render final text statically, no per-frame glitch). It runs at two fixed sizes as well as fitted: 20px in the header row and 14px in the phone top bar on a row of its own, so every line fits from 320px up and only a screen narrower than the longest line needs (about 310px) skips one.

### Map Loader (signature)
- **Rain backdrop:** dim phosphor ASCII rain fills the frame while the spots load, slows once they are in, and freezes at DRAW.
- **Plate:** the city name is the progress — its letters scramble and lock in left to right, `locked = floor(min(p / 0.9, 1) × letters)`, so the name is whole before the map draws. Each letter locks in over 160 ms, a deliberate literal rather than a token.
- **Bar:** a segmented dash bar under the plate, driven by real load events only, with the step labels SPOTS · MAP · DRAW beneath it; the reached steps light up. The fill eases to each new width over 250 ms on `cubic-bezier(0.2, 0.8, 0.2, 1)` (a literal, not a token), and its radius is `calc(var(--radius-sm) - 3px)`, concentric with the track: the one exception to R1.
- **Note line:** on the snapshot path an amber `LIVE FEED DOWN · ARCHIVE COPY` under the bar; otherwise empty.
- **Motion:** CSS sprites, no JS timers. Reduced motion: the sprites stop on a still frame, while the bar and letters still progress and fade.

### Admin (maintainer tool)

The signed-in tool at `/admin` (README, "The maintainer tool"). It is the same terminal system on a phone-first, one-column layout: no new colour, token or radius, every control a 44 px target, every state change a fade. Described as built.

- **Shell header** (`admin-header`, `.admin-header`): one column, the same on a phone and a desktop, scrolling with the page. Row one: `> SPOTMAP ADMIN` left in the Display tier and a 44 px **Sign out** button right. Row two: the signed-in email in 12 px `phosphor-dim`, truncated with an ellipsis. Row three: two equal 44 px tabs, **Add** and **Spots** (`.admin-tab`, `aria-current="page"`); the current tab takes the navigation's quiet rest state (1px `phosphor-deep` border, 7% green fill), the other has a transparent border. A 1px `line` rule closes the header. Buttons are `.admin-button`: `10px 16px` padding, 4px radius, Label type, pointer bloom. A shell error is an amber `role="alert"` line that fades in and out over `--dur-fade`. After every route change focus moves to the page's `h1` (`tabindex="-1"`; the Add page gets a visually hidden one from the shell) or, when the page has none, to the main region, and each route's `title` names the page in the document title; leaving the admin area restores the title the site had before it. The edit page has an `h1` in every state (loading, the spot's name, load failure), and when the load finishes focus moves on to the new state's `h1`.
- **Step flow** (`step-panel`, `.step`): Add is one card at a time, in the order add photos, processing, place the spot, checking for nearby spots, spots nearby (only when something is within reach), saving, saved. A card is `surface`, 1px `line`, 8px radius (`{rounded.lg}`), 14px padding and gap; cards never nest. Steps share one grid cell: the new card rises 6px while fading in, the old one fades out and lifts 4px (opacity over `--dur-fade`, transform over `--dur-fast` on `--ease-out-expo`). Focus moves to the new step's heading (`.step__heading`, `tabindex="-1"`, Headline size, UPPERCASE, Display tier, a 1px `phosphor` outline when focused) and a visually hidden `aria-live` line announces processing, checking, saving and the saved result. Under `prefers-reduced-motion` the rise and lift stop and the cards still crossfade over `--dur-fade`. Primary actions are `.action` buttons (44 px, `10px 16px`, 4px radius, 1px `phosphor-deep` border); the step's one main action (`.action--primary`) carries the 7% green fill.
- **Candidate list** (`candidate-row`, `.candidate`): one unboxed row per nearby spot, nearest first, `12px 0` with a 1px `line` rule below. The name sits in the Display tier, followed by a **DELETED** tag (`.tag`: 12px UPPERCASE `phosphor-dim`, 1px `phosphor-deep` border, 4px radius) when the spot is soft-deleted. Under it, one unlit `phosphor-dim` line: city, distance in metres, photo count, and whether it matched by position (within 25 m) or by name (within 100 m). The action stretches the row: **Attach here** (filled) for a live spot, **Restore and attach** (outlined) for a deleted one. Below the list, **Create a new spot anyway** is the one amber control of the flow (`.action--care`: amber label in the amber glow, `amber-dim` border); **Back to placement** follows it in the plain style. No red here.
- **Photo strip** (`photo-strip-item`, `.photo`): on the spot edit page, one unboxed row per photo with a 1px `line` rule below: a 104 x 78 px (4:3) thumbnail with a 1px `line` border and 4px radius, and three equal 44 px plate buttons **<** (earlier), **>** (later) and **X** (remove, in `danger`). The first photo's earlier button and the last photo's later button are disabled. Reordering is by these buttons only. Remove opens a confirm panel inside the row, never a browser dialog: 1px `danger` border, 6px radius, `surface` fill, 10px padding, "Remove photo N? Both its files are deleted.", with **Remove** (red) and **Keep**. Deleting a whole spot uses the same panel. **Add photos** is a plate button beside the "Photos (N)" heading. Motion: a removed row and a closed panel fade out over `--dur-fade`; a moved photo drops to 35% opacity for a frame and fades back over `--dur-fade`. Rows do not slide or collapse.
- **Satellite picker** (`picker-frame`, `.picker__frame`): Esri World Imagery in the same MapLibre canvas as the map, panned under a **fixed centre pin**; the pin itself is never dragged. The frame is `surface` with a 1px `line` border and an 8px radius (`{rounded.lg}`; a host can set `--picker-frame-radius` to 6px), `min(60vh, 28rem)` tall on the Add and edit pages alike (a host never sets its own height; it grows to the frame), and takes the 24px frame glow only while the imagery is being dragged. The pin (`.picker__pin`) is the one circle of the tool: a 12px `phosphor` dot with a 14px bloom inside a 28px ring (a black gap, then a 3px `phosphor` ring); it never takes a touch, so a pan can start on it, and it is never amber. A small unlit plate top left shows the live coordinates (12px `phosphor-dim`, 1px `phosphor-deep` border, 80% `surface` backing, 4px radius); the zoom buttons are 44px plates top right. The Esri credit stays on screen as MapLibre's compact attribution (a licence condition), repainted like the public map's: a `surface` chip, `phosphor-dim` 12px text, 4px radius, and a `phosphor` focus ring in place of MapLibre's blue one. The view opens at zoom 18 on a photo's GPS and zoom 14 on a city's centre; a later move of the centre eases for 400 ms and jumps under reduced motion, as the zoom buttons do. A missing key (amber) or failing tiles (red) show as a notice under the frame that fades in and out over `--dur-fade`; a map that cannot draw or load covers the frame with a `surface` failure panel and a **Retry** button.
- **Status line** (`.admin-status`, `.status`): a `> `-prefixed, unlit line, `role="status"` and `aria-live="polite"`. The shell's sits under the header (13px `phosphor-dim`, reserved at 1.3em high so the page does not jump). The spot list's count line and the spot edit page's saving, saved and error line are 14px; the edit page's rides in its sticky dock beside **Save changes** (`surface` fill, 1px `line` top rule, padding `12px 16px 16px`), and an error turns it `danger`. A new message replaces the old one in the same grid cell: the old fades out and the new fades in over `--dur-fade`.

## 6. Do's and Don'ts

### Do:
- **Do** keep true black (`#000000`) as the ground and phosphor green (`#00ff00`) as the default ink; author color in OKLCH.
- **Do** reserve amber (`#ffb000`) for earnest/safety copy and the single current selection — the care channel, ≤10% of any screen.
- **Do** express all depth as phosphor **glow** (green, or amber for care), per the Glow-Is-The-Shadow Rule.
- **Do** set everything in IBM Plex Mono (self-hosted); keep the whole UI on one character grid.
- **Do** keep corners soft on the R1 scale (4/6/8 px) and give every animation a `prefers-reduced-motion` path that keeps the fades.
- **Do** back the map with `surface` so a blank or failed map reads black-green, never white.
- **Do** confirm destructive admin actions in the page, never a browser dialog.

### Don't:
- **Don't** ship **white** or near-white surfaces anywhere (the No-White Rule) — the map has no carve-out: its basemap is drawn on true black like every other surface, and no Map Palette colour reaches white.
- **Don't** drift into **corporate / Google-Maps polish**, **Strava/Instagram social** cards and gradients, **over-gamified/cutesy** badges, or a **generic dark-mode SaaS template** — all named anti-references in PRODUCT.md. Dark ≠ this; retro-computing intent is the difference.
- **Don't** use gray/black drop-shadows, frosted glassmorphism, rounded pill shapes, or proportional (non-mono) fonts (the map renderer's Noto Sans basemap labels and demolished-pin `×` are the one exception, see the One-Grid Rule).
- **Don't** introduce a third decorative color into the UI chrome (the basemap's Map Palette is the one documented exception), or let amber sprawl past the care/selection role.
- **Don't** use full-color emoji as UI icons — render terminal glyphs in phosphor instead.
- **Don't** let glow smear text: no blanket glow, no text halo past 6 px, no text below 12 px, so it survives sunlight on a phone.
- **Don't** make a drag the only way to reorder or place anything.
