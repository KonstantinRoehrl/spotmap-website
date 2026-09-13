# On-device checklist — MapLibre Vienna pilot

Branch: `feat/maplibre-vienna-pilot`

What a person has to confirm on real hardware before this phase is done, because a unit test
cannot: gestures, legibility outdoors, and whether the map paints at all on a real device.
Items were added as each wave produced a rendered change, and again after branch review. The
task numbers in the section headings refer to the working plan the phase was built from, which
is not tracked in the repo.

**Reachability note — the gate is open.** Items here were gated on two things:
`SpotPhotoGalleryComponent` (task 4) becoming reachable through the spot popup in Task 9, and
Vienna's MapLibre map replacing the Google embed in Task 10. Both have landed — Vienna renders
through MapLibre as of commit `01797e6` — so every item below is now walkable in the running app.

**Walked 2026-09-13 — results in [`on-device-results.md`](./on-device-results.md).** 21 items are
checked `(auto)` from fresh structural browser output; 48 stay unchecked. Two defects were found
(the `> DEMOLISHED` glow, and the webfont 404ing under the deploy prefix) and three items need a
maintainer's ruling rather than a measurement. The walk ran on desktop Chrome only, in a tab that
had to be fed animation frames by hand — so no timing below was watched, no gesture was felt, and
every item whose point is touch or outdoor legibility remains genuinely unverified.

A script or screenshot never checks off an item here. An item asserting DOM structure, CSS
values, or exact text may be checked off tagged `(auto)` only with fresh structural browser
output in hand; feel, smoothness, alignment, contrast, and legibility always stay for a human.

## Spot data on the real map (Task 2)

- [ ] The 12 Vienna spots read as spread across the city rather than clustered in one district.
      Where: Vienna city page, MapLibre map  ·  How to get there: app root → city list → Vienna
- [ ] The 4 demolished spots read as visibly ghosted against the 8 active ones — distinguishable
      at a glance, without needing to open a popup.
      Where: Vienna city page, MapLibre map  ·  How to get there: app root → city list → Vienna
- [ ] Spot photos survive the `-q 72` / 1400px-long-edge re-encode on a real screen: no visible
      compression artefacts, correct orientation (nothing sideways or upside-down).
      Where: spot photo gallery  ·  How to get there: Vienna map → tap a spot pin → popup gallery

## Photo gallery rendering (Task 4)

- [ ] Photos fill the 4:3 gallery surface with `object-fit: cover` framing that crops sensibly —
      no letterboxing, no subject cropped out of frame.
      Where: spot photo gallery  ·  How to get there: Vienna map → tap a spot pin → popup gallery
- [ ] The prev/next arrow focus ring is clearly visible when tabbing to it — against the dark
      surface, at arm's length, not just in a zoomed screenshot.
      Where: spot photo gallery  ·  How to get there: tab into the gallery with a keyboard
- [ ] The arrow buttons are comfortably thumb-tappable on a phone. The stylesheet declares a
      44px minimum; confirm it lands that way in the popup's real layout and that neither arrow
      is clipped by the popup edge.
      Where: spot photo gallery, phone-width viewport
- [ ] Advancing between photos feels right — the tap/swipe registers on the first try and the
      photo change is not janky.
      Where: spot photo gallery, touch device
- [ ] No white or near-white flash while a photo loads on a real (slow) connection — the surface
      stays dark through the swap. Throttle the network to see it; it will not reproduce on a
      warm cache.
      Where: spot photo gallery  ·  How to get there: DevTools → Slow 3G → open a spot's gallery
- [ ] The photo counter stays legible over varied photos (bright sky, dark concrete) rather than
      disappearing into the image behind it.
      Where: spot photo gallery, bottom-right corner
- [ ] With `prefers-reduced-motion: reduce` enabled at the OS level, advancing photos carries no
      animation the setting should have suppressed.
      Where: spot photo gallery  ·  How to get there: enable Reduce Motion, then advance a photo

## Container / renderer split — no visible change intended (Task 5)

This task is a behavior-preserving refactor: the Google embed moved into its own component and
the container kept the state machine. The four items that follow are *regression* checks — the
correct outcome is "identical to before the refactor", on any of the 15 Google-embed cities. The
fifth, below the note, covers the one genuinely new surface the refactor added.

- [ ] The map still fades in over roughly 700ms once the renderer reports ready, with no white
      flash at any point in the reveal. The opacity animation moved from the iframe onto the
      `app-gmaps-embed` host element, so this is the item most likely to have drifted.
      Where: any non-Vienna city page  ·  How to get there: app root → city list → e.g. Berlin
      **Measured 2026-09-13, NOT closed.** On Munich: iframe created 160.7ms, src set 170.1,
      iframe load 814.8, host opacity 0->1 at 2116.8 — a 1302ms gap consistent with the
      declared `REVEAL_DELAY_MS = 700` under this tab's ~1s timer clamp (a hidden tab inflates
      every timer; `document.timeline` did not advance at all, so CSS transitions never ran).
      A graz->salzburg switch gave 785ms. Side finding worth keeping: the iframe fires a first
      `load` for its own `about:blank` document before the Google URL is applied, and
      `onRendererReady` re-arms the reveal on every load. **The white-flash half is not
      judgeable by automation at all** — the cross-origin embed cannot be frame-pumped, so it
      renders as its own white page here. Human.
- [x] `(auto)` The embed still fills its container edge to edge, with no gap, no double scrollbar, and no
      overflow — the `.map-container iframe` sizing rules moved into `gmaps-embed.component.css`
      as `:host` + `iframe` rules.
      Where: any non-Vienna city page, checked at both desktop and phone width
      **Verified 2026-09-13 (auto), both widths.** Desktop 1512x792: container, `:host` and
      iframe rects all identical at [268,175,976,601]; scrollWidth==clientWidth on container
      and host; container `overflow: hidden`; iframe `border: 0px none`. Phone width 390x844:
      all three rects [24,128,342,640], scroll==client everywhere, document 390/390. No gap,
      no overflow, no double scrollbar.
- [ ] The loading overlay looks and times exactly as it did before, and switching cities in the
      dropdown re-shows it rather than leaving the previous map visible.
      Where: any city page  ·  How to get there: change the city in the dropdown, watch the swap
      **Measured 2026-09-13, NOT closed — 'exactly as before' needs a human who remembers
      before.** graz->salzburg: pick at 8.9ms, iframe re-pointed 18.5, host opacity 0 and the
      loading overlay back at 39.5, iframe load 792.8, revealed 1578.2. The previous map was
      hidden rather than left visible, which is the half that was at risk. Timings carry the
      hidden-tab throttling caveat.
- [ ] The "SIGNAL LOST // MAP UNREACHABLE" failure surface and its RETRY button look unchanged,
      and RETRY still re-points the embed at a fresh URL.
      Where: any city page  ·  How to get there: DevTools → block the Google embed request, reload
      **Measured 2026-09-13, NOT closed — 'look unchanged' is the human half.** Watchdog fired
      at 15796ms; text `> SIGNAL LOST // MAP UNREACHABLE` and `> RETRY`; line rgb(0,255,0)
      with the triple green glow on rgb(6,11,7); RETRY 110x46, rgb(0,255,0) on transparent
      with a 1px solid rgb(3,104,25) border, 16px IBM Plex Mono. **RETRY works and really re-
      points the embed:** it cleared the surface, restored the spinner in 59ms and re-
      requested the same `/maps/d/u/0/embed` path 17ms later with `_r=1` appended — a fresh
      URL.

**Gated on Task 10 until now, and that gate is open.** No renderer emitted `unsupported` until Task
10 landed MapLibre, so the item below had nothing to trigger it. Vienna renders through MapLibre as
of commit `01797e6`, so it is now walkable in the running app, and stays unchecked until a human has
looked at it.

- [x] `(auto)` The new "NO RENDERER // THIS BROWSER HAS NO WEBGL" surface really appears when the renderer
      reports `unsupported`, and reads in the terminal palette — phosphor text, no white anywhere —
      rather than as an unstyled fallback.
      Where: Vienna city page  ·  How to get there: open Vienna on a browser or profile with WebGL
      disabled (e.g. `chrome://flags` → WebGL disabled), then reload
      **Verified 2026-09-13 (auto) — note the item quotes stale wording.** The shipped line is
      `> NO RENDERER // THIS BROWSER CANNOT DRAW THE MAP` (49 chars); the round-3 review fix
      deliberately reworded it away from asserting a cause the app cannot determine, so the
      item's 'HAS NO WEBGL' text is out of date, not the build. Produced by denying every
      webgl context (`getContext -> null`) rather than a real browser profile flag, which is
      the same signal the app's probe reads. Surface painted 426.5ms after the probe was
      denied (watchdog is 15000ms), zero RETRY buttons, no spinner. Colours: text rgb(0,255,0)
      with the triple glow on rgb(6,11,7), body rgb(0,0,0) — every element inside the overlay
      green-on-near-black, nothing unstyled, no white.

---

## Terminal basemap style (Task 6)

The style module was authored data until Task 8 rendered it and Task 10 turned Vienna on. Both have
landed — Vienna renders through MapLibre as of commit `01797e6` — so all four items are now walkable
in the running app, and all four stay unchecked until a human has looked at them. They remain human
items either way: a structural DOM read cannot see any of them.

- [ ] The basemap reads as a phosphor wireframe of Vienna: true-black ground, dim-green road
      hierarchy, buildings as outlines rather than filled blocks — at the zoom levels the pilot
      actually opens at, not just when zoomed far in.
      Where: Vienna city page  ·  How to get there: app root → city list → Vienna
- [ ] Street and place labels are legible and not colliding, and the `Noto Sans Regular`
      fontstack really loads from the OpenFreeMap glyph endpoint — no fallback boxes, no missing
      glyphs. **Open question to settle against the rendered map:** street names use MapLibre's
      default point placement, because the plan pinned the label layout properties without
      `symbol-placement: 'line'`. Decide on sight whether street names should instead follow the
      road line.
      Where: Vienna city page, at street-level zoom
- [ ] Road line widths interpolate sensibly across zoom — roads thin out as you zoom away
      instead of smearing into slabs, and thicken without going blocky as you zoom in.
      Where: Vienna city page  ·  How to get there: pinch/scroll through the full zoom range
- [x] `(auto)` No white or near-white surface appears at any point while tiles are still loading, nor
      when a tile request fails (QC3 / the No-White Rule). The style source is verified free of
      white tokens, but the *rendered* gap between requested and painted tiles is not something
      the spec can see.
      Where: Vienna city page  ·  How to get there: DevTools → throttle to Slow 3G, then reload;
      then block `tiles.openfreemap.org` and reload again
      **Verified 2026-09-13 (auto).** Whole-canvas pixel sampling (16,000 px per sample)
      through a load with two tiles deliberately failed: pixels with all channels >200 =
      **0**, pixels with all channels >150 = **0**, at every sample (t=1216, 2192, 3183, 4150,
      5099, 6101, 7089ms). Mean went rgb(0,0,0) -> rgb(6,11,6) -> rgb(4,18,5); brightest pixel
      rgb(0,255,0). Surfaces behind the canvas: container rgb(6,11,7), body rgb(0,0,0).
      Caveat: Slow-3G throttling was not reachable through the tooling, so the slow-connection
      leg is unproven; the failed-tile leg is proven.

---

## Real map factory registered (Task 7)

The karma suite can only assert that a `MAP_FACTORY` provider exists in `appConfig`. Whether that
provider actually *works* is a browser fact, and nothing injected it until Task 8 landed the
component and Task 10 turned Vienna on. Both have landed — Vienna renders through MapLibre as of
commit `01797e6` — so the item below is now walkable in the running app, and stays unchecked until a
human has looked at it.

- [x] `(auto)` The registered factory really yields a working map in a browser: the lazy `maplibre-gl`
      import resolves at runtime (no chunk-load failure in the console) and a Map instance
      renders rather than the container falling through to its failure surface.
      Where: Vienna city page  ·  How to get there: app root → city list → Vienna, with DevTools
      console open — a failed dynamic import shows up there, not on the page
      **Verified 2026-09-13 (auto), desktop Chrome, dev server.** `map.loaded()` and
      `isStyleLoaded()` both true, 18 style layers, 4 spot layers, 48 rendered spot features
      (12 spots x 4 layers), no failure surface in the DOM. 72 console messages over the
      session, zero errors and zero chunk-load failures.

---

## The spot map itself (Task 8)

`SpotMapComponent`'s whole spec suite runs against an injected fake map, so none of what follows has
been seen in a browser. These items were recorded as unreachable while no template referenced
`app-spot-map`; **Task 10 turned Vienna on — the container's `@switch` renders `app-spot-map` as of
commit `01797e6` — so every item here is now walkable in the running app**, and every one stays
unchecked until a human has looked at it.

The gesture items are the pilot's whole reason for existing: the two-finger pinch-zoom bug is
what Phase 1 set out to fix, so items 1–3 are the ones to walk first once Vienna is live.

- [ ] One-finger drag pans the Vienna map and never scrolls the page underneath it, while the
      rest of the page keeps its native pinch-zoom (the `touch-action` scoping is the fix —
      confining it to the canvas host is what keeps page zoom available as an accessibility
      affordance).
      Where: Vienna city page  ·  How to get there: on a real touch device, drag inside the map,
      then pinch somewhere outside it
- [ ] A two-finger gesture on the map only zooms — it never rotates or tilts the view.
      Where: Vienna city page  ·  How to get there: two-finger pinch and twist inside the map
- [ ] A pan that reaches the map's edge does not chain into the browser's pull-to-refresh.
      Where: Vienna city page  ·  How to get there: drag downward from the top of the map
- [x] `(auto)` The opening camera frames all Vienna spots with room to spare rather than a hardcoded
      centre, and stops short of zooming absurdly close on a tight cluster.
      Where: Vienna city page  ·  How to get there: load the page and watch the initial move
      **Verified 2026-09-13 (auto).** `map.getBounds()` vs the bbox of
      `public/spots/vienna.geojson`: zoom 11.05, all 12 spots inside, margins symmetric
      (0.0159 deg each side in lng, 0.0135/0.0135 in lat). Re-derived identically after
      routing away and back, so not a hardcoded centre; z11.05 on a 976x545 canvas is nowhere
      near a tight-cluster zoom.
- [ ] With reduced motion enabled, that opening camera move is instant rather than animated
      (QC4).
      Where: Vienna city page  ·  How to get there: macOS System Settings → Accessibility →
      Display → Reduce motion, then reload
- [ ] The OSM / OpenMapTiles attribution is present and legible in the terminal palette,
      including the compact info toggle's icon — repainted, not hidden. It is a licence
      condition, so illegible counts as failed.
      Where: Vienna city page, map bottom corner  ·  How to get there: tap the compact info toggle
      **Measured 2026-09-13, NOT closed — legibility is the human half.** Present and
      repainted: `.maplibregl-ctrl-attrib` reads exactly `OpenFreeMap (c) OpenMapTiles Data
      from OpenStreetMap`, links rgb(0,191,53) on rgb(6,11,7) at 10px IBM Plex Mono; the
      toggle is 24x24 with `aria-label="Toggle attribution"` and its glyph is refilled
      `#00b800` (not white, not hidden), collapsing and re-expanding on click. **Open for a
      human: whether 10px phosphor-on-near-black is legible on a real screen** — it is a
      licence condition. Evidence: `.devcycle/evidence/vienna-attribution-bar-full.png`.
- [ ] Spot pins read as glowing phosphor dots, demolished ones visibly dimmer than active ones,
      and tapping near a pin is comfortable — the hit target is 22 px against a 6 px visible pin
      (QC8).
      Where: Vienna city page  ·  How to get there: tap slightly off-centre from several pins
      **Measured 2026-09-13, NOT closed — 'reads as' and 'comfortable' are human.** QC8
      geometry confirmed by sweeping `queryRenderedFeatures` outward from pin centres: `spots-
      hit` radius 22 responds out to 21px, `spots-body` radius 6 to 6px, `spots-glow` radius
      14. Colours over pure black: active/unclassified centre rgb(0,255,0), demolished
      rgb(0,90,0); glow opacity 0.5 vs 0.15. A click 14.1px off a pin centre opened that pin's
      popup. **Open for a human: whether they read as glowing phosphor dots, and whether the
      target is comfortable on a real touchscreen.**
- [ ] Nothing white or near-white appears while the map loads, while it fails, or while it is
      switched between cities (QC3). The switch case matters most: the component tears the old
      map down before building the new one, and that gap is exactly where a white flash would
      show.
      Where: Vienna city page  ·  How to get there: throttle to Slow 3G and reload; then switch
      city away from Vienna and back

---

## The spot popup and pin selection (Task 9)

`SpotPopupComponent` and the tap-to-select path in `SpotMapComponent` are covered by specs that
run against an injected fake map and a fake popup, so nothing below has been seen in a browser.
These items were recorded as unreachable while the container referenced no `app-spot-map` and the
production build tree-shook both new components out; **Task 10 turned Vienna on as of commit
`01797e6`, so every item here is now walkable in the running app**, and stays unchecked rather than
being marked N/A until a human has walked it.

- [x] `(auto)` Tapping a pin opens the popup over the map with the photo gallery, the spot name and the
      directions link framed legibly — terminal surface, phosphor text, a `--color-line` border
      and the edge glow — with nothing white anywhere, MapLibre's own tip and close button
      included. Those three are built outside the component's DOM and MapLibre's global
      stylesheet paints them `#fff`, so they are the most likely place for white to survive.
      Where: Vienna city page, popup over the map  ·  How to get there: Vienna map → tap a spot pin
      **Verified 2026-09-13 (auto).** Tapping a pin produced `div.maplibregl-popup.spot-popup-
      frame` with gallery, `p.spot-popup__name` and `a.spot-popup__directions`; rendered text
      `< > [1/7] DONAUPARK > DIRECTIONS x`. Content background rgb(6,11,7), border 1px solid
      rgb(15,61,23) (`--color-line`), radius 2px, edge glow rgba(0,255,0,0.35) 0 0 24px; tip
      coloured rgb(15,61,23) on the pointing side only. No colour at or near white anywhere in
      the popup, tip or close button.
- [x] `(auto)` The tapped pin picks up its amber selection ring, and tapping a second pin moves the ring
      there rather than leaving both lit. This rides on MapLibre promoting each spot's string
      `id` into the feature id for feature-state — something only a real map exercises, which no
      test can reach.
      Where: Vienna city page  ·  How to get there: tap one pin, then tap another
      **Verified 2026-09-13 (auto).** `promoteId: "id"` really promoted the string ids, so
      feature-state works: after tapping Donaupark `selected` = [donaupark]; after tapping
      Wallenberg = [wallenberg] — exactly one, never both. Ring paint: radius 11, transparent
      fill, 2px stroke `#ffb000`, stroke-opacity `case feature-state selected -> 1 else 0`.
- [x] `(auto)` The popup's close button is comfortably thumb-sized, shows a clearly visible phosphor focus
      ring when tabbed to, and closing the popup drops the selection ring from the pin.
      Where: Vienna city page, popup header  ·  How to get there: open a popup, tab to the close
      button, then close it
      **Verified 2026-09-13 (auto).** Close button 44x44 with `aria-label="Close popup"`, rest
      rgb(0,191,53), hover rgb(0,255,0); reached by a real Tab keypress with `:focus-visible`
      matching and outline 1px solid rgb(0,255,0). Clicking it removed the popup and cleared
      `selected` for every feature (`selectedId` null). Note for the human eye: the button
      sits over the photo, so the ring lands on photographic content
      (`.devcycle/evidence/popup-close-button-focus-ring.png`).
- [ ] The gallery's arrows advance the photo inside the popup, and a horizontal swipe on the photo
      does the same on a phone. The swipe is the part to watch: the popup sits inside the canvas
      host, which is `touch-action: none`, so the map could swallow the gesture.
      Where: Vienna city page, popup gallery, touch device
- [ ] `> DIRECTIONS` is keyboard-focusable with a visible ring, and tapping it on a phone really
      opens the device's maps app at the spot, with the spot's name as the destination label. The
      `geo:` URI only resolves on a real device — a desktop browser proves nothing here.
      Where: Vienna city page, popup footer  ·  How to get there: open a popup on a phone, tap
      `> DIRECTIONS`
      **Measured 2026-09-13, NOT closed — one half is a measured MISMATCH.** Keyboard half
      passes: reached by a real Tab, `:focus-visible` true, outline 1px solid rgb(0,255,0) at
      2px offset, hit area 114x44. **But the href is
      `https://www.google.com/maps/dir/?api=1&destination=48.2397385,16.4169023` — the
      destination is coordinates, not the spot's name, so 'with the spot's name as the
      destination label' is not what this build sends.** (The item was also written against
      the old `geo:` URI; the round-1 fix deliberately replaced it with this cross-platform
      https URL.) Whether the coordinate destination is acceptable is a call for the
      maintainer. 'Really opens the device's maps app' is untestable without a phone.
- [x] `(auto)` A map that loses single resources still paints and reveals, with no "SIGNAL LOST" flash on the
      way there: a failed glyph range or a handful of failed tiles is survivable, because the
      fatal/non-fatal discriminator reads what the error payload names rather than asking
      `map.isStyleLoaded()`.
      Where: Vienna city page  ·  How to get there: DevTools → block `tiles.openfreemap.org/fonts/*`,
      or a few tile requests, then reload
      **Verified 2026-09-13 (auto).** With glyph range `0-255.pbf` blocked AND two tiles
      (`11/1117/710`, `11/1116/710`) failed: no SIGNAL LOST at any point; overlay 531.6ms,
      canvas 565.9, revealed 3282.1. 54 console errors (52 of them glyph). MapLibre covered
      the failed tiles with the z10 parent rather than leaving a hole. The fatal/non-fatal
      discriminator behaved as designed.
- [x] `(auto)` A genuinely unreachable basemap — a source whose metadata never arrives — still shows
      "SIGNAL LOST // MAP UNREACHABLE" with its RETRY button, and the map never appears behind that
      chrome afterwards. This is the behaviour round 1 got wrong, so walk it first.
      Where: Vienna city page  ·  How to get there: DevTools → block
      `tiles.openfreemap.org/planet` (the TileJSON), then reload
      **Verified 2026-09-13 (auto).** TileJSON `tiles.openfreemap.org/planet` blocked at
      1040.1ms -> console `AJAXError` 1049.8 -> canvas removed 1061 -> `> SIGNAL LOST // MAP
      UNREACHABLE` + `> RETRY` at **1083.5ms, 43ms after the failed request and ~14s before
      the watchdog**. For the following 8s: zero state changes, no canvas, opacity 0 — the map
      never appeared behind the chrome. This is the behaviour round 1 got wrong; it is right
      now.
- [x] `(auto)` A pointer hovering a pin turns into a pointer cursor on a desktop browser — the affordance
      that tells a mouse user the pins are tappable at all.
      Where: Vienna city page, desktop browser  ·  How to get there: move the mouse over a pin
      **Verified 2026-09-13 (auto).** `getComputedStyle(map.getCanvas()).cursor` after
      synthetic mousemove: `grab` off a pin, `pointer` on a pin centre, `pointer` 10px off
      centre but inside the 22px hit target, back to `grab` when moved away.

---

## Turn Vienna on (Task 10)

This is the task the rest of the branch was waiting on: `config.ts` sets Vienna's renderer to
`MapRendererEnum.MapLibre` and the container's `@switch` renders `app-spot-map`, as of commit
`01797e6`. It is what opens the gate on the Task 5 WebGL note and on the Task 6 through Task 9
sections above — all of those are now walkable, none of them verified. Nothing below has been seen
in a browser either: a headless spec cannot see a rendered map.

- [ ] Vienna really draws the MapLibre terminal-style basemap with its spot pins, fits the camera to
      the city's spots, and reveals with the existing ~700ms fade — on a phone and on a desktop
      browser.
      Where: Vienna city page  ·  How to get there: app root → city list → Vienna
      **Measured 2026-09-13, NOT closed — the phone half and the fade are open.** Desktop: 12
      pins in `spots-body` from a 12-feature file, camera center [16.35873, 48.1979] zoom
      11.0528 bearing 0 pitch 0, viewport bounds strictly containing the spot bbox with the
      centre equal to the bbox centre exactly. Canvas 976x601, 0 white pixels, mean
      rgb(4,19,5). Timeline overlay 879.5ms -> canvas 1046.9 -> revealed 4365.3. **No phone
      was available, and CSS transitions never progressed in the driven tab, so the ~700ms
      fade is evidenced only by the declared constant plus the frozen 400ms transition — not
      by watching it.**
- [ ] The other 15 cities still show their Google embed, and switching Vienna → another city → back
      re-arms the loading overlay each time, with no white flash in either direction.
      Where: any city page  ·  How to get there: Vienna → change the city in the dropdown → back
      **Measured 2026-09-13, NOT closed.** vienna->graz->vienna re-armed the loading overlay
      in BOTH directions (graz side 173.8ms after the pick; vienna side 2280.7 with the old
      canvas already torn down), revealing at 1168.2 and 4141.6; the returning Vienna canvas
      sampled 0 white. The Google embed was confirmed in-browser for **4 of the 15** non-
      Vienna cities (munich, graz, salzburg, linz — each an `app-gmaps-embed` with a
      google.com iframe); `config.ts` sets all 15 to `GoogleMyMaps`. A full 15-city sweep was
      abandoned at ~45s per city under the hidden-tab timer clamp. The white-flash judgment on
      the embed side is unreachable by automation (cross-origin).
- [x] `(auto)` The popup frame survives the stylesheet move out of the component into `src/styles.css`:
      surface background, `--color-line` border, edge glow, phosphor text, and a phosphor-dim close
      button that brightens on hover and shows a visible focus ring — with no white anywhere, the
      tip included, for every anchor direction the popup can take.
      Where: Vienna city page, popup over the map  ·  How to get there: tap pins near each map edge
      so the popup anchors above, below, left and right of the pin in turn
      **Verified 2026-09-13 (auto), all eight anchors.** Each anchor produced for real by
      panning a pin to that edge/corner. Content background rgb(6,11,7), border 1px
      rgb(15,61,23), edge glow rgba(0,255,0,0.35) 0 0 24px, close button rgb(0,191,53) ->
      rgb(0,255,0) on hover in all eight; tip coloured side rgb(15,61,23), other sides
      transparent — no white on any tip. One layout note for the human: with a photo loaded
      the popup is 320x331, and at one pin position low in a 545px-tall map MapLibre chose
      `anchor-top` and the popup ran past the bottom of the viewport; panning the pin higher
      flipped it to `anchor-bottom` correctly.
- [x] `(auto)` On a popup anchored top-left, top-right, bottom-left or bottom-right, the corner nearest the
      tip renders square rather than 2px rounded — MapLibre's own rule won the cascade once the frame
      rules moved into the global stylesheet. Confirm it reads as intentional rather than clipped.
      Where: Vienna city page, popup corner nearest the tip  ·  How to get there: tap a pin near a
      map corner, so the popup takes a diagonal anchor
      **Verified 2026-09-13 (auto), each diagonal anchor genuinely produced.** `anchor-top-
      left` -> TL 0px with the other three 2px; `anchor-top-right` -> TR 0px; `anchor-bottom-
      left` -> BL 0px; `anchor-bottom-right` -> BR 0px; all four cardinal anchors -> 2px on
      every corner. The MapLibre rule won the cascade as intended. The driver notes 2px-vs-0px
      is sub-visible in a screenshot, so 'reads as intentional rather than clipped' remains a
      real-screen call.
- [x] `(auto)` `maplibre-gl` arrives as its own lazy request when the map route is opened, rather than in the
      initial page load. The chunk split is verified in the build output; that it really loads on
      demand in a browser is not.
      Where: Vienna city page  ·  How to get there: DevTools → Network → load app root, then open
      Vienna and watch for the maplibre chunk
      **Verified 2026-09-13 (auto).** At `/about` the page had 29 resources and zero maplibre
      requests; clicking the map nav pulled `chunk-I4U2MSQS.js` 37ms later (4,555,235 bytes,
      opening with the MapLibre GL JS v6.9.0 BSD banner), then `maplibre-gl-worker.mjs` and
      `maplibre-gl-shared.mjs`, both HTTP 200. Dev server only — the production chunk split is
      its own item.
- [x] `(auto)` The OSM / OpenMapTiles attribution is actually present on the live Vienna map (Task 8's item
      covers whether it is *legible*; this one covers whether it is there at all). It is a licence
      condition, so missing counts as failed.
      Where: Vienna city page, map bottom corner  ·  How to get there: app root → city list → Vienna
      **Verified 2026-09-13 (auto).** Present on the live Vienna map, bottom-right of the
      canvas, exact text `OpenFreeMap (c) OpenMapTiles Data from OpenStreetMap`.

---

## Map surface matches its documentation, and the No-White Rule holds with no exceptions (Task 11)

This task touched only `PRODUCT.md` and `DESIGN.md` (commit `016d6a7`) — no rendered code changed, so
nothing below is newly *reachable*, it's newly *described*. DESIGN.md's new "Map Surface (signature —
Vienna)" section was written from the style definition, the component templates and the stylesheets,
not from a running map, so it needs a human look on the actual screen. Most of what it describes — the
basemap wireframe, the road hierarchy, labels, road-width scaling, the pin glow, the amber selection
ring, the popup frame, the gallery's interactive behaviour, and the attribution control — is already
walked by the Task 4, 6, 8, 9 and 10 sections above; the items below are only the slices none of those
sections cover. The task also removed the No-White Rule's carve-out for map tiles, so the last item is
a fresh sweep now that the rule has no exception left.

- [ ] Water reads as a distinct near-black (`surface`) and parks/grass/wood as a slightly lighter
      near-black (`surface-raised`) — the two read apart from each other and from plain ground, not
      just the black-ground-vs-green-roads contrast Task 6's items already cover.
      Where: Vienna city page  ·  How to get there: app root → city list → Vienna, find a park or the
      riverbank
      **Measured 2026-09-13, NOT closed — the measurement says a human must look, and says it
      will be hard.** `gl.readPixels` at points classified by `queryRenderedFeatures` at
      z11.05: ground rgb(0,0,0), water rgb(10,15,10), parks/grass/wood rgb(13,22,13). Three
      distinct values really are there, but the contrast ratios are **parks:water 1.03**,
      parks:ground 1.13, water:ground 1.09. Also worth recording: water's `#0a0f0a` is NOT the
      `surface` token rgb(6,11,7), while landcover's `#0d160d` does equal `surface-raised`.
      **This is the measured form of the readability problem that Phase 2 of the roadmap now
      exists to fix.**
- [x] `(auto)` An `unclassified` spot's pin reads exactly like an `active` spot's — same lit phosphor color,
      same bloom, no third or intermediate treatment — because the style only branches on
      `demolished`. (Task 8's pin item already covers the demolished-vs-active dimming and the hit
      target; Task 9's already covers the amber selection ring on top of whichever base color a
      tapped pin has.)
      Where: Vienna city page  ·  How to get there: tap around the map and compare an unclassified
      spot's pin against a clearly-active one
      **Verified 2026-09-13 (auto).** The `spots-body` colour expression branches only on
      `demolished`, so `unclassified` falls through to `#00ff00`. Measured with all basemap
      layers hidden so pins sat on pure black: stollgasse and manny-pad (unclassified) centre
      rgb(0,255,0), identical to donaupark/schuhmeierplatz/wallenberg (active); glow rings
      matched within 5/255. Demolished for contrast: centre rgb(0,90,0). No third treatment
      exists.
- [ ] A demolished spot's popup shows a `> DEMOLISHED` line under the spot name, in unlit
      phosphor-dim with no glow; a standing spot's popup has no such line. (Task 9's and Task 10's
      popup items already cover the frame, close button and tip — this is the one popup element
      neither has walked. Branch review moved this line off amber, so an amber `> DEMOLISHED` is now
      a failure, not a pass.)
      Where: Vienna city page, popup body  ·  How to get there: tap a demolished spot's pin, then
      compare against a standing spot's popup
      **FAILED on-device, 2026-09-13 — severity medium.** The colour half holds: `p.spot-
      popup__status` renders `> DEMOLISHED` in rgb(0,191,53) (`--color-phosphor-dim`), not
      amber, and a standing spot has no such element. **But the 'no glow' half does not:
      computed `text-shadow` is `rgb(0,255,0) 0 0 2px, 0 0 4px, 0 0 6px` — identical to the
      spot name's bloom.** Cause confirmed in source: `.spot-popup__status` (`spot-
      popup.component.css:25`) sets `color` but never resets `text-shadow`, and `text-shadow`
      inherits — the ancestor `div.spot-popup` picks up `--glow-text-rest` from
      `styles.css:118-125`. The rule's own comment says the line 'carries phosphor-dim and
      drops the bloom instead', so this is the implementation missing its stated intent, not a
      spec question. Fix is one declaration: `text-shadow: none`. Evidence:
      `.devcycle/evidence/popup-demolished-line-anchor-bottom-with-photo.png`.
      **Fix committed 2026-09-13 (`14d8c44`), still unchecked pending a look.** `.spot-
      popup__status` now sets `text-shadow: none`, and a spec pins it — the suite reproduced
      the defect first, failing with exactly the computed value the browser showed. Left
      unchecked because what this item asks for is a human seeing the line sit unlit beneath
      the name.
- [x] `(auto)` The photo gallery panel itself reads as dark terminal chrome rather than a bare image well: a
      `surface`-dark background and a phosphor-green hairline border frame the 4:3 photo, and — with
      more than one photo — the ‹ › nav buttons show their own phosphor-deep border at rest, not only
      when focused. (Task 4's gallery items already cover cropping, focus rings, tap size, load flash,
      the counter and reduced motion — this is the static panel/button chrome none of them checked.)
      Where: spot photo gallery  ·  How to get there: Vienna map → tap a spot pin → popup gallery
      **Verified 2026-09-13 (auto).** `.gallery` 302x227 on rgb(6,11,7) with a 1px solid
      rgb(15,61,23) hairline and 2px radius; `.gallery__photo` exactly 300x225 (4:3) with
      `object-fit: cover` over a 1400x1050 source; `.gallery__nav--prev/--next` 44x44 on
      rgba(6,11,8,0.8) with a 1px solid rgb(3,104,25) border at rest and a 24px rgb(0,255,0)
      glyph; `.gallery__counter` `[1/7]` on rgba(6,11,8,0.8) in rgb(0,191,53).
- [x] `(auto)` Now that the No-White Rule has no map-tile carve-out, a fresh sweep turns up no white or
      near-white anywhere on the Vienna map: the MapLibre popup box and its tip, the attribution
      control (its background and the refilled info glyph), the loading overlay, and both failure
      overlays (`SIGNAL LOST // MAP UNREACHABLE` and `NO RENDERER // THIS BROWSER HAS NO WEBGL`).
      Where: Vienna city page  ·  How to get there: open a popup, throttle/block the network as in
      Tasks 6, 8 and 9's overlay items, and tap the attribution control's compact toggle along the way
      **Swept 2026-09-13, NOT closed — one judgment left, and it is genuinely a judgment.**
      111 colour samples across 78 visible elements (background, text, all four borders,
      outline, SVG fill/stroke, ::before/::after) found only 10 distinct colours;
      `gl.readPixels` over the full 1952x1090 drawing buffer inside the `render` event found a
      brightest pixel of rgb(0,255,0) and **zero pixels with all three channels above 200**.
      The loading overlay, the SIGNAL LOST surface and the no-renderer surface were each
      produced and swept: no white in any. **The single open call: the lightest colour on the
      page is rgb(181,254,182) — `--color-phosphor-bright`, used for the gallery arrow's
      hover/focus glyph. It is a pale mint, not #fff. Whether that counts as 'near-white'
      under a rule that now has no exceptions is a maintainer's ruling, not a measurement.**
      (Photographic content inside the 4:3 frame is bright by nature and is not chrome.)
      **Ruled 2026-09-13 and now closed.** The maintainer ruled that rgb(181,254,182)
      (`--color-phosphor-bright`) is phosphor, not near-white: it tops the green ramp at full
      saturation rather than being a near-white gray, so the rule does not reach it. Recorded
      in DESIGN.md next to the No-White Rule so a later sweep does not re-raise it. With that
      settled, the sweep's own measurements close the item.

## Branch review fixes (round 1)

Nine fixes landed after the whole-branch review, and between them they change what a walkthrough
has to look at. Two are load-bearing enough to do FIRST: before the worker fix, the map never
finished loading in either a built or a dev-served app, so every rendered item in every section
above was unreachable on a real device. Confirm the map paints at all, then walk the rest.

- [x] `(auto)` The map actually finishes loading and paints tiles under `ng serve` on the phone — pins over a
      real basemap, no `> SIGNAL LOST // MAP UNREACHABLE` after the watchdog. Before this fix the
      worker module 404'd and this always failed.
      Where: Vienna city page  ·  How to get there: `npm start` in spotmap-website/, open the dev
      server's LAN address on the phone, let the map settle for 20 seconds
      **Verified 2026-09-13, desktop Chrome only — no phone was available, so the phone half is
      unverified.** 10 of 10 loads whose tab received animation frames painted: `load` at ~1.2s,
      11 tile requests, 12 pins, no failure chrome; `maplibre-gl-worker.mjs` and
      `maplibre-gl-shared.mjs` both HTTP 200 on every load, so the old 404 is gone. The 4 failing
      loads in the same batch were all frame-starved background tabs, not an app fault: MapLibre
      fires `load` inside `Map._render()`, scheduled only through `requestAnimationFrame`, and
      `_render()` is also what requests tiles — a hidden tab that was frame-pumped by hand loaded
      normally, which isolates frames rather than visibility as the cause. Evidence:
      `.devcycle/evidence/map-raf-visibility-runs.tsv`, `.devcycle/evidence/map-vienna-load-observations.json`.
- [x] `(auto)` The same holds for the production build served under its deploy path — the artifact users
      actually get, not just the dev server.
      Where: Vienna city page  ·  How to get there: `npm run build:pages`, serve
      `dist/spotmap-website/browser` under a `/spotmap-website/` prefix, open it on the phone
      **Verified 2026-09-13 (auto) — the item's own assertion passes, and it flushed out a
      separate defect.** Served at `http://localhost:4300/spotmap-website/`: the map paints
      and reveals (overlay 310.7ms -> canvas 597.5 -> opacity 1 at 3171.2). `maplibre-gl-
      worker.mjs` 200 (19,311 B), `maplibre-gl-shared.mjs` 200 (513,545 B), maplibre chunk 200
      (1,068,864 B), `spots/vienna.geojson` 200, 11 openfreemap requests all 200, canvas 0
      white. **Separate defect found here, NOT part of this item: two 404s for `/fonts/ibm-
      plex-mono/*-400/500-normal.woff2`.** `src/styles.css:14,22,30` declare the webfont
      `url('/fonts/...')` root-absolute, but the files ship under `/spotmap-website/fonts/...`
      and `<base href>` does not apply to CSS `url()`. Reproduced with curl: root-absolute
      404, deploy-prefixed 200. On Pages every page falls back to a generic monospace. Carried
      as a finding.
      **Follow-up 2026-09-13 (`3d45f67`): the webfont 404 found here is fixed.** The fonts
      moved from public/ to src/ so the bundler emits them hashed under media/ and rewrites
      the url() relative; verified over HTTP against the rebuilt artifact — the stylesheet and
      the font it names both 200 under `/spotmap-website/`, and the dev server serves them
      too. A new deploy guard (`tools/verify-css-asset-urls.mjs`, wired into `build:pages`)
      rejected the pre-fix artifact by name before it passed the fixed one.
- [ ] Two fingers dragged straight up or down together never tilt the map — the ground stays flat,
      buildings and labels never skew into perspective. This is one asymmetric grip away from the
      pinch the user meant, so try it deliberately and sloppily.
      Where: Vienna city page  ·  How to get there: pinch-zoom normally first, then drag two fingers
      vertically without spreading them
- [ ] Two fingers twisted never rotate the map — north stays up — and one finger still pans while
      two fingers still pinch-zoom the map rather than the page.
      Where: Vienna city page  ·  How to get there: twist, then pan one-handed, then pinch
- [ ] With a hardware keyboard attached, arrow keys pan and `+`/`-` zoom, while `Shift`+arrow does
      nothing at all.
      Where: Vienna city page  ·  How to get there: pair a keyboard, focus the map canvas, try each
      **Measured 2026-09-13 synthetically, NOT closed — a real keyboard never reached the
      renderer.** OS-level key injection did not arrive at the page, so `KeyboardEvent`s were
      dispatched on the map canvas (the same entry into MapLibre's `KeyboardHandler`):
      ArrowRight lng 16.35873->16.39183 and ArrowUp lat 48.1979->48.21996, both with
      `defaultPrevented: true` and zoom/bearing/pitch untouched; `+` zoom 11.05->13.05; `-`
      13.05->12.05; **Shift+Arrow in all four directions changed centre, zoom, bearing and
      pitch not at all, with `defaultPrevented: false`** — the handler ignores them, which is
      the intent. The behaviour is right; 'with a real keyboard' still wants a human.
- [ ] Donaupark, the Prater, the Stadtpark and Schönbrunn read as a raised green-black against plain
      black ground — and the two blacks are still distinguishable outdoors in daylight, not just on a
      desk. Before this fix no park rendered at all.
      Where: Vienna city page  ·  How to get there: pan to Donaupark (a pilot spot), then the Prater
- [ ] The green does not read as busy or noisy at z14 in dense districts — the centre alone carries
      several hundred grass polygons.
      Where: Vienna city page  ·  How to get there: zoom to street level in the 1st district
- [ ] The four road tiers separate on a phone in sunlight: motorway and trunk brightest, down to
      service and track dimmest, with two of the four steps carried by opacity rather than hue.
      Where: Vienna city page  ·  How to get there: find a motorway, a main road and a side street in
      one screen, outdoors
- [ ] Footways, steps, cycleways, plazas and piers read as a dashed texture and tram/rail as dotted
      hairlines — there to navigate by, never mistaken for streets — at z14 through z16.
      Where: Vienna city page  ·  How to get there: zoom into a pedestrian zone and a tram corridor
- [ ] The casing under the major roads helps them read rather than muddying the wireframe at z12–z14.
      Where: Vienna city page  ·  How to get there: zoom out to city level
- [x] `(auto)` On a browser profile with WebGL 2 disabled, `> NO RENDERER // THIS BROWSER HAS NO WEBGL`
      appears immediately with no RETRY — not a 15-second spinner followed by a retry that cannot
      work.
      Where: Vienna city page  ·  How to get there: disable WebGL 2 in the browser's flags, reload
      **Verified 2026-09-13 (auto), with one disclosure.** Produced by denying webgl contexts
      in-page rather than by a real `chrome://flags` profile — the app's probe receives the
      identical signal. Surface appeared **426.5ms** after the denial, not after a 15-second
      spinner, with **zero RETRY buttons**. Text as shipped: `> NO RENDERER // THIS BROWSER
      CANNOT DRAW THE MAP`.
- [x] `(auto)` With the maplibre chunk blocked, `> SIGNAL LOST // MAP UNREACHABLE` and `> RETRY` appear
      promptly rather than only after the watchdog elapses.
      Where: Vienna city page  ·  How to get there: block the maplibre chunk in devtools, reload
      **Verified 2026-09-13 (auto).** A temporary service worker on the production origin
      rejected the maplibre chunk (registered, then unregistered and deleted afterwards).
      Console `TypeError: Failed to fetch dynamically imported module` at 184.2ms; `> SIGNAL
      LOST // MAP UNREACHABLE` + `> RETRY` at 192.2ms — **72.7ms after the loading overlay
      appeared, against a 15000ms watchdog.** Prompt, as the item requires.
- [ ] With the glyph endpoint blocked, the labels vanish but the map still paints — and the error is
      visible in the console rather than silently swallowed.
      Where: Vienna city page  ·  How to get there: block `tiles.openfreemap.org/fonts/*`, reload,
      watch the console
      **Measured 2026-09-13, NOT closed — the item's premise did not reproduce, and the real
      outcome needs a ruling.** With all 11 `fonts/*` requests blocked the map painted and
      revealed at 2595.5ms with no failure surface, and 151 console errors were visible rather
      than swallowed (`Unable to load glyph range 0, 0-255. Rendering codepoint U+0045 locally
      instead.`). **But the labels did not vanish: 82 still rendered (61 place, 21 street)
      through MapLibre's local-glyph fallback.** That is arguably a better outcome than the
      item predicted, but it silently changes the map's typeface away from Noto Sans. Whether
      the fallback is acceptable is a maintainer's call.
- [ ] A tapped demolished pin shows amber in exactly one role on screen — the selection ring — and
      the unlit `> DEMOLISHED` line is still legible in sunlight despite having no glow.
      Where: Vienna city page, popup body  ·  How to get there: tap one of the four demolished pins,
      outdoors
- [ ] `> DIRECTIONS` opens the device's maps app on BOTH iOS Safari and Android Chrome, landing on
      the right spot. The previous `geo:` link did nothing on iOS, so test iOS specifically.
      Where: spot popup  ·  How to get there: tap a pin, then `> DIRECTIONS`, on each platform
- [ ] With the system "Reduce Motion" setting on, the opening view cuts straight to the spots instead
      of easing into place over about half a second.
      Where: Vienna city page  ·  How to get there: enable Reduce Motion in system settings, reload
- [ ] The About page reads true: Vienna's map is the site's own, the other cities still run on the
      Google embed, and the voice still sounds like the rest of the page.
      Where: About page  ·  How to get there: `ⓘ About` from the nav
      **Measured 2026-09-13, NOT closed — voice is the human half.** Every checkable claim
      holds against this build: 'vienna's map is ours now, no embed involved' — Vienna renders
      `app-spot-map` with a MapLibre canvas and no iframe; 'everywhere else still runs on a
      Google My Maps embed' — `config.ts` sets 15 of 15 to `GoogleMyMaps`, walked in-browser
      for 4 of them; 'vienna's first twelve' — the geojson holds exactly 12 features. Whether
      it still sounds like the rest of the page is yours.
## Branch review fixes (round 2)

A second review round re-checked the first round's fixes and found more. These items cover what
changed as a result: the directions link no longer replaces the archive, tunnels of every class
came off the basemap while elevated transit went back on, and the no-renderer message was
rewritten for people who do not know what WebGL is.

- [ ] After the first deploy with these changes, the live Pages site loads its map with no
      `maplibre-gl-worker.mjs` 404 in the network log. The build guard proves the file is
      emitted next to the chunk that asks for it; only the deployed site proves it is delivered
      under the `/spotmap-website/` base path.
      Where: the deployed site  ·  How to get there: open the Pages URL on the phone with the
      network log recording
- [ ] The `> NO RENDERER // THIS BROWSER CANNOT DRAW THE MAP` line does not wrap badly on a
      narrow phone — it is 48 characters against the 31 of `> SIGNAL LOST // MAP UNREACHABLE`,
      so it is the longest phosphor message the failure surfaces carry.
      Where: Vienna city page  ·  How to get there: disable WebGL 2 in the browser's flags,
      reload, look at it in portrait on the narrowest phone available
      **Measured 2026-09-13, NOT closed — 'badly' is the look call.** At 390x844 the line
      resolves to font-size 14.4px (the clamp floor; desktop resolves to 18px), line-height
      20.16px, and occupies **2 line boxes wrapping at a word boundary**: `> NO RENDERER //
      THIS BROWSER` (284px) / `CANNOT DRAW THE MAP` (186.1px) in 294px available. **No
      overflow anywhere** — element 294/294, container 342/342, document 390/390. Evidence:
      `.devcycle/evidence/b2-406-no-renderer-390px.png`.
- [ ] `> DIRECTIONS` leaves the archive standing: on an iPhone whose maps app is Apple Maps, and
      on an Android without Google Maps, the map, its open popup and the amber selection ring
      are all still there when you come back. On a phone that does have Google Maps, the app
      still opens. On iOS Safari specifically, check the new tab is not suppressed as a pop-up.
      Where: spot popup  ·  How to get there: tap a pin, then `> DIRECTIONS`, on each device
- [ ] Vienna's elevated U6 viaduct reads as dashed track along the Gürtel, and the U4 along the
      Wienfluss likewise — landmarks to navigate by rather than noise. Road tunnels now stop at
      the portal, so check the A23 and the Kaisermühlentunnel still read as a navigable network,
      and that no underpass a skater actually rolls through went missing with them.
      Where: Vienna city page  ·  How to get there: pan along the Gürtel at z13 and above, then
      out to the A23
      **Measured 2026-09-13, NOT closed — and it raises a question worth answering.** The
      elevated geometry is there: at the Guertel (z14.5) 12 rail features render including
      `class=transit subclass=subway brunnel=bridge` — the U6 viaduct — plus surface subway
      and tram; at the Wienfluss, 7 features including `transit/subway`. Tunnels are uniformly
      dropped (zero tunnel-tagged features render at any class) while the loaded tiles carry
      path/tunnel 221, service/tunnel 65, transit/tunnel 25, minor/tunnel 21, rail/tunnel 6,
      primary/tunnel 4. The A23 interchange stays continuous. **Open for a human: computed
      line width at z14.5 is 0.51px at 50% opacity — whether that 'reads as dashed track' as a
      landmark is a real-screen call; and whether dropping 221 tunnel-tagged `path` features
      in one viewport removed underpasses a skater actually rolls through.** Evidence:
      `.devcycle/evidence/guertel-u6-z14_5.png`, `.../wienfluss-u4-z14_5.png`,
      `.../a23-suedosttangente-z13_5.png`.
- [ ] The About credits block reads right with three prompt lines where it had two — its rhythm
      against the neighbouring blocks is a look call the suite cannot make.
      Where: About page  ·  How to get there: `ⓘ About` from the nav, scroll to CREDITS
      **Measured 2026-09-13, NOT closed — rhythm is exactly the look call the item reserves.**
      CREDITS now renders **3 prompt lines where `main` has 2**, and all four About blocks are
      at 3 lines each; block heights 171 / 243 / 219 / 195px with a uniform 23px gap and 24px
      line-height. Evidence: `.devcycle/evidence/b2-422-about-credits-block.jpg`.
