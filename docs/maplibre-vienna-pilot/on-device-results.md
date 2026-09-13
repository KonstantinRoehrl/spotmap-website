# On-device results — MapLibre Vienna pilot

Branch: `feat/maplibre-vienna-pilot` · Walked 2026-09-13 · Checklist:
[`on-device-checklist.md`](./on-device-checklist.md) · Evidence: `.devcycle/evidence/`

## How this run was conducted, and what that limits

The stage's configured gate is `human-required` — one question per item, a human verdict on
each. **The maintainer relaxed it mid-stage** to a driver-observed walk: an automated driver
measures, and only measurements are recorded. Nothing below carries a human verdict, so no
item here is closed on looks.

Three constraints bound every observation, and each one is stated again wherever it bites:

- **Desktop Chrome only.** No phone was available. Every item whose point is touch, thumb
  reach, or outdoor legibility is unverified, not passed.
- **The browser tab was never frame-fed.** Chrome reported `visibilityState: 'hidden'` with
  zero `requestAnimationFrame` callbacks for the whole session, so the driver supplied frames
  through a MessageChannel pump. CSS transitions never advanced (`document.timeline` did not
  move) and `setTimeout(700)` measured 997–1286ms, so **no timing below is a real-device
  timing** and no fade was watched.
- **OS-level input never reached the renderer.** Keyboard and pointer items were driven with
  scripted events into the same handlers, which tests the code path and not the hardware.

An item is checked `(auto)` only where fresh structural browser output settles it — DOM
structure, CSS values, exact text, network status, map state. Feel, contrast and legibility
stay unchecked by rule.

**21 of 69 items verified `(auto)`. 48 unverified. 2 defects found. 3 rulings needed.**

## Defects

- **`> DEMOLISHED` renders with the spot name's full glow — FAILED — severity: medium.**
  The colour half holds (`rgb(0,191,53)` phosphor-dim, not amber), but computed `text-shadow`
  is `rgb(0,255,0) 0 0 2px/4px/6px`, identical to the name above it. `.spot-popup__status`
  (`spot-popup.component.css:25`) sets `color` and never resets the inherited `text-shadow`;
  the ancestor `div` takes `--glow-text-rest` from `styles.css:118-125`. The rule's own comment
  says the line "carries phosphor-dim and drops the bloom instead", so this is the
  implementation missing its stated intent. One declaration fixes it: `text-shadow: none`.
- **The IBM Plex Mono webfont 404s under the deploy prefix — FAILED — severity: medium.**
  Found while verifying the production build. `src/styles.css:14,22,30` declare the font
  `url('/fonts/…')` root-absolute; the files ship at `/spotmap-website/fonts/…`, and
  `<base href>` does not apply to CSS `url()`. Reproduced with curl against the real artifact:
  root-absolute **404**, deploy-prefixed **200**. On Pages every page falls back to a generic
  monospace — the terminal identity is the typeface. Dropping the leading slash resolves
  correctly in both dev and deploy. The map itself is unaffected, so the production item's own
  assertion passed.

## Rulings needed — measured, but the judgment is the maintainer's

- **Is `--color-phosphor-bright` near-white?** The no-white sweep was exhaustive: 111 colour
  samples over 78 visible elements, plus every pixel of the 1952×1090 drawing buffer (zero
  pixels with all three channels above 200). The lightest colour on the page is
  `rgb(181,254,182)`, a deliberate token used for the gallery arrow's hover/focus glyph. Pale
  mint, not `#fff`. The No-White Rule now has no exceptions left, so this needs a decision
  rather than a measurement.
- **Should `> DIRECTIONS` send a name or coordinates?** The href is
  `https://www.google.com/maps/dir/?api=1&destination=48.2397385,16.4169023` — geographically
  right, but the checklist asks for the spot's name as the destination label, which this build
  does not send.
- **Is MapLibre's local-glyph fallback acceptable?** With the glyph endpoint blocked the map
  painted and 151 errors reached the console as designed, but labels did **not** vanish: 82
  still rendered through the local fallback, silently off Noto Sans.

## Verified `(auto)` — 21 items

Map loads and paints under `ng serve` (10/10 frame-fed loads; the 4 failures in the batch were
frame-starved background tabs, isolated by a hidden-but-frame-pumped run that loaded normally)
· the production build paints under its deploy path with every worker asset 200 · the lazy
`maplibre-gl` chunk loads only when the map route opens · the factory yields a real Map with
zero console errors · the opening camera fits all 12 spots with symmetric margins and is
re-derived, not hardcoded · the amber selection ring moves one-at-a-time on real feature-state
· the popup opens with gallery, name and directions, repainted with no white on any tip across
all eight anchors · the square-corner rule wins the cascade at all four diagonals · the close
button is 44×44 with a real focus ring and clears the selection · pointer cursor on pin hover ·
`unclassified` pins render identically to `active` · the gallery panel's chrome measures as
documented · attribution present · no white pixel anywhere while tiles load or fail · a lost
glyph range and lost tiles still paint and reveal with no SIGNAL LOST · an unreachable TileJSON
shows SIGNAL LOST + RETRY 43ms later with no map behind the chrome · a blocked maplibre chunk
fails in 73ms rather than after the 15s watchdog · the no-renderer surface paints in 427ms with
no RETRY button · the embed fills its container at both widths · WebGL denial reaches the
no-renderer path immediately.

## Unverified residue — 48 items

**Needs your eyes on a real screen (19).** The basemap reading as a phosphor wireframe; label
legibility and collision, plus the open question of whether street names should follow the road
line; road width interpolation across zoom; spots reading as spread across the city; demolished
pins reading as ghosted at a glance; pins reading as glowing phosphor dots; photo crops reading
sensibly; the photo counter over bright and dark photos; the attribution at 10px; parks vs
water as two near-blacks (**measured contrast ratio 1.03** — the number says this will be very
hard, and it is exactly what roadmap Phase 2 exists to fix); green not reading as noisy at z14;
the four road tiers separating; paths as dashed and rail as dotted texture; road casing helping
rather than muddying; the U6/U4 dashes at a computed 0.51px width; the embed fade and failure
surface "looking unchanged"; the no-renderer line wrapping to 2 clean lines at 390px; the About
voice; the About credits rhythm.

**Needs a phone or touch hardware (13).** One-finger pan not scrolling the page; two-finger
zoom never rotating or tilting; the deliberate sloppy-grip tilt and twist checks; edge pan not
chaining into pull-to-refresh; thumb-tappable gallery arrows and their clipping; swipe
advancing photos; advancing feeling non-janky; `> DIRECTIONS` opening the maps app on iOS
Safari *and* Android Chrome; the archive surviving that hand-off on both; photo re-encode
quality on a real screen; the four road tiers in sunlight; the unlit `> DEMOLISHED` line in
sunlight; Vienna's map on an actual phone.

**Needs an OS setting you have to toggle (3).** Reduce Motion suppressing the gallery's photo
animation, the opening camera move, and the half-second ease-in.

**Needs hardware or network the tooling cannot reach (3).** A real keyboard (the behaviour is
right under scripted events: arrows pan, `+`/`-` zoom, Shift+arrow ignored with
`defaultPrevented: false`); Slow-3G throttling for the photo-load flash; a full 15-city embed
sweep (4 of 15 walked in-browser, `config.ts` confirms all 15).

**Needs a deploy (1).** The live Pages site loading with no `maplibre-gl-worker.mjs` 404 —
unreachable before the branch ships, and now worth pairing with the webfont fix above.

**Half-measured, listed under their own items (9).** Each carries its measured half inline in
the checklist: the embed reveal cadence, the overlay re-arming on city switch, RETRY
re-pointing at a fresh URL with `_r=1`, Vienna's desktop draw, the city round-trip, the
keyboard path, the glyph fallback, the About facts, and the credits line count.
