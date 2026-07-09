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

The one modern intrusion is the embedded Google My Maps iframe, which we can't currently replace. Treat it as the single deliberate anachronism the terminal wraps around — framed in a glowing green border, sitting on a dark surface, never allowed to flash raw white.

**Key Characteristics:**
- **True-black ground, phosphor-green ink**, amber as the rare second phosphor.
- **Monospace everything** (IBM Plex Mono) — the whole world is a character grid.
- **Glow is depth.** No conventional shadows; elevation is bloom intensity.
- **Sharp, not rounded.** Corners are 0–4px; the terminal has edges.
- **Legible first.** It's used one-handed, outdoors, in sunlight — the vibe never beats the read.

## 2. Colors

A single-hue phosphor system: one saturated green carries ~95% of every screen against true black, with a period-accurate CRT amber as the only second voice. Canonical values are authored in **OKLCH** in the CSS layer; the frontmatter carries sRGB hex for tooling compatibility.

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

### Named Rules
**The Two-Phosphor Rule.** Only green and amber are voices. Green is the default; amber is earnest/selected. Everything else (surfaces, lines) is a near-black tint of green. Any third decorative color is forbidden.

**The No-White Rule.** `#ffffff` (and near-white grays) are banned on every surface the site controls. White is the failure signature — the only white on screen should be map tiles inside the Google iframe, and even the iframe's empty/loading/error state must fall back to `surface`, never raw white.

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
**The One-Grid Rule.** Everything is monospace. No proportional font enters the interface — not for "friendly" body copy, not for headings. The grid is the brand.

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
- **Background:** `surface` (near-black) — this is the placeholder the iframe sits on, so a blank/slow/failed embed reads black-green, **never white**.
- **Glow Strategy:** `box-shadow: 0 0 24px rgba(0,255,0,0.35)` frame halo.
- **Loading:** the matrix-radar spinner (green ASCII rotor) over `surface`. **Error/timeout:** a phosphor "SIGNAL LOST // MAP UNREACHABLE" terminal message on `surface`, with a retry — not a white void.

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
- **Do** frame the Google map in `surface` + green glow so a blank embed reads black, never white.

### Don't:
- **Don't** ship **white** or near-white surfaces anywhere the site controls (the No-White Rule). White is only ever real map tiles inside the iframe.
- **Don't** drift into **corporate / Google-Maps polish**, **Strava/Instagram social** cards and gradients, **over-gamified/cutesy** badges, or a **generic dark-mode SaaS template** — all named anti-references in PRODUCT.md. Dark ≠ this; retro-computing intent is the difference.
- **Don't** use gray/black drop-shadows, frosted glassmorphism, rounded pill shapes, or proportional (non-mono) fonts.
- **Don't** introduce a third decorative color, or let amber sprawl past the care/selection role.
- **Don't** use full-color emoji as UI icons — render terminal glyphs in phosphor instead.
- **Don't** let glow smear text legibility; resting text glow stays ≤6px so it survives sunlight on a phone.
